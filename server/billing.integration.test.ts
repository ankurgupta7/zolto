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
 *   3. AI photo credits — createPhotoCreditCheckoutSession builds a one-time
 *      Checkout for a credit pack with correct quantity/metadata.
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
// createPlanCheckoutSession / createPhotoCreditCheckoutSession only read
// id, stripeCustomerId and stripeSubscriptionId from the tenant — cast a
// partial so the tests stay decoupled from schema churn.
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
  let makerPriceId: string;
  let photoCreditPriceId: string;

  function setEnv(key: string, value: string) {
    if (!(key in savedEnv)) savedEnv[key] = process.env[key];
    process.env[key] = value;
  }

  beforeAll(async () => {
    stripe = new Stripe(secretKey!, { apiVersion: "2025-06-30.basil" });

    // Point the platform key at the test account so server/stripe.ts's
    // getStripe() (read by billing.ts) talks to the same account.
    setEnv("STRIPE_SECRET_KEY", secretKey!);
    setEnv("PUBLIC_BASE_URL", "https://zolto.ch");

    // Self-provision the two Prices the billing code needs — no dependency on
    // dashboard-created Price ids, so the suite runs against any test account.
    const makerProduct = await stripe.products.create({
      name: "Zolto Maker (integration test)",
    });
    productIds.push(makerProduct.id);
    const makerPrice = await stripe.prices.create({
      product: makerProduct.id,
      currency: "chf",
      unit_amount: 1900, // CHF 19/mo, matching shared/platform.ts
      recurring: { interval: "month" },
    });
    priceIds.push(makerPrice.id);
    makerPriceId = makerPrice.id;
    setEnv("STRIPE_PRICE_MAKER", makerPriceId);

    const creditProduct = await stripe.products.create({
      name: "AI Photo Credit (integration test)",
    });
    productIds.push(creditProduct.id);
    const creditPrice = await stripe.prices.create({
      product: creditProduct.id,
      currency: "chf",
      unit_amount: 100, // CHF 1 one-time
    });
    priceIds.push(creditPrice.id);
    photoCreditPriceId = creditPrice.id;
    setEnv("STRIPE_PRICE_PHOTO_CREDIT", photoCreditPriceId);
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
      "first subscription gets the 14-day trial and billing metadata",
      async () => {
        const { createPlanCheckoutSession, isBillingSession } = await import(
          "./billing"
        );
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
          plan: "maker",
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
          plan: "maker",
        });

        // The line item is our self-provisioned Maker price, qty 1.
        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
        );
        expect(lineItems.data).toHaveLength(1);
        expect(lineItems.data[0].price?.id).toBe(makerPriceId);
        expect(lineItems.data[0].quantity).toBe(1);

        // trial_period_days lives inside subscription_data — Stripe echoes it
        // back on the created subscription's pending setup. Verify via the raw
        // session's subscription_data if present, else by expanding.
        const expanded = await stripe.checkout.sessions.retrieve(session.id, {
          expand: [],
        });
        const subData = (
          expanded as Stripe.Checkout.Session & {
            subscription_data?: { trial_period_days?: number };
          }
        ).subscription_data;
        expect(subData?.trial_period_days).toBe(14);
      },
      NETWORK,
    );

    it(
      "returning subscriber does NOT get a second trial",
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
          plan: "maker",
        });
        expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

        const sessions = await stripe.checkout.sessions.list({
          customer: customer.id,
          limit: 1,
        });
        const session = sessions.data[0];
        sessionIds.push(session.id);
        const expanded = await stripe.checkout.sessions.retrieve(session.id);
        const subData = (
          expanded as Stripe.Checkout.Session & {
            subscription_data?: { trial_period_days?: number | null };
          }
        ).subscription_data;
        expect(subData?.trial_period_days ?? null).toBeNull();
      },
      NETWORK,
    );

    it(
      "fails fast when the tenant has no Stripe customer",
      async () => {
        const { createPlanCheckoutSession } = await import("./billing");
        const tenant = fakeTenant({ id: 4444, stripeCustomerId: null });
        await expect(
          createPlanCheckoutSession({ tenant, plan: "maker" }),
        ).rejects.toThrow(/no Stripe customer/);
      },
      NETWORK,
    );
  });

  // ─── Step 3: buying AI photo credits ──────────────────────────────────────
  describe("photo credits — one-time checkout", () => {
    it(
      "creates a payment Checkout for a credit pack with correct metadata",
      async () => {
        const { createPhotoCreditCheckoutSession, isBillingSession } =
          await import("./billing");
        const customer = await stripe.customers.create({
          name: "Credits Tenant",
          email: "credits-tenant@zolto.ch",
        });
        customerIds.push(customer.id);

        const tenant = fakeTenant({ id: 4545, stripeCustomerId: customer.id });
        const { url } = await createPhotoCreditCheckoutSession({
          tenant,
          quantity: 25,
        });
        expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);

        const sessions = await stripe.checkout.sessions.list({
          customer: customer.id,
          limit: 1,
        });
        const session = sessions.data[0];
        sessionIds.push(session.id);

        expect(session.mode).toBe("payment");
        expect(session.amount_total).toBe(2500); // 25 × CHF 1
        expect(session.currency).toBe("chf");
        expect(isBillingSession(session)).toBe(true);
        expect(session.metadata).toMatchObject({
          zoltoBilling: "photo_credits",
          tenantId: "4545",
          credits: "25",
        });

        const lineItems = await stripe.checkout.sessions.listLineItems(
          session.id,
        );
        expect(lineItems.data[0].price?.id).toBe(photoCreditPriceId);
        expect(lineItems.data[0].quantity).toBe(25);
      },
      NETWORK,
    );

    it(
      "rejects out-of-range quantities without touching Stripe",
      async () => {
        const { createPhotoCreditCheckoutSession } = await import("./billing");
        const tenant = fakeTenant({ id: 4646, stripeCustomerId: "cus_fake" });
        await expect(
          createPhotoCreditCheckoutSession({ tenant, quantity: 0 }),
        ).rejects.toThrow(/Quantity/);
        await expect(
          createPhotoCreditCheckoutSession({ tenant, quantity: 1001 }),
        ).rejects.toThrow(/Quantity/);
        await expect(
          createPhotoCreditCheckoutSession({ tenant, quantity: 2.5 }),
        ).rejects.toThrow(/Quantity/);
      },
      NETWORK,
    );
  });

  // ─── Env ↔ plan mapping the webhook depends on ────────────────────────────
  describe("price ↔ plan mapping", () => {
    it(
      "planForPriceId maps the provisioned Maker price back to the plan",
      async () => {
        const { planForPriceId } = await import("./billing");
        expect(planForPriceId(makerPriceId)).toBe("maker");
        expect(planForPriceId("price_does_not_exist")).toBeNull();
      },
      NETWORK,
    );

    it(
      "monthlyPhotoCredits matches shared/platform.ts buckets",
      async () => {
        const { monthlyPhotoCredits } = await import("./billing");
        expect(monthlyPhotoCredits("free")).toBe(0);
        expect(monthlyPhotoCredits("maker")).toBe(10);
        expect(monthlyPhotoCredits("studio")).toBe(40);
        expect(monthlyPhotoCredits("atelier")).toBe(150);
      },
      NETWORK,
    );
  });
});
