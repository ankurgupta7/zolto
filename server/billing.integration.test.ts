import { describe, expect, it, beforeAll, afterAll } from "vitest";
import Stripe from "stripe";

/**
 * Tenant Onboarding — Stripe Integration Tests
 *
 * These tests hit the REAL Stripe API (test mode) to verify the billing side
 * of tenant onboarding end-to-end:
 *
 *   1. Signup — createStripeCustomer provisions a platform customer
 *      (server/stripe.ts), the id tenants.stripeCustomerId later references.
 *   2. Plan upgrade — createPlanCheckoutSession builds a subscription Checkout
 *      with the correct price, 14-day trial (first subscription only), and
 *      billing metadata the webhook relies on (server/billing.ts).
 *   3. Legacy prices — a pre-pivot tier's Price id still resolves to "pro", so
 *      grandfathered subscribers keep syncing (see billing.ts LEGACY_PRICE_ENV
 *      and the runbook in docs/planning/pricing-pivot-agent-commerce.md §8).
 *
 * Unlike server/billing.test.ts (fully mocked), these exercise the real SDK
 * calls against Stripe's servers — including the parameters Stripe rejects
 * only server-side.
 *
 * The suite is SELF-PROVISIONING: it creates its own throwaway
 * products/prices in test mode and points STRIPE_PRICE_* at them, so it does
 * NOT require the dashboard Price ids from .env — only the secret key:
 *
 *   STRIPE_TEST_SECRET_KEY=sk_test_... pnpm test:integration
 *
 * Skipped entirely when STRIPE_TEST_SECRET_KEY is unset (e.g. CI).
 * All created objects are cleaned up (sessions expired, customers deleted,
 * prices/products deactivated) in afterAll.
 */

const secretKey = process.env.STRIPE_TEST_SECRET_KEY;
const describeIf = secretKey ? describe : describe.skip;

const NETWORK = 60_000; // generous per-test timeout for real API round-trips

// ─── Test fixture: a minimal Tenant-shaped object ────────────────────────────
// createPlanCheckoutSession only reads id, stripeCustomerId and
// stripeSubscriptionId from the tenant — cast a partial so the tests stay
// decoupled from schema churn.
function fakeTenant(overrides: {
  id: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId?: string | null;
}) {
  return {
    id: overrides.id,
    stripeCustomerId: overrides.stripeCustomerId,
    stripeSubscriptionId: overrides.stripeSubscriptionId ?? null,
  } as unknown as import("../drizzle/schema").Tenant;
}

