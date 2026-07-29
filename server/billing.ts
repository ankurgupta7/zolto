/**
 * Zolto's own subscription billing — charging MERCHANTS for the Pro plan
 * (free / pro, see shared/platform.ts PLANS).
 *
 * This is entirely separate from storefront payments: a tenant's customers
 * pay into the tenant's own Stripe account via Connect (server/stripeConnect.ts);
 * everything here runs on Zolto's own (platform) Stripe account against the
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

import type Stripe from "stripe";
import { type PlatformPlan } from "@shared/platform";
import {
  getTenantById,
  getTenantByStripeCustomerId,
  getTenantByStripeSubscriptionId,
  updateTenantBilling,
} from "./db";
import type { Tenant } from "../drizzle/schema";
import { getStripe } from "./stripe";

/** Paid plan ids, as both the DB enum and shared/platform.ts PLANS name them. */
export type PaidPlanId = Exclude<PlatformPlan["id"], "free">;

/** plan id → Stripe Price env var. */
const PRICE_ENV: Record<PaidPlanId, string> = {
  pro: "STRIPE_PRICE_PRO",
};

function priceIdForPlan(plan: PaidPlanId): string | null {
  return process.env[PRICE_ENV[plan]] || null;
}

/** Inverse lookup: Stripe Price id → plan id (used by webhook sync). */
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
const META_KIND = "zoltoBilling";
const KIND_PLAN = "plan_subscription";
const KIND_PHOTO_CREDITS = "photo_credits";

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

  const priceId = subscription.items?.data?.[0]?.price?.id;
  const plan = priceId ? planForPriceId(priceId) : null;
  const status = subscription.status;
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
