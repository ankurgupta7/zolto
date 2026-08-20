import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type Stripe from "stripe";
import { SITE_IMPORT } from "@shared/platform";

// ── Mocked db + stripe ────────────────────────────────────────────────────────

const getTenantById = vi.fn();
const getTenantByStripeCustomerId = vi.fn();
const getTenantByStripeSubscriptionId = vi.fn();
const updateTenantBilling = vi.fn();
const markSiteImportPaid = vi.fn();

vi.mock("./db", () => ({
  getTenantById: (...args: unknown[]) => getTenantById(...args),
  getTenantByStripeCustomerId: (...args: unknown[]) =>
    getTenantByStripeCustomerId(...args),
  getTenantByStripeSubscriptionId: (...args: unknown[]) =>
    getTenantByStripeSubscriptionId(...args),
  markSiteImportPaid: (...args: unknown[]) => markSiteImportPaid(...args),
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
  createSiteImportCheckoutSession,
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
  sessionsCreate.mockResolvedValue({
    id: "cs_x",
    url: "https://checkout.stripe.com/x",
  });
  markSiteImportPaid.mockResolvedValue(true);
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

  it("does not resolve retired tier prices to any plan", () => {
    // The grandfathering map is deliberately gone: Gwinn had no paying
    // tenants when migration 0008 ran and has none now, so no subscription
    // can be sitting on a retired Price.
    expect(planForPriceId("price_maker_legacy")).toBeNull();
    expect(planForPriceId("price_studio_legacy")).toBeNull();
    expect(planForPriceId("price_atelier_legacy")).toBeNull();
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
    expect(args.metadata.platformBilling).toBe("plan_subscription");
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
      isBillingSession(
        billingSession({ platformBilling: "plan_subscription" }),
      ),
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
          platformBilling: "plan_subscription",
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
          platformBilling: "photo_credits",
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

  it("leaves the plan alone and warns when the Price is unrecognised", async () => {
    // A subscription on a Price we don't sell (e.g. one of the retired tiers,
    // or a mis-set STRIPE_PRICE_PRO) must not silently desync the plan.
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    getTenantById.mockResolvedValue({ ...(tenant as object), plan: "pro" });
    await handleBillingEvent({
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_mystery",
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

    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toMatch(/unrecognised price/i);
    // Status and subscription id still sync; only `plan` is withheld.
    const call = updateTenantBilling.mock.calls.at(-1);
    expect(call?.[1]).not.toHaveProperty("plan");
    expect(call?.[1]).toMatchObject({
      stripeSubscriptionId: "sub_mystery",
      subscriptionStatus: "active",
    });
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

  // The reason comps live in their own columns rather than in `plan`. A
  // cancellation for an OLD subscription can land weeks after the platform
  // owner comped the store; if it could reach the comp columns, the merchant
  // would silently lose the Pro they were given and start being skimmed again.
  it("cannot revoke a comp when a stale cancellation lands", async () => {
    getTenantByStripeSubscriptionId.mockResolvedValue({
      ...tenant,
      plan: "pro",
      compPlan: "pro",
      compFeeWaived: true,
    });
    await handleBillingEvent({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", customer: "cus_t7", metadata: {} } },
    } as Stripe.Event);

    const written = updateTenantBilling.mock.calls.at(-1)?.[1];
    expect(written).not.toHaveProperty("compPlan");
    expect(written).not.toHaveProperty("compFeeWaived");
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

// ─── The paid one-time shop import ────────────────────────────────────────────

describe("createSiteImportCheckoutSession", () => {
  it("charges once, inline, in CHF — never as a subscription", async () => {
    const result = await createSiteImportCheckoutSession({
      tenant,
      siteImportId: 42,
      priceChf: SITE_IMPORT.priceChf,
      productCount: 118,
    });

    expect(result).toEqual({
      url: "https://checkout.stripe.com/x",
      sessionId: "cs_x",
    });
    const args = sessionsCreate.mock.calls[0][0];
    // The whole promise of this feature is that it is not a new recurring
    // line on the merchant's card.
    expect(args.mode).toBe("payment");
    expect(args.customer).toBe("cus_t7");
    expect(args.line_items).toHaveLength(1);
    expect(args.line_items[0].quantity).toBe(1);
    expect(args.line_items[0].price_data.currency).toBe("chf");
    expect(args.line_items[0].price_data.unit_amount).toBe(2000);
  });

  it("names the product count on the receipt", async () => {
    await createSiteImportCheckoutSession({
      tenant,
      siteImportId: 42,
      priceChf: 20,
      productCount: 118,
    });
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.line_items[0].price_data.product_data.description).toContain(
      "118",
    );
  });

  it("carries the import id in metadata so the webhook can find it", async () => {
    await createSiteImportCheckoutSession({
      tenant,
      siteImportId: 42,
      priceChf: 20,
      productCount: 3,
    });
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.metadata).toMatchObject({
      platformBilling: "site_import",
      tenantId: "7",
      siteImportId: "42",
    });
    expect(args.success_url).toContain("/admin/products/import?imported=42");
    expect(args.cancel_url).toContain("/admin/products/import?cancelled=42");
  });

  it("is recognised as a billing session, not a storefront one", async () => {
    await createSiteImportCheckoutSession({
      tenant,
      siteImportId: 42,
      priceChf: 20,
      productCount: 3,
    });
    const args = sessionsCreate.mock.calls[0][0];
    expect(
      isBillingSession({ id: "cs_x", metadata: args.metadata } as never),
    ).toBe(true);
  });

  it("refuses a tenant with no Stripe customer rather than charging nobody", async () => {
    await expect(
      createSiteImportCheckoutSession({
        tenant: { ...(tenant as object), stripeCustomerId: null } as never,
        siteImportId: 42,
        priceChf: 20,
        productCount: 3,
      }),
    ).rejects.toThrow(/customer/i);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });
});

describe("site import webhook", () => {
  function importSession(
    meta: Partial<Record<string, string>> = {},
  ): Stripe.Event {
    return {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_import_1",
          amount_total: 2000,
          currency: "chf",
          metadata: {
            platformBilling: "site_import",
            tenantId: "7",
            siteImportId: "42",
            ...meta,
          },
        },
      },
    } as unknown as Stripe.Event;
  }

  it("marks the import paid, scoped to the tenant in the metadata", async () => {
    const claimed = await handleBillingEvent(importSession());
    expect(claimed).toBe(true);
    expect(markSiteImportPaid).toHaveBeenCalledWith({
      id: 42,
      tenantId: 7,
      amountCents: 2000,
      currency: "CHF",
    });
  });

  it("marks it paid on async_payment_succeeded too", async () => {
    const event = importSession();
    (event as { type: string }).type =
      "checkout.session.async_payment_succeeded";
    const claimed = await handleBillingEvent(event);
    expect(claimed).toBe(true);
    expect(markSiteImportPaid).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when a replayed webhook finds the row already moved on", async () => {
    // Stripe redelivers; the status transition in the db layer is the
    // idempotency key, and a second delivery must not be treated as an error.
    markSiteImportPaid.mockResolvedValue(false);
    const claimed = await handleBillingEvent(importSession());
    expect(claimed).toBe(true);
    expect(markSiteImportPaid).toHaveBeenCalledTimes(1);
  });

  it("never upgrades a plan off a site-import payment", async () => {
    await handleBillingEvent(importSession());
    expect(updateTenantBilling).not.toHaveBeenCalled();
  });

  it("refuses to write anything when the metadata ids are junk", async () => {
    const claimed = await handleBillingEvent(
      importSession({ siteImportId: "not-a-number" }),
    );
    expect(claimed).toBe(true);
    expect(markSiteImportPaid).not.toHaveBeenCalled();
  });

  it("refuses when the tenant id is missing", async () => {
    const claimed = await handleBillingEvent(importSession({ tenantId: "" }));
    expect(claimed).toBe(true);
    expect(markSiteImportPaid).not.toHaveBeenCalled();
  });
});
