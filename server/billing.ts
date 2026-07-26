/**
 * Zolto's own subscription billing — charging MERCHANTS for their plan
 * (free / maker / studio / atelier) and for pay-as-you-go AI photo credits.
 *
 * This is entirely separate from storefront payments: a tenant's customers
 * pay into the tenant's own Stripe account via Connect (server/stripeConnect.ts);
 * everything here runs on Zolto's own (platform) Stripe account against the
 * tenant's stripeCustomerId / stripeSubscriptionId.
 *
 * Required env vars (in addition to STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET):
 *   STRIPE_PRICE_MAKER    – Stripe Price id (price_...) for Maker, CHF 19/mo
 *   STRIPE_PRICE_STUDIO   – Stripe Price id for Studio, CHF 49/mo
 *   STRIPE_PRICE_ATELIER  – Stripe Price id for Atelier, CHF 99/mo
 *   STRIPE_PRICE_PHOTO_CREDIT – one-time Price id for a single AI photo credit
 *                               (CHF 1); purchased in packs via quantity.
 *
 * Events are delivered to the existing platform webhook (/api/stripe/webhook);
 * server/stripe.ts delegates billing-shaped events to handleBillingEvent below.
 */

import type Stripe from "stripe";
import { PLANS, AI_PHOTO_CREDITS, type PlatformPlan } from "@shared/platform";
import {
  addPhotoCreditEntry,
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
  maker: "STRIPE_PRICE_MAKER",
  studio: "STRIPE_PRICE_STUDIO",
  atelier: "STRIPE_PRICE_ATELIER",
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

/** The monthly photo-credit bucket a plan includes (from shared/platform.ts). */
export function monthlyPhotoCredits(plan: PlatformPlan["id"]): number {
  return PLANS.find((p) => p.id === plan)?.includedPhotoCredits ?? 0;
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

/**
 * Create a one-time Checkout Session for a pack of AI photo credits
 * (CHF 1 each, pay-as-you-go, non-expiring — see AI_PHOTO_CREDITS).
 */
export async function createPhotoCreditCheckoutSession(params: {
  tenant: Tenant;
  quantity: number;
  req?: { headers?: { origin?: string } };
}): Promise<{ url: string }> {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe is not configured");
  const priceId = process.env.STRIPE_PRICE_PHOTO_CREDIT;
  if (!priceId) {
    throw new Error("STRIPE_PRICE_PHOTO_CREDIT is not configured");
  }
  if (
    !Number.isInteger(params.quantity) ||
    params.quantity < 1 ||
    params.quantity > 1000
  ) {
    throw new Error("Quantity must be an integer between 1 and 1000");
  }
  if (!params.tenant.stripeCustomerId) {
    throw new Error("Tenant has no Stripe customer — contact support");
  }

  const base = resolveBaseUrl(params.req);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: params.tenant.stripeCustomerId,
    line_items: [{ price: priceId, quantity: params.quantity }],
    metadata: {
      [META_KIND]: KIND_PHOTO_CREDITS,
      tenantId: String(params.tenant.id),
      credits: String(params.quantity),
    },
    success_url: `${base}/admin/billing?credits=1&session_id={CHECKOUT_SESSION_ID}`,
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
  // Grant the plan's monthly bucket immediately on upgrade — the merchant paid
  // (or started a trial) for this cycle already.
  const bucket = monthlyPhotoCredits(plan);
  if (bucket > 0) {
    await addPhotoCreditEntry({
      tenantId,
      delta: bucket,
      kind: "monthly_grant",
      ref:
        typeof session.subscription === "string" ? session.subscription : null,
      note: `${plan} plan bucket on upgrade`,
    });
  }
  console.info(`[Billing] Tenant ${tenantId} upgraded to ${plan}`);
}

async function handlePhotoCreditsCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const meta = session.metadata as Record<string, string>;
  const tenantId = parseInt(meta.tenantId, 10);
  const credits = parseInt(meta.credits, 10);
  if (!Number.isFinite(tenantId) || !Number.isFinite(credits) || credits < 1) {
    console.warn(
      "[Billing] Credit checkout completed with bad metadata:",
      meta,
    );
    return;
  }
  await addPhotoCreditEntry({
    tenantId,
    delta: credits,
    kind: "purchase",
    ref: session.id,
    note: `${credits} × ${AI_PHOTO_CREDITS.name} (CHF ${AI_PHOTO_CREDITS.priceChf}/${AI_PHOTO_CREDITS.unit})`,
  });
  console.info(
    `[Billing] Granted ${credits} photo credits to tenant ${tenantId}`,
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

async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
): Promise<void> {
  // Monthly bucket renewal: each paid subscription invoice re-grants the
  // plan's photo-credit bucket. The upgrade itself is granted at checkout;
  // invoice #1 of a subscription is skipped to avoid double-granting.
  // Stripe API 2025+ moved the subscription link off `invoice.subscription`
  // onto `invoice.parent.subscription_details`; read both.
  const inv = invoice as Stripe.Invoice & {
    subscription?: string | { id: string } | null;
    parent?: {
      subscription_details?: { subscription?: string | { id: string } | null };
    };
  };
  const subRef =
    inv.subscription ?? inv.parent?.subscription_details?.subscription ?? null;
  const subscriptionId =
    typeof subRef === "string" ? subRef : (subRef?.id ?? null);
  if (!subscriptionId || invoice.billing_reason === "subscription_create") {
    return;
  }
  const tenant = await getTenantByStripeSubscriptionId(subscriptionId);
  if (!tenant) return;
  const bucket = monthlyPhotoCredits(tenant.plan);
  if (bucket <= 0) return;
  await addPhotoCreditEntry({
    tenantId: tenant.id,
    delta: bucket,
    kind: "monthly_grant",
    ref: subscriptionId,
    note: `${tenant.plan} plan monthly bucket`,
  });
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
        await handlePhotoCreditsCheckoutCompleted(session);
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
    case "invoice.payment_succeeded": {
      await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
      return true;
    }
    default:
      return false;
  }
}
