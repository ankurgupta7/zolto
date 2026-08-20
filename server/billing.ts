/**
 * Gwinn's own subscription billing — charging MERCHANTS for the Pro plan
 * (free / pro, see shared/platform.ts PLANS).
 *
 * This is entirely separate from storefront payments: a tenant's customers
 * pay into the tenant's own Stripe account via Connect (server/stripeConnect.ts);
 * everything here runs on Gwinn's own (platform) Stripe account against the
 * tenant's stripeCustomerId / stripeSubscriptionId. The Free plan's 1%
 * online/agent fee is not billed here at all — it's a Stripe Connect
 * application fee taken per direct charge (server/routers/checkout.ts).
 *
 * Required env vars (in addition to STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET):
 *   STRIPE_PRICE_PRO – Stripe Price id (price_...) for Pro, CHF 25/mo
 *
 * Events are delivered to the existing platform webhook (/api/stripe/webhook);
 * server/stripe.ts delegates billing-shaped events to handleBillingEvent below.
 */

import { BRAND } from "@shared/brand";
import type Stripe from "stripe";
import { type PlatformPlan } from "@shared/platform";
import {
  getTenantById,
  getTenantByStripeCustomerId,
  getTenantByStripeSubscriptionId,
  markSiteImportPaid,
  updateTenantBilling,
} from "./db";
import type { Tenant } from "../drizzle/schema";
import { getStripe } from "./stripe";

/** Paid plan ids, as both the DB enum and shared/platform.ts PLANS name them. */
export type PaidPlanId = Exclude<PlatformPlan["id"], "free">;

/** plan id → Stripe Price env var. Only sellable plans belong here. */
const PRICE_ENV: Record<PaidPlanId, string> = {
  pro: "STRIPE_PRICE_PRO",
};

function priceIdForPlan(plan: PaidPlanId): string | null {
  return process.env[PRICE_ENV[plan]] || null;
}

/**
 * Inverse lookup: Stripe Price id → plan id (used by webhook sync).
 *
 * There is deliberately no mapping for the retired pre-pivot tiers
 * (maker/studio/atelier). Migration 0008 remapped the plan enum, but Gwinn
 * had no paying tenants at the time and still has none — the grandfathering
 * machinery that used to live here was built for a population that never
 * existed. Retired tiers also cannot be sold: PRICE_ENV holds only `pro`.
 */
export function planForPriceId(priceId: string): PaidPlanId | null {
  for (const plan of Object.keys(PRICE_ENV) as PaidPlanId[]) {
    if (process.env[PRICE_ENV[plan]] === priceId) return plan;
  }
  return null;
}

export function isBillingConfigured(): boolean {
  return (Object.keys(PRICE_ENV) as PaidPlanId[]).every((p) =>
    Boolean(priceIdForPlan(p)),
  );
}

function resolveBaseUrl(req?: { headers?: { origin?: string } }): string {
  const fromEnv = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const origin = req?.headers?.origin;
  if (origin) return origin.replace(/\/$/, "");
  return "http://localhost:3000";
}

// Metadata keys marking a Checkout Session as billing (ours) rather than a
// tenant storefront order (which server/stripe.ts fulfillOrder handles).
// "photo_credits" survives only as a recognized-but-retired kind so a stale
// pre-pivot checkout completing after deploy is logged instead of crashing.
const META_KIND = "platformBilling";
const KIND_PLAN = "plan_subscription";
const KIND_PHOTO_CREDITS = "photo_credits";
/** The one-time switch-in import (shared/platform.ts SITE_IMPORT). */
const KIND_SITE_IMPORT = "site_import";

/** Does this Checkout Session belong to platform billing, not a storefront? */
export function isBillingSession(session: Stripe.Checkout.Session): boolean {
  return Boolean(
    (session.metadata as Record<string, string> | null)?.[META_KIND],
  );
}

/**
 * Create a subscription Checkout Session for a plan upgrade. The tenant's
 * existing Stripe customer is reused so payment methods and history stay in
 * one place; the 14-day trial only applies to tenants who have never had a
 * subscription (trialEndsAt is set at signup).
 */
