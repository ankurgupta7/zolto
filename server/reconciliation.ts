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
 * Stripe Connect account (server/stripeConnect.ts) — Gwinn never holds their
 * money. So reconciliation has to read that account, via `{ stripeAccount }`
 * on the platform client. This job previously scanned the PLATFORM account
 * and matched everything against the default tenant's catalogue, which meant
 * it could not see a single real merchant payment.
 */

import { BRAND } from "@shared/brand";
import crypto from "node:crypto";
import type Stripe from "stripe";
import {
  createStripeReconciliation,
  getAvailableProductsForMatching,
  getKnownOrderPaymentIntentIds,
  getKnownPosPaymentIntentIds,
  getKnownReconciliationPaymentIntentIds,
  extendReviewTokenExpiry,
  getPendingStripeReconciliations,
  getTenantsWithConnectedStripe,
} from "./db";
import { resolveStoredCandidates } from "./pendingReview";
import { reviewTokenExpiry } from "./reviewToken";
import {
  buildReconciliationReviewHtml,
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
// Ceiling on how many outstanding items one email (or one in-app review panel)
// carries. Everything above it stays pending and comes back on the next run.
export const MAX_REVIEW_ITEMS = 50;

export function generateConfirmationToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

/**
 * `tenant_settings.publicDomain` is stored bare ("aurora.example"), and the
 * confirm links are built by concatenation. Without a scheme the href is a
 * relative path, which resolves against whatever document happens to be
 * showing the review — nowhere useful from an inbox, and the wrong origin in
 * the admin console's frame.
 */
export function toBaseUrl(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
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
  /**
   * Payments recorded by an EARLIER run that are still unconfirmed, and so are
   * included in this run's review again. Re-running is deliberately not a
   * no-op: the first run's email may never have arrived.
   */
  stillPendingReview: number;
  /** Everything in this run's review — `newPendingReview` + `stillPendingReview`. */
  totalPendingReview: number;
  /** Whether the review email was actually delivered to Resend. */
  emailSent: boolean;
  /** Why it wasn't, when it wasn't — unset key, no recipient, API error. */
  emailError: string | null;
  /**
   * The review email's own HTML, handed back when it could not be sent so the
   * admin console can render it and the merchant can click the same one-click
   * links in-app. Null when the email went out (or there was nothing to send).
   */
  reviewHtml: string | null;
}

/**
 * Rebuilds review items for reconciliations an earlier run already filed and
 * nobody has confirmed yet, skipping the ones this run just created.
 *
 * `choiceIndex` is carried through deliberately: the confirm route indexes into
 * the row's stored `candidateProductIds` (server/reconciliationRoutes.ts), so a
 * candidate whose product has since been deleted has to leave its slot behind
 * rather than shift every later link onto the wrong piece.
 */
async function collectStillPendingReviewItems(
  tenantId: number,
  freshItems: ReconciliationReviewItem[],
): Promise<ReconciliationReviewItem[]> {
  const rows = await getPendingStripeReconciliations(
    tenantId,
    MAX_REVIEW_ITEMS,
  );
  const fresh = new Set(freshItems.map((i) => i.paymentIntentId));
  const older = rows.filter((r) => !fresh.has(r.stripePaymentIntentId));
  if (older.length === 0) return [];

  const candidatesByRow = await resolveStoredCandidates(tenantId, older);

  const items = older
    .map((row, i) => ({
      id: row.id,
      paymentIntentId: row.stripePaymentIntentId,
      amountRappen: row.amountRappen,
      currency: row.currency,
      stripeCreatedAt: row.stripeCreatedAt,
      candidates: candidatesByRow[i],
      token: row.confirmationToken,
    }))
    // Every candidate piece has since been deleted, so there is nothing left to
    // assign the payment to. It stays pending for manual handling. A null token
    // means the row was decided between the two queries — nothing left to ask.
    .filter(
      (item): item is typeof item & { token: string } =>
        item.candidates.length > 0 && item.token !== null,
    );

  // This run is putting these links in front of the merchant again, so their
  // clock restarts today. Without this, a re-sent email would carry a link
  // measured from the day the payment was first detected — often already dead.
  await extendReviewTokenExpiry(
    "stripe_reconciliations",
    tenantId,
    items.map((item) => item.id),
    reviewTokenExpiry(),
  );

  return items.map(({ id: _id, ...item }) => item);
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
  // job reads Gwinn's own platform account and sees none of the merchant's
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
      // The mailed link is a bearer credential, so it gets a lifetime from the
      // moment it is issued (server/reviewToken.ts).
      tokenExpiresAt: reviewTokenExpiry(),
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

  // Anything an earlier run filed and nobody confirmed goes back in the
  // envelope. Pressing the button twice is not a mistake to guard against —
  // the first email may have bounced, or never been sent at all — and these
  // payments are exactly the ones the scan above skipped as "already recorded".
  const stillPending = await collectStillPendingReviewItems(
    tenant.id,
    reviewItems,
  );
  // Newly detected payments first, so a long backlog can never crowd out what
  // this run just found. The remainder stays pending for the next run.
  const outstanding = [...reviewItems, ...stillPending].slice(
    0,
    MAX_REVIEW_ITEMS,
  );

  let emailSent = false;
  let emailError: string | null = null;
  let reviewHtml: string | null = null;

  if (outstanding.length > 0) {
    // Goes to the MERCHANT, not the platform operator: these are their
    // payments and only they can say which piece was sold.
    const [contact, settings] = await Promise.all([
      getTenantAdminContact(tenant.id),
      getTenantSettings(tenant.id),
    ]);
    const branding = {
      tenantName: settings?.whiteLabelName ?? tenant.name,
      tenantDomain: toBaseUrl(
        settings?.publicDomain ??
          process.env.PUBLIC_BASE_URL ??
          BRAND.url,
      ),
      contactEmail: settings?.contactEmail ?? undefined,
      to: contact?.email ?? undefined,
    };

    try {
      const result = await sendReconciliationReviewEmail(outstanding, branding);
      emailSent = result.sent;
      emailError = result.sent ? null : result.reason;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
    }

    if (!emailSent) {
      console.error(
        `[Reconciliation] Review email not delivered for tenant ${tenant.id}: ${emailError}`,
      );
      // The merchant still has to be able to act on these, so hand the caller
      // the very same page the email would have carried — same tokens, same
      // one-click links — for the admin console to render in place.
      reviewHtml = buildReconciliationReviewHtml(outstanding, branding);
    }
  }

  return {
    scannedSucceededPayments,
    alreadyRecorded,
    newPendingReview,
    newNoCandidates,
    stillPendingReview: Math.max(0, outstanding.length - reviewItems.length),
    totalPendingReview: outstanding.length,
    emailSent,
    emailError,
    reviewHtml,
  };
}

export interface PlatformReconciliationSummary {
  /** Tenants with a connected Stripe account that were scanned. */
  tenantsScanned: number;
  /** Tenants whose scan threw — recorded rather than aborting the sweep. */
  tenantsFailed: number;
  /**
   * Per-tenant results, newest tenant id last. `reviewHtml` is dropped: this
   * is an operator report over every store, and the review page belongs to the
   * merchant whose console can render it, not in a sweep's JSON. `emailError`
   * stays, so a store whose mail is misconfigured is visible from here.
   */
  perTenant: Array<
    { tenantId: number; slug: string; name: string } & (
      | ({ ok: true } & Omit<ReconciliationSummary, "reviewHtml">)
      | { ok: false; error: string }
    )
  >;
  /** Totals across every tenant that succeeded. */
  totals: {
    scannedSucceededPayments: number;
    alreadyRecorded: number;
    newPendingReview: number;
    newNoCandidates: number;
    stillPendingReview: number;
    totalPendingReview: number;
    emailsSent: number;
  };
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
    stillPendingReview: 0,
    totalPendingReview: 0,
    emailsSent: 0,
  };
  let tenantsFailed = 0;

  for (const t of tenants) {
    try {
      const { reviewHtml: _reviewHtml, ...r } =
        await runStripeReconciliationForTenant(t, lookbackDays);
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
      totals.stillPendingReview += r.stillPendingReview;
      totals.totalPendingReview += r.totalPendingReview;
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
