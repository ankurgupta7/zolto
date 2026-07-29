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
  isLegacyPriceId,
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
  // Retired tiers: nobody can subscribe to these, but grandfathered tenants
  // are still billed on them (see LEGACY_PRICE_ENV).
  process.env.STRIPE_PRICE_MAKER = "price_maker_legacy";
  process.env.STRIPE_PRICE_STUDIO = "price_studio_legacy";
  process.env.STRIPE_PRICE_ATELIER = "price_atelier_legacy";
  sessionsCreate.mockResolvedValue({ url: "https://checkout.stripe.com/x" });
});

afterEach(() => {
  delete process.env.STRIPE_PRICE_PRO;
  delete process.env.STRIPE_PRICE_MAKER;
  delete process.env.STRIPE_PRICE_STUDIO;
  delete process.env.STRIPE_PRICE_ATELIER;
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

  it("does not require the retired prices to consider billing configured", () => {
    delete process.env.STRIPE_PRICE_MAKER;
    delete process.env.STRIPE_PRICE_STUDIO;
    delete process.env.STRIPE_PRICE_ATELIER;
    expect(isBillingConfigured()).toBe(true);
  });

  it("resolves retired tier prices to Pro so legacy subscribers keep syncing", () => {
    // Migration 0008 granted these tenants Pro; their Stripe subscription
    // still carries the old Price. Returning null here would silently stop
    // their plan state tracking Stripe.
    expect(planForPriceId("price_maker_legacy")).toBe("pro");
    expect(planForPriceId("price_studio_legacy")).toBe("pro");
    expect(planForPriceId("price_atelier_legacy")).toBe("pro");
    expect(isLegacyPriceId("price_atelier_legacy")).toBe(true);
    expect(isLegacyPriceId("price_pro")).toBe(false);
  });

  it("never lets a retired tier be sold as a new subscription", async () => {
    // The inverse mapping must not become a way to subscribe to a dead tier.
    await expect(
      createPlanCheckoutSession({ tenant, plan: "maker" as never }),
    ).rejects.toThrow();
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
      // Not on a retired price, so any grandfathered override is cleared.
      planPriceOverride: null,
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

  it("keeps a legacy subscriber on Pro and records what they really pay", async () => {
    getTenantById.mockResolvedValue({ ...(tenant as object), plan: "pro" });
    await handleBillingEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_legacy",
          status: "active",
          metadata: { tenantId: "7" },
          customer: "cus_t7",
          items: {
            data: [
              { price: { id: "price_atelier_legacy", unit_amount: 9900 } },
            ],
          },
        },
      },
    } as Stripe.Event);

    expect(updateTenantBilling).toHaveBeenCalledWith(7, {
      plan: "pro",
      stripeSubscriptionId: "sub_legacy",
      // CHF 99 — what they're actually billed, not Pro's CHF 25 list price.
      planPriceOverride: "99.00",
      subscriptionStatus: "active",
    });
  });

  it("clears the override once a tenant moves onto the real Pro price", async () => {
    getTenantById.mockResolvedValue({ ...(tenant as object), plan: "pro" });
    await handleBillingEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          status: "active",
          metadata: { tenantId: "7" },
          customer: "cus_t7",
          items: { data: [{ price: { id: "price_pro", unit_amount: 2500 } }] },
        },
      },
    } as Stripe.Event);

    expect(updateTenantBilling).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ planPriceOverride: null }),
    );
  });

  it("warns loudly about a grandfathered price so it can't be forgotten", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getTenantById.mockResolvedValue({ ...(tenant as object), plan: "pro" });
    await handleBillingEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_legacy",
          status: "active",
          metadata: { tenantId: "7" },
          customer: "cus_t7",
          items: {
            data: [{ price: { id: "price_maker_legacy", unit_amount: 1900 } }],
          },
        },
      },
    } as Stripe.Event);
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toMatch(/retired price/i);
    spy.mockRestore();
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