export async function createPlanCheckoutSession(params: {
  tenant: Tenant;
  plan: PaidPlanId;
  req?: { headers?: { origin?: string } };
}): Promise<{ url: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const priceId = priceIdForPlan(params.plan);
  if (!priceId) {
    throw new Error(
      `Billing is not configured for plan "${params.plan}" (${PRICE_ENV[params.plan]} unset)`,
    );
  }
  if (!params.tenant.stripeCustomerId) {
    throw new Error("Tenant has no Stripe customer — contact support");
  }

  const base = resolveBaseUrl(params.req);
  const alreadySubscribed = Boolean(params.tenant.stripeSubscriptionId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: params.tenant.stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    // Trial only on the first subscription; upgrading later bills immediately.
    subscription_data: alreadySubscribed
      ? { metadata: { tenantId: String(params.tenant.id) } }
      : {
          trial_period_days: 14,
          metadata: { tenantId: String(params.tenant.id) },
        },
    metadata: {
      [META_KIND]: KIND_PLAN,
      tenantId: String(params.tenant.id),
      plan: params.plan,
    },
    success_url: `${base}/admin/billing?upgraded=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/admin/billing?cancelled=1`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url };
}

/**
 * Create a ONE-TIME Checkout Session for the switch-in site import.
 *
 * `mode: "payment"`, not "subscription" — this is the only thing on the platform
 * priced per action, and it must never become a recurring line on a merchant's
 * card. shared/platform.ts SITE_IMPORT states the rule it lives under.
 *
 * Priced inline with `price_data` rather than from a Stripe Price env var: the
 * amount is CHF 20 stated in shared/platform.ts, and a deployment that has
 * Stripe configured at all can sell this without an operator first minting a
 * Price object and setting yet another env var.
 *
 * `siteImportId` rides in metadata so the webhook can mark exactly this import
 * paid — the merchant may have several previews open.
 */
export async function createSiteImportCheckoutSession(params: {
  tenant: Tenant;
  siteImportId: number;
  priceChf: number;
  productCount: number;
  req?: { headers?: { origin?: string } };
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  if (!params.tenant.stripeCustomerId) {
    throw new Error("Tenant has no Stripe customer — contact support");
  }

  const base = resolveBaseUrl(params.req);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: params.tenant.stripeCustomerId,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "chf",
          unit_amount: Math.round(params.priceChf * 100),
          product_data: {
            name: `${BRAND.name} shop import`,
            // What they are buying, in the receipt, in their own terms.
            description: `One-time import of ${params.productCount} products from your existing site`,
          },
        },
      },
    ],
    metadata: {
      [META_KIND]: KIND_SITE_IMPORT,
      tenantId: String(params.tenant.id),
      siteImportId: String(params.siteImportId),
    },
    // The Import hub's real route (client/src/admin/nav.ts) — a merchant
    // returning from Stripe must land back on the card they left, not a 404.
    success_url: `${base}/admin/products/import?imported=${params.siteImportId}`,
    cancel_url: `${base}/admin/products/import?cancelled=${params.siteImportId}`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL");
  return { url: session.url, sessionId: session.id };
}

// ─── Webhook event handling ───────────────────────────────────────────────────

async function handlePlanCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const meta = session.metadata as Record<string, string>;
  const tenantId = parseInt(meta.tenantId, 10);
  const plan = meta.plan as PaidPlanId;
  if (!Number.isFinite(tenantId) || !PRICE_ENV[plan]) {
    console.warn("[Billing] Plan checkout completed with bad metadata:", meta);
    return;
  }
  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    console.warn(`[Billing] Plan checkout for unknown tenant ${tenantId}`);
    return;
  }
  await updateTenantBilling(tenantId, {
    plan,
    stripeSubscriptionId:
      typeof session.subscription === "string"
        ? session.subscription
        : (session.subscription?.id ?? tenant.stripeSubscriptionId),
    subscriptionStatus: "trialing", // subscription_data.trial_period_days
  });
  console.info(`[Billing] Tenant ${tenantId} upgraded to ${plan}`);
}

/**
 * Mark a site import paid. The ONLY writer of `site_imports.status = "paid"` —
 * the client never gets to assert it has paid, it asks Stripe and Stripe tells
 * us.
 *
 * Idempotent by the status transition itself (markSiteImportPaid only moves a
 * row out of `previewed`), because Stripe retries webhooks and delivers
 * `checkout.session.completed` and `async_payment_succeeded` for the same
 * purchase. Charging once but importing twice would duplicate a merchant's
 * whole catalogue.
 */