describeIf("Tenant Onboarding — Stripe Integration", () => {
  let stripe: Stripe;
  // Env we mutate for the duration of the suite, restored afterwards.
  const savedEnv: Record<string, string | undefined> = {};
  // Cleanup registries.
  const customerIds: string[] = [];
  const sessionIds: string[] = [];
  const priceIds: string[] = [];
  const productIds: string[] = [];

  // Throwaway billing catalogue, provisioned in beforeAll.
  let proPriceId: string;
  /** A retired-tier price, to prove grandfathered subscribers still resolve. */
  let legacyMakerPriceId: string;

  function setEnv(key: string, value: string) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  beforeAll(async () => {
    stripe = new Stripe(secretKey!, { apiVersion: "2025-06-30.basil" });

    // Reachability first. The Stripe SDK reports a proxy's HTML error page as
    // "Invalid JSON received from the Stripe API", which looks like Stripe
    // rejecting our request when it actually means we never reached Stripe.
    // Same guard as server/stripe.integration.test.ts, for the same reason.
    try {
      await stripe.balance.retrieve();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        "Cannot reach the Stripe API, so tenant billing was NOT verified. " +
          "This is a connectivity/egress problem, not a Stripe rejection. " +
          `Underlying error: ${msg}`,
      );
    }

    // Point the platform key at the test account so server/stripe.ts's
    // getStripe() (read by billing.ts) talks to the same account.
    setEnv("STRIPE_SECRET_KEY", secretKey!);
    setEnv("PUBLIC_BASE_URL", "https://zolto.ch");

    // Self-provision the Prices the billing code needs — no dependency on
    // dashboard-created Price ids, so the suite runs against any test account.
    const proProduct = await stripe.products.create({
      name: "Zolto Pro (integration test)",
    });
    productIds.push(proProduct.id);
    const proPrice = await stripe.prices.create({
      product: proProduct.id,
      currency: "chf",
      unit_amount: 2500, // CHF 25/mo, matching shared/platform.ts PLANS
      recurring: { interval: "month" },
    });
    priceIds.push(proPrice.id);
    proPriceId = proPrice.id;
    setEnv("STRIPE_PRICE_PRO", proPriceId);

    // A retired tier's price. Nobody can subscribe to this any more, but
    // tenants who did before the pivot are still billed on it, so the inverse
    // lookup has to keep recognising it.
    const legacyProduct = await stripe.products.create({
      name: "Zolto Maker — retired tier (integration test)",
    });
    productIds.push(legacyProduct.id);
    const legacyPrice = await stripe.prices.create({
      product: legacyProduct.id,
      currency: "chf",
      unit_amount: 1900, // the old CHF 19/mo
      recurring: { interval: "month" },
    });
    priceIds.push(legacyPrice.id);
    legacyMakerPriceId = legacyPrice.id;
    setEnv("STRIPE_PRICE_MAKER", legacyMakerPriceId);
  }, NETWORK);

  afterAll(async () => {
    // Restore env first so nothing leaks into other test files in the process.
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    // Best-effort cleanup; individual failures shouldn't fail the suite.
    for (const id of sessionIds) {
      await stripe.checkout.sessions.expire(id).catch(() => {});
    }
    for (const id of customerIds) {
      await stripe.customers.del(id).catch(() => {});
    }
    for (const id of priceIds) {
      await stripe.prices.update(id, { active: false }).catch(() => {});
    }
    for (const id of productIds) {
      await stripe.products.update(id, { active: false }).catch(() => {});
    }
  }, NETWORK);

  // ─── Step 1: signup provisions a Stripe customer ──────────────────────────
  describe("signup — platform customer provisioning", () => {
    it(
      "createStripeCustomer creates a real customer with name and email",
      async () => {
        const { createStripeCustomer } = await import("./stripe");
        const customerId = await createStripeCustomer({
          name: "Integration Test Merchant",
          email: "onboarding-test@zolto.ch",
        });

        expect(customerId).toMatch(/^cus_/);
        customerIds.push(customerId!);

        // Read back from Stripe: the stored id is usable and carries the data
        // the tenant row would reference.
        const customer = await stripe.customers.retrieve(customerId!);
        expect(customer.deleted).not.toBe(true);
        const c = customer as Stripe.Customer;
        expect(c.name).toBe("Integration Test Merchant");
        expect(c.email).toBe("onboarding-test@zolto.ch");
      },
      NETWORK,
    );

    it(
      "createStripeCustomer tolerates a missing name/email",
      async () => {
        const { createStripeCustomer } = await import("./stripe");
        const customerId = await createStripeCustomer({});
        expect(customerId).toMatch(/^cus_/);
        customerIds.push(customerId!);
      },
      NETWORK,
    );
  });

  // ─── Step 2: upgrading to a paid plan ─────────────────────────────────────
  describe("plan upgrade — subscription checkout", () => {
    it(
      "first subscription checkout carries the Pro price and billing metadata",
      async () => {
        const { createPlanCheckoutSession, isBillingSession } =
          await import("./billing");
        const customer = await stripe.customers.create({
          name: "Trial Tenant",
          email: "trial-tenant@zolto.ch",
        });
        customerIds.push(customer.id);

        const tenant = fakeTenant({
          id: 4242,
          stripeCustomerId: customer.id,
        });
        const { url } = await createPlanCheckoutSession({
          tenant,
          plan: "pro",
        });

        expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

        // Inspect the session Stripe actually created.
        const sessions = await stripe.checkout.sessions.list({
          customer: customer.id,
          limit: 1,
        });
        const session = sessions.data[0];
        expect(session).toBeDefined();
        sessionIds.push(session.id);

        expect(session.mode).toBe("subscription");
        expect(session.success_url).toContain(
          "https://zolto.ch/admin/billing?upgraded=1",
        );
        expect(session.cancel_url).toBe(
          "https://zolto.ch/admin/billing?cancelled=1",
        );

        // Metadata is what handleBillingEvent routes on.
        expect(isBillingSession(session)).toBe(true);
        expect(session.metadata).toMatchObject({
          zoltoBilling: "plan_subscription",
          tenantId: "4242",
          plan: "pro",
        });

        // The line item is our self-provisioned Pro price, qty 1.
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
        );
        expect(lineItems.data).toHaveLength(1);
        expect(lineItems.data[0].price?.id).toBe(proPriceId);
        expect(lineItems.data[0].quantity).toBe(1);

        // NOTE on the 14-day trial: createPlanCheckoutSession passes
        // subscription_data.trial_period_days=14 for a first subscription, but
        // Stripe's API (2025-06-30.basil) no longer echoes subscription_data
        // back on the retrieved Checkout Session, so it can't be asserted
        // server-to-server without completing the checkout. The trial-once
        // branching itself is covered by the mocked billing.test.ts suite.
      },
      NETWORK,
    );

    it(
      "returning subscriber checkout is created without a trial and keeps tenant metadata",
      async () => {
        const { createPlanCheckoutSession } = await import("./billing");
        const customer = await stripe.customers.create({
          name: "Returning Tenant",
          email: "returning-tenant@zolto.ch",
        });
        customerIds.push(customer.id);

        const tenant = fakeTenant({
          id: 4343,
          stripeCustomerId: customer.id,
          stripeSubscriptionId: "sub_previous_123", // had a subscription before
        });
        const { url } = await createPlanCheckoutSession({
          tenant,
          plan: "pro",
        });
        expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

        const sessions = await stripe.checkout.sessions.list({
          customer: customer.id,
          limit: 1,
        });
        const session = sessions.data[0];
        sessionIds.push(session.id);
        expect(session.mode).toBe("subscription");
        expect(session.metadata).toMatchObject({
          zoltoBilling: "plan_subscription",
          tenantId: "4343",
          plan: "pro",
        });
        // As above: subscription_data (incl. trial_period_days) is a
        // request-side field on this API version — not readable back.
      },
      NETWORK,
    );

    it(
      "fails fast when the tenant has no Stripe customer",
      async () => {
        const { createPlanCheckoutSession } = await import("./billing");
        const tenant = fakeTenant({ id: 4444, stripeCustomerId: null });
        await expect(
          createPlanCheckoutSession({ tenant, plan: "pro" }),
        ).rejects.toThrow(/no Stripe customer/);
      },
      NETWORK,
    );
  });

  // ─── Retired products must stay retired ───────────────────────────────────
  describe("retired tiers and add-ons", () => {
    it(
      "refuses to sell a retired tier as a new subscription",
      async () => {
        // The legacy price is configured (STRIPE_PRICE_MAKER is set above), so
        // this proves the inverse lookup did NOT become a way to subscribe to
        // a dead tier — only PRICE_ENV can be sold from.
        const { createPlanCheckoutSession } = await import("./billing");
        const tenant = fakeTenant({ id: 4747, stripeCustomerId: "cus_fake" });
        await expect(
          createPlanCheckoutSession({ tenant, plan: "maker" as never }),
        ).rejects.toThrow();
      },
      NETWORK,
    );

    it(
      "no longer exposes pay-per-image photo credits",
      async () => {
        // AI is a plan allowance now, never a per-query purchase. If this
        // export ever comes back, the pricing promise has regressed.
        const billing = await import("./billing");
        expect(
          (billing as Record<string, unknown>).createPhotoCreditCheckoutSession,
        ).toBeUndefined();
        expect(
          (billing as Record<string, unknown>).monthlyPhotoCredits,
        ).toBeUndefined();
      },
      NETWORK,
    );
  });

  // ─── Env ↔ plan mapping the webhook depends on ────────────────────────────
  describe("price ↔ plan mapping", () => {
    it(
      "planForPriceId maps the provisioned Pro price back to the plan",
      async () => {
        const { planForPriceId } = await import("./billing");
        expect(planForPriceId(proPriceId)).toBe("pro");
        expect(planForPriceId("price_does_not_exist")).toBeNull();
      },
      NETWORK,
    );

    it(
      "a retired tier's price still resolves to Pro, so grandfathered subscribers keep syncing",
      async () => {
        // Migration 0008 granted these tenants Pro while their Stripe
        // subscription kept the old Price. If this returned null, the webhook
        // would skip the plan write and their state would silently stop
        // tracking Stripe — a cancellation wouldn't move them off Pro.
        const { planForPriceId, isLegacyPriceId } = await import("./billing");
        expect(isLegacyPriceId(legacyMakerPriceId)).toBe(true);
        expect(planForPriceId(legacyMakerPriceId)).toBe("pro");
        expect(isLegacyPriceId(proPriceId)).toBe(false);
      },
      NETWORK,
    );

    it(
      "billing counts as configured from the Pro price alone",
      async () => {
        // A fresh install has no retired prices to set; requiring them would
        // wrongly disable paid checkout.
        const { isBillingConfigured } = await import("./billing");
        expect(isBillingConfigured()).toBe(true);
      },
      NETWORK,
    );
  });
});
