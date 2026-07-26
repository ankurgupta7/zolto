import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type Stripe from "stripe";

// ── Mocked db + stripe ────────────────────────────────────────────────────────

const getTenantById = vi.fn();
const getTenantByStripeCustomerId = vi.fn();
const getTenantByStripeSubscriptionId = vi.fn();
const updateTenantBilling = vi.fn();
const addPhotoCreditEntry = vi.fn();

vi.mock("./db", () => ({
  getTenantById: (...args: unknown[]) => getTenantById(...args),
  getTenantByStripeCustomerId: (...args: unknown[]) =>
    getTenantByStripeCustomerId(...args),
  getTenantByStripeSubscriptionId: (...args: unknown[]) =>
    getTenantByStripeSubscriptionId(...args),
  updateTenantBilling: (...args: unknown[]) => updateTenantBilling(...args),
  addPhotoCreditEntry: (...args: unknown[]) => addPhotoCreditEntry(...args),
}));

const sessionsCreate = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: sessionsCreate } },
  }),
}));

import {
  createPlanCheckoutSession,
  createPhotoCreditCheckoutSession,
  handleBillingEvent,
  isBillingConfigured,
  isBillingSession,
  monthlyPhotoCredits,
  planForPriceId,
} from "./billing";

const PRICE_ENV_VARS = [
  "STRIPE_PRICE_MAKER",
  "STRIPE_PRICE_STUDIO",
  "STRIPE_PRICE_ATELIER",
  "STRIPE_PRICE_PHOTO_CREDIT",
] as const;

const tenant = {
  id: 7,
  slug: "aurora",
  name: "Aurora",
  plan: "free",
  stripeCustomerId: "cus_t7",
  stripeSubscriptionId: null,
  subscriptionStatus: "trialing",
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_PRICE_MAKER = "price_maker";
  process.env.STRIPE_PRICE_STUDIO = "price_studio";
  process.env.STRIPE_PRICE_ATELIER = "price_atelier";
  process.env.STRIPE_PRICE_PHOTO_CREDIT = "price_credit";
  sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/x" });
});

afterEach(() => {
  for (const v of PRICE_ENV_VARS) delete process.env[v];
});

describe("plan/price mapping", () => {
  it("maps plan ids to Stripe price ids and back", () => {
    expect(planForPriceId("price_maker")).toBe("maker");
    expect(planForPriceId("price_atelier")).toBe("atelier");
    expect(planForPriceId("price_unknown")).toBeNull();
  });

  it("reports billing configured only when all prices are set", () => {
    expect(isBillingConfigured()).toBe(true);
    delete process.env.STRIPE_PRICE_STUDIO;
    expect(isBillingConfigured()).toBe(false);
  });

  it("reads monthly photo buckets from shared/platform.ts", () => {
    expect(monthlyPhotoCredits("free")).toBe(0);
    expect(monthlyPhotoCredits("maker")).toBe(10);
    expect(monthlyPhotoCredits("studio")).toBe(40);
    expect(monthlyPhotoCredits("atelier")).toBe(150);
  });
});

describe("createPlanCheckoutSession", () => {
  it("creates a subscription session with a trial for first-time subscribers", async () => {
    const { url } = await createPlanCheckoutSession({ tenant, plan: "maker" });
    expect(url).toContain("checkout.stripe.com");
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.mode).toBe("subscription");
    expect(args.customer).toBe("cus_t7");
    expect(args.line_items).toEqual([{ price: "price_maker", quantity: 1 }]);
    expect(args.subscription_data.trial_period_days).toBe(14);
    expect(args.metadata.zoltoBilling).toBe("plan_subscription");
    expect(args.metadata.tenantId).toBe("7");
  });

  it("bills immediately (no second trial) for tenants with a subscription", async () => {
    await createPlanCheckoutSession({
      tenant: { ...tenant, stripeSubscriptionId: "sub_existing" } as never,
      plan: "studio",
    });
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.subscription_data.trial_period_days).toBeUndefined();
  });

  it("fails clearly when the plan's price is not configured", async () => {
    delete process.env.STRIPE_PRICE_ATELIER;
    await expect(
      createPlanCheckoutSession({ tenant, plan: "atelier" }),
    ).rejects.toThrow(/STRIPE_PRICE_ATELIER/);
  });

  it("fails when the tenant has no Stripe customer", async () => {
    await expect(
      createPlanCheckoutSession({
        tenant: { ...tenant, stripeCustomerId: null } as never,
        plan: "maker",
      }),
    ).rejects.toThrow(/no Stripe customer/);
  });
});

describe("createPhotoCreditCheckoutSession", () => {
  it("creates a one-time payment session for the credit pack", async () => {
    await createPhotoCreditCheckoutSession({ tenant, quantity: 25 });
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.line_items).toEqual([{ price: "price_credit", quantity: 25 }]);
    expect(args.metadata).toMatchObject({
      zoltoBilling: "photo_credits",
      tenantId: "7",
      credits: "25",
    });
  });

  it("rejects invalid quantities", async () => {
    await expect(
      createPhotoCreditCheckoutSession({ tenant, quantity: 0 }),
    ).rejects.toThrow(/Quantity/);
    await expect(
      createPhotoCreditCheckoutSession({ tenant, quantity: 1001 }),
    ).rejects.toThrow(/Quantity/);
  });
});

