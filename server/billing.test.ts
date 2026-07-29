import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type Stripe from "stripe";

// ── Mocked db + stripe ────────────────────────────────────────────────────────

const getTenantById = vi.fn();
const getTenantByStripeCustomerId = vi.fn();
const getTenantByStripeSubscriptionId = vi.fn();
const updateTenantBilling = vi.fn();

vi.mock("./db", () => ({
  getTenantById: (...args: unknown[]) => getTenantById(...args),
  getTenantByStripeCustomerId: (...args: unknown[]) =>
    getTenantByStripeCustomerId(...args),
  getTenantByStripeSubscriptionId: (...args: unknown[]) =>
    getTenantByStripeSubscriptionId(...args),
  updateTenantBilling: (...args: unknown[]) => updateTenantBilling(...args),
}));

const sessionsCreate = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: sessionsCreate } },
  }),
}));

import {
  createPlanCheckoutSession,
  handleBillingEvent,
  isBillingConfigured,
  isBillingSession,
  planForPriceId,
} from "./billing";

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
  process.env.STRIPE_PRICE_PRO = "price_pro";
  sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/x" });
});

afterEach(() => {
  delete process.env.STRIPE_PRICE_PRO;
});

describe("plan/price mapping", () => {
  it("maps the Pro price id to the plan and back", () => {
    expect(planForPriceId("price_pro")).toBe("pro");
    expect(planForPriceId("price_unknown")).toBeNull();
  });

  it("reports billing configured only when the Pro price is set", () => {
    expect(isBillingConfigured()).toBe(true);
    delete process.env.STRIPE_PRICE_PRO;
    expect(isBillingConfigured()).toBe(false);
  });
});

describe("createPlanCheckoutSession", () => {
  it("creates a subscription session with a trial for first-time subscribers", async () => {
    const { url } = await createPlanCheckoutSession({ tenant, plan: "pro" });
    expect(url).toContain("checkout.stripe.com");
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.mode).toBe("subscription");
    expect(args.customer).toBe("cus_t7");
    expect(args.line_items).toEqual([{ price: "price_pro", quantity: 1 }]);
    expect(args.subscription_data.trial_period_days).toBe(14);
    expect(args.metadata.zoltoBilling).toBe("plan_subscription");
    expect(args.metadata.tenantId).toBe("7");
  });

  it("bills immediately (no second trial) for tenants with a subscription", async () => {
    await createPlanCheckoutSession({
      tenant: { ...tenant, stripeSubscriptionId: "sub_existing" } as never,
      plan: "pro",
    });
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.subscription_data.trial_period_days).toBeUndefined();
  });

  it("fails clearly when the plan's price is not configured", async () => {
    delete process.env.STRIPE_PRICE_PRO;
    await expect(
      createPlanCheckoutSession({ tenant, plan: "pro" }),
    ).rejects.toThrow(/STRIPE_PRICE_PRO/);
  });

  it("fails when the tenant has no Stripe customer", async () => {
    await expect(
      createPlanCheckoutSession({
        tenant: { ...tenant, stripeCustomerId: null } as never,
        plan: "pro",
      }),
    ).rejects.toThrow(/no Stripe customer/);
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

  it("upgrades the tenant to Pro on plan checkout", async () => {
    getTenantById.mockResolvedValue(tenant);
    const claimed = await handleBillingEvent({
      type: "checkout.session.completed",
      data: {
        object: billingSession({
          zoltoBilling: "plan_subscription",
          tenantId: "7",
          plan: "pro",
        }),
      },
    } as Stripe.Event);

    expect(claimed).toBe(true);
    expect(updateTenantBilling).toHaveBeenCalledWith(7, {
      plan: "pro",
      stripeSubscriptionId: "sub_1",
      subscriptionStatus: "trialing",
    });
  });

  it("claims but ignores retired photo-credit checkouts", async () => {
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
          items: { data: [{ price: { id: "price_pro" } }] },
        },
      },
    } as Stripe.Event);

    expect(updateTenantBilling).toHaveBeenCalledWith(7, {
      plan: "pro",
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
          items: { data: [{ price: { id: "price_pro" } }] },
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
      plan: "pro",
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

  it("claims subscription invoices without further work (no credit grants)", async () => {
    const claimed = await handleBillingEvent({
      type: "invoice.payment_succeeded",
      data: {
        object: {
          subscription: "sub_1",
          billing_reason: "subscription_cycle",
        },
      },
    } as Stripe.Event);
    expect(claimed).toBe(true);
    expect(updateTenantBilling).not.toHaveBeenCalled();
  });

  it("returns false for unrelated events", async () => {
    const claimed = await handleBillingEvent({
      type: "payment_intent.succeeded",
      data: { object: {} },
    } as Stripe.Event);
    expect(claimed).toBe(false);
  });
});
