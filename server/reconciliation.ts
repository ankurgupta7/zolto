/**
 * Stripe payment reconciliation — PER TENANT, on the merchant's own account.
 *
 * Compares payments Stripe says succeeded against our own records (`orders`
 * for web checkout, `pos_orders` for the in-person card terminal). Any Stripe
 * payment with no local counterpart gets a best-guess shortlist of in-stock
 * products (ranked by how close their price is to the amount charged) and is
 * recorded in `stripe_reconciliations`. The merchant is emailed the shortlist
 * and picks a match (or "none of these") via a one-click link — see
 * `reconciliationRoutes.ts`. Inventory is only touched once they confirm a
 * match; this job never mutates stock itself.
 *
 * Each tenant's storefront and POS charges are DIRECT charges on their own
 * Stripe Connect account (server/stripeConnect.ts) — Zolto never holds their
 * money. So reconciliation has to read that account, via `{ stripeAccount }`
 * on the platform client. This job previously scanned the PLATFORM account
 * and matched everything against the default tenant's catalogue, which meant
 * it could not see a single real merchant payment.
 */

import crypto from "node:crypto";
import type Stripe from "stripe";
import {
  createStripeReconciliation,
  getAvailableProductsForMatching,
  getKnownOrderPaymentIntentIds,
  getKnownPosPaymentIntentIds,
  getKnownReconciliationPaymentIntentIds,
  getTenantsWithConnectedStripe,
} from "./db";
import {
  type ReconciliationReviewItem,
  sendReconciliationReviewEmail,
} from "./_core/email";
import { getStripe } from "./stripe";
import { getTenantAdminContact, getTenantSettings } from "./db";
import type { Product } from "../drizzle/schema";

export const RECONCILIATION_LOOKBACK_DAYS_DEFAULT = 30;
export const MAX_CANDIDATES = 3;
// Safety cap so a manual run can't run away scanning years of history.
const MAX_PAYMENT_INTENTS_SCANNED = 500;

export function generateConfirmationToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * Ranks in-stock products by how close their price is to the amount charged
 * (closest first, ties broken by newest listing first) and returns the top
 * candidates.
 */
export async function findCandidateProducts(
  tenantId: number,
  amountRappen: number,
): Promise<Product[]> {
  const available = await getAvailableProductsForMatching(tenantId);
  const priceDiff = (p: Product) =>
    Math.abs(Math.round(Number(p.price) * 100) - amountRappen);

  return [...available]
    .sort((a, b) => {
      const diff = priceDiff(a) - priceDiff(b);
      if (diff !== 0) return diff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    })
    .slice(0, MAX_CANDIDATES);
}

export interface ReconciliationSummary {
  /** Successful Stripe payments found within the lookback window. */
  scannedSucceededPayments: number;
  /** Of those, how many already exist in `orders`, `pos_orders`, or a prior run. */
  alreadyRecorded: number;
  /** Newly detected payments with at least one candidate product, awaiting review. */
  newPendingReview: number;
  /** Newly detected payments with no in-stock product close enough to guess. */
  newNoCandidates: number;
  /** Whether the review email was sent (false if nothing needed review, or sending failed). */
  emailSent: boolean;
}

export class NotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConnectedError";
  }
}

/**
 * Reconcile ONE tenant against their own connected Stripe account.
 *
 * Throws NotConnectedError when the tenant has never linked Stripe — there is
 * simply no account to read, and that is a normal state (in-person-only
 * merchants may never connect one), not a fault.
 */