async function handleSiteImportCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const meta = session.metadata as Record<string, string>;
  const siteImportId = parseInt(meta.siteImportId, 10);
  const tenantId = parseInt(meta.tenantId, 10);
  if (!Number.isFinite(siteImportId) || !Number.isFinite(tenantId)) {
    console.warn("[Billing] Site-import checkout with bad metadata:", meta);
    return;
  }
  // Scoped by tenant as well as id: a metadata id is attacker-influenced in
  // principle, and this is the one place money turns into a write.
  const moved = await markSiteImportPaid({
    id: siteImportId,
    tenantId,
    amountCents: session.amount_total ?? null,
    currency: session.currency?.toUpperCase() ?? null,
  });
  console.info(
    moved
      ? `[Billing] Site import ${siteImportId} paid for tenant ${tenantId}`
      : `[Billing] Site import ${siteImportId} already past preview — ignoring replayed payment`,
  );
}

async function handleSubscriptionUpdated(
  subscription: Stripe.Subscription,
): Promise<void> {
  // Prefer metadata.tenantId (set at checkout); fall back to the customer id.
  const metaTenantId = parseInt(
    (subscription.metadata as Record<string, string> | undefined)?.tenantId ??
      "",
    10,
  );
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id;
  const tenant = Number.isFinite(metaTenantId)
    ? await getTenantById(metaTenantId)
    : customerId
      ? await getTenantByStripeCustomerId(customerId)
      : undefined;
  if (!tenant) {
    console.warn(
      `[Billing] Subscription ${subscription.id} matched no tenant — ignoring`,
    );
    return;
  }

  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id;
  const plan = priceId ? planForPriceId(priceId) : null;
  const status = subscription.status;

  // An unrecognised Price means the subscription is not one we sell. Say so
  // loudly rather than silently skipping the plan write — that would leave
  // the tenant's plan permanently out of sync with Stripe.
  if (priceId && !plan) {
    console.warn(
      `[Billing] Tenant ${tenant.id} is on an unrecognised price (${priceId}) — ` +
        `plan left unchanged. Check STRIPE_PRICE_PRO matches the Price this ` +
        `subscription bills.`,
    );
  }

  await updateTenantBilling(tenant.id, {
    ...(plan ? { plan } : {}),
    stripeSubscriptionId: subscription.id,
    subscriptionStatus:
      status === "trialing"
        ? "trialing"
        : status === "active"
          ? "active"
          : status === "past_due" || status === "unpaid"
            ? "past_due"
            : "canceled",
  });
}

async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
): Promise<void> {
  const tenant =
    (await getTenantByStripeSubscriptionId(subscription.id)) ??
    (typeof subscription.customer === "string"
      ? await getTenantByStripeCustomerId(subscription.customer)
      : undefined);
  if (!tenant) return;
  // Cancellation returns the merchant to the free plan — never deletes data.
  await updateTenantBilling(tenant.id, {
    plan: "free",
    subscriptionStatus: "canceled",
  });
  console.info(`[Billing] Tenant ${tenant.id} cancelled — back on free plan`);
}

/**
 * Handle a platform-webhook event that belongs to billing. Called from
 * server/stripe.ts's handleStripeEvent. Returns true when the event was
 * billing-related (whether or not handling succeeded), false when it's an
 * event billing doesn't care about and the caller should fall through.
 */
export async function handleBillingEvent(
  event: Stripe.Event,
): Promise<boolean> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (!isBillingSession(session)) return false;
      const kind = (session.metadata as Record<string, string>)[META_KIND];
      if (kind === KIND_PLAN) await handlePlanCheckoutCompleted(session);
      else if (kind === KIND_SITE_IMPORT)
        await handleSiteImportCheckoutCompleted(session);
      else if (kind === KIND_PHOTO_CREDITS)
        // Retired product (pre-pivot pay-as-you-go credit packs). AI is now
        // plan-based — unmetered on Pro, monthly allowance on Free — so a
        // stale session completing post-deploy is logged for manual refund.
        console.warn(
          `[Billing] Ignoring retired photo-credit checkout ${session.id} — refund manually if paid`,
        );
      return true;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      return true;
    }
    case "customer.subscription.deleted": {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return true;
    }
    case "invoice.payment_succeeded":
      // No per-invoice work anymore: plan state is synced by the
      // customer.subscription.* events, and AI usage is allowance-based
      // (no monthly credit grants to write). Claimed so the platform
      // webhook doesn't treat a billing invoice as a storefront event.
      return true;
    default:
      return false;
  }
}