// ── Webhook event handling ────────────────────────────────────────────────────

function billingSession(meta: Record<string, string>): Stripe.Checkout.Session {
  return {
    id: "cs_bill_1",
    subscription: "sub_1",
    metadata: meta,
  } as unknown as Stripe.Checkout.Session;
}

describe("isBillingSession", () => {
  it("distinguishes billing sessions from storefront sessions", () => {
    expect(
      isBillingSession(billingSession({ zoltoBilling: "plan_subscription" })),
    ).toBe(true);
    expect(
      isBillingSession({
        id: "cs_shop",
        metadata: { productIds: "1,2" },
      } as never),
    ).toBe(false);
    expect(isBillingSession({ id: "cs_none", metadata: null } as never)).toBe(
      false,
    );
  });
});

describe("handleBillingEvent", () => {
  it("ignores storefront checkout sessions (returns false)", async () => {
    const claimed = await handleBillingEvent({
      type: "checkout.session.completed",
      data: {
        object: { id: "cs_shop", metadata: { productIds: "1,2" } },
      },
    } as Stripe.Event);
    expect(claimed).toBe(false);
  });

  it("upgrades the tenant and grants the bucket on plan checkout", async () => {
    getTenantById.mockResolvedValue(tenant);
    const claimed = await handleBillingEvent({
      type: "checkout.session.completed",
      data: {
        object: billingSession({
          zoltoBilling: "plan_subscription",
          tenantId: "7",
          plan: "studio",
        }),
      },
    } as Stripe.Event);

    expect(claimed).toBe(true);
    expect(updateTenantBilling).toHaveBeenCalledWith(7, {
      plan: "studio",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "trialing",
    });
    expect(addPhotoCreditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        delta: 40,
        kind: "monthly_grant",
      }),
    );
  });

  it("grants purchased credits on credit-pack checkout", async () => {
    const claimed = await handleBillingEvent({
      type: "checkout.session.completed",
      data: {
        object: billingSession({
          zoltoBilling: "photo_credits",
          tenantId: "7",
          credits: "25",
        }),
      },
    } as Stripe.Event);

    expect(claimed).toBe(true);
    expect(addPhotoCreditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        delta: 25,
        kind: "purchase",
        ref: "cs_bill_1",
      }),
    );
    expect(updateTenantBilling).not.toHaveBeenCalled();
  });

  it("syncs plan + status from subscription.updated via metadata tenantId", async () => {
    getTenantById.mockResolvedValue(tenant);
    await handleBillingEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "active",
          metadata: { tenantId: "7" },
          customer: "cus_t7",
          items: { data: [{ price: { id: "price_atelier" } }] },
        },
      },
    } as Stripe.Event);

    expect(updateTenantBilling).toHaveBeenCalledWith(7, {
      plan: "atelier",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "active",
    });
  });

  it("maps past_due and unpaid to past_due", async () => {
    getTenantById.mockResolvedValue(tenant);
    await handleBillingEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "past_due",
          metadata: { tenantId: "7" },
          customer: "cus_t7",
          items: { data: [{ price: { id: "price_maker" } }] },
        },
      },
    } as Stripe.Event);
    expect(updateTenantBilling).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ subscriptionStatus: "past_due" }),
    );
  });

  it("returns the tenant to free on subscription.deleted", async () => {
    getTenantByStripeSubscriptionId.mockResolvedValue({
      ...tenant,
      plan: "maker",
    });
    await handleBillingEvent({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", customer: "cus_t7", metadata: {} } },
    } as Stripe.Event);

    expect(updateTenantBilling).toHaveBeenCalledWith(7, {
      plan: "free",
      subscriptionStatus: "canceled",
    });
  });

  it("re-grants the monthly bucket on renewal invoices", async () => {
    getTenantByStripeSubscriptionId.mockResolvedValue({
      ...tenant,
      plan: "studio",
    });
    await handleBillingEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          subscription: "sub_1",
          billing_reason: "subscription_cycle",
        },
      },
    } as Stripe.Event);

    expect(addPhotoCreditEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        delta: 40,
        kind: "monthly_grant",
        ref: "sub_1",
      }),
    );
  });

  it("skips the first subscription invoice (bucket granted at checkout)", async () => {
    await handleBillingEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          subscription: "sub_1",
          billing_reason: "subscription_create",
        },
      },
    } as Stripe.Event);
    expect(addPhotoCreditEntry).not.toHaveBeenCalled();
  });

  it("does not grant a bucket on the free plan", async () => {
    getTenantByStripeSubscriptionId.mockResolvedValue(tenant); // plan: free
    await handleBillingEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: { subscription: "sub_1", billing_reason: "subscription_cycle" },
      },
    } as Stripe.Event);
    expect(addPhotoCreditEntry).not.toHaveBeenCalled();
  });

  it("returns false for unrelated events", async () => {
    const claimed = await handleBillingEvent({
      type: "payment_intent.succeeded",
      data: { object: {} },
    } as Stripe.Event);
    expect(claimed).toBe(false);
  });
});