export async function runStripeReconciliationForTenant(
  tenant: {
    id: number;
    name: string;
    slug: string;
    stripeConnectedAccountId: string | null;
  },
  lookbackDays: number = RECONCILIATION_LOOKBACK_DAYS_DEFAULT,
): Promise<ReconciliationSummary> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  if (!tenant.stripeConnectedAccountId) {
    throw new NotConnectedError(
      "This store hasn't connected a Stripe account yet, so there are no payments to reconcile.",
    );
  }

  // Every request below is made AS the connected account. Without this the
  // job reads Zolto's own platform account and sees none of the merchant's
  // money — which is exactly what it used to do.
  const asTenant = { stripeAccount: tenant.stripeConnectedAccountId };
  const sinceUnix = Math.floor(Date.now() / 1000) - lookbackDays * 86400;

  const [orderIds, posIds, reconciledIds] = await Promise.all([
    getKnownOrderPaymentIntentIds(tenant.id),
    getKnownPosPaymentIntentIds(tenant.id),
    getKnownReconciliationPaymentIntentIds(tenant.id),
  ]);
  const known = new Set<string>([
    ...Array.from(orderIds),
    ...Array.from(posIds),
    ...Array.from(reconciledIds),
  ]);

  let scannedSucceededPayments = 0;
  let alreadyRecorded = 0;
  const unmatched: Stripe.PaymentIntent[] = [];

  const list = stripe.paymentIntents.list(
    { created: { gte: sinceUnix }, limit: 100 },
    asTenant,
  );

  let iterated = 0;
  for await (const intent of list) {
    iterated++;
    if (iterated > MAX_PAYMENT_INTENTS_SCANNED) break;
    if (intent.status !== "succeeded") continue;

    scannedSucceededPayments++;
    if (known.has(intent.id)) {
      alreadyRecorded++;
      continue;
    }
    unmatched.push(intent);
  }

  let newPendingReview = 0;
  let newNoCandidates = 0;
  const reviewItems: ReconciliationReviewItem[] = [];

  for (const intent of unmatched) {
    // Matched against THIS tenant's catalogue — the payment came off their
    // account, so any candidate can only sensibly be one of their pieces.
    const candidates = await findCandidateProducts(tenant.id, intent.amount);
    const token = generateConfirmationToken();
    const status = candidates.length > 0 ? "pending_review" : "no_candidates";
    const paymentMethodType = Array.isArray(intent.payment_method_types)
      ? (intent.payment_method_types[0] ?? null)
      : null;

    await createStripeReconciliation({
      // Explicit rather than relying on withTenant's default: a row filed
      // against the wrong store would offer one merchant another's products
      // to match, and the confirm route trusts this column
      // (server/reconciliationRoutes.ts).
      tenantId: tenant.id,
      stripePaymentIntentId: intent.id,
      amountRappen: intent.amount,
      currency: intent.currency,
      stripeCreatedAt: new Date(intent.created * 1000),
      description: intent.description ?? null,
      paymentMethodType,
      status,
      candidateProductIds: candidates.map((p) => p.id).join(","),
      confirmationToken: token,
    });

    if (status === "pending_review") {
      newPendingReview++;
      reviewItems.push({
        paymentIntentId: intent.id,
        amountRappen: intent.amount,
        currency: intent.currency,
        stripeCreatedAt: new Date(intent.created * 1000),
        candidates: candidates.map((p) => ({
          id: p.id,
          name: p.name,
          nameEn: p.nameEn ?? null,
          price: p.price,
        })),
        token,
      });
    } else {
      newNoCandidates++;
    }
  }

  let emailSent = false;
  if (reviewItems.length > 0) {
    try {
      // Goes to the MERCHANT, not the platform operator: these are their
      // payments and only they can say which piece was sold.
      const [contact, settings] = await Promise.all([
        getTenantAdminContact(tenant.id),
        getTenantSettings(tenant.id),
      ]);
      await sendReconciliationReviewEmail(reviewItems, {
        tenantName: settings?.whiteLabelName ?? tenant.name,
        tenantDomain:
          settings?.publicDomain ??
          process.env.PUBLIC_BASE_URL ??
          "https://zolto.ch",
        contactEmail: settings?.contactEmail ?? undefined,
        to: contact?.email ?? undefined,
      });
      emailSent = true;
    } catch (err) {
      console.error("[Reconciliation] Failed to send review email:", err);
    }
  }

  return {
    scannedSucceededPayments,
    alreadyRecorded,
    newPendingReview,
    newNoCandidates,
    emailSent,
  };
}

export interface PlatformReconciliationSummary {
  /** Tenants with a connected Stripe account that were scanned. */
  tenantsScanned: number;
  /** Tenants whose scan threw — recorded rather than aborting the sweep. */
  tenantsFailed: number;
  /** Per-tenant results, newest tenant id last. */
  perTenant: Array<
    { tenantId: number; slug: string; name: string } & (
      | ({ ok: true } & ReconciliationSummary)
      | { ok: false; error: string }
    )
  >;
  /** Totals across every tenant that succeeded. */
  totals: Omit<ReconciliationSummary, "emailSent"> & { emailsSent: number };
}

/**
 * Platform-wide sweep: reconcile every tenant that has connected Stripe, each
 * against their own account. Superadmin-only — it crosses tenants by design.
 *
 * One tenant's failure (revoked Connect grant, Stripe outage) must not abort
 * the others, so failures are collected per tenant instead of thrown.
 */
export async function runStripeReconciliationForAllTenants(
  lookbackDays: number = RECONCILIATION_LOOKBACK_DAYS_DEFAULT,
): Promise<PlatformReconciliationSummary> {
  const tenants = await getTenantsWithConnectedStripe();
  const perTenant: PlatformReconciliationSummary["perTenant"] = [];
  const totals = {
    scannedSucceededPayments: 0,
    alreadyRecorded: 0,
    newPendingReview: 0,
    newNoCandidates: 0,
    emailsSent: 0,
  };
  let tenantsFailed = 0;

  for (const t of tenants) {
    try {
      const r = await runStripeReconciliationForTenant(t, lookbackDays);
      perTenant.push({
        tenantId: t.id,
        slug: t.slug,
        name: t.name,
        ok: true,
        ...r,
      });
      totals.scannedSucceededPayments += r.scannedSucceededPayments;
      totals.alreadyRecorded += r.alreadyRecorded;
      totals.newPendingReview += r.newPendingReview;
      totals.newNoCandidates += r.newNoCandidates;
      if (r.emailSent) totals.emailsSent += 1;
    } catch (err) {
      tenantsFailed++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[Reconciliation] Tenant ${t.id} (${t.slug}) failed: ${message}`,
      );
      perTenant.push({
        tenantId: t.id,
        slug: t.slug,
        name: t.name,
        ok: false,
        error: message,
      });
    }
  }

  return {
    tenantsScanned: tenants.length,
    tenantsFailed,
    perTenant,
    totals,
  };
}
