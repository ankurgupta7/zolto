import { describe, expect, it, vi } from "vitest";
import type { Tenant } from "../../../drizzle/schema";
import { createFakeContext, fakeTenant } from "../fakeContext";
import {
  changePlan,
  compStore,
  photoCredits,
  revokeComp,
  storeBilling,
  subscriptionOverview,
} from "./billing";

const status = {
  plan: "free",
  comp: null,
  subscriptionStatus: "trialing",
  trialEndsAt: new Date("2026-09-01T00:00:00Z"),
  ai: { allowancePerMonth: 30, usedThisMonth: 4 },
  onlineFees: {
    feePercentLabel: "1%",
    appliesTo: "online and agent orders",
    feeBps: 100,
    monthGmvChf: 4000,
    monthAgentGmvChf: 250,
    monthOrderCount: 12,
    monthFeeChf: 40,
  },
  upsell: { breakEvenOnlineChf: 2500, proPriceChf: 25, savingsChf: 15 },
  plans: [
    {
      id: "free",
      name: "Free",
      priceChf: 0,
      onlineFeeBps: 100,
      aiPhotoAllowancePerMonth: 30,
      maxProducts: 100,
      storageGb: 1,
    },
  ],
  storage: { usedBytes: 500_000, limitBytes: 1_000_000_000 },
  billingConfigured: true,
};

describe("subscriptionOverview", () => {
  it("tallies what every store is on, paid and comped apart", async () => {
    const { ctx, fake } = createFakeContext({
      platform: {
        platform: {
          tenants: async () => [
            {
              slug: "a",
              plan: "pro",
              comp: null,
              subscriptionStatus: "active",
              trialEndsAt: null,
            },
            {
              slug: "b",
              plan: "free",
              comp: { plan: "pro", feeWaived: false, note: "partner" },
              subscriptionStatus: null,
              trialEndsAt: null,
            },
          ],
        },
      },
    });

    await subscriptionOverview(ctx);
    expect(fake.text()).toContain("1 × pro");
    expect(fake.text()).toContain("1 × free (comped: pro)");
    expect(fake.text()).toContain("partner");
  });
});

describe("storeBilling", () => {
  it("shows entitlement, usage and the fee this store actually owes", async () => {
    const { ctx, fake } = createFakeContext({
      caller: { billing: { getStatus: async () => status } },
    });

    await storeBilling(ctx);
    expect(fake.text()).toContain("entitled plan");
    expect(fake.text()).toContain("4 / 30");
    expect(fake.text()).toContain("fee owed (month)");
    expect(fake.text()).toContain("would save CHF 15.00");
  });
});

describe("changePlan", () => {
  it("moves the store and warns that Stripe owns the column", async () => {
    const setTenantPlan = vi.fn(async () => ({ success: true }));
    const { ctx, fake } = createFakeContext({
      answers: ["pro", "y"],
      platform: { platform: { setTenantPlan } },
    });

    await changePlan(ctx);
    expect(setTenantPlan).toHaveBeenCalledWith({
      tenantId: fakeTenant.id,
      plan: "pro",
    });
    expect(fake.text()).toContain("Stripe owns this column");
  });

  it("does nothing when the store is already on that plan", async () => {
    const setTenantPlan = vi.fn();
    const { ctx, fake } = createFakeContext({
      answers: ["free"],
      platform: { platform: { setTenantPlan } },
    });

    await changePlan(ctx);
    expect(setTenantPlan).not.toHaveBeenCalled();
    expect(fake.text()).toContain("already on free");
  });

  it("writes nothing when the confirmation is declined", async () => {
    const setTenantPlan = vi.fn();
    const { ctx } = createFakeContext({
      answers: ["pro", "n"],
      platform: { platform: { setTenantPlan } },
    });

    await changePlan(ctx);
    expect(setTenantPlan).not.toHaveBeenCalled();
  });
});

describe("compStore", () => {
  it("grants a plan and a fee waiver with a reason", async () => {
    const setTenantComp = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["pro", "y", "design partner", "y"],
      platform: { platform: { setTenantComp } },
    });

    await compStore(ctx);
    expect(setTenantComp).toHaveBeenCalledWith({
      tenantId: fakeTenant.id,
      plan: "pro",
      waiveOnlineFee: true,
      note: "design partner",
    });
  });

  it("refuses a comp that grants nothing, and points at the revoke option", async () => {
    const setTenantComp = vi.fn();
    const { ctx, fake } = createFakeContext({
      answers: ["none", "n"],
      platform: { platform: { setTenantComp } },
    });

    await compStore(ctx);
    expect(setTenantComp).not.toHaveBeenCalled();
    expect(fake.text()).toContain("Revoke a comp");
  });

  it("shows the comp already in place before changing it", async () => {
    const comped = {
      ...fakeTenant,
      compPlan: "pro",
      compFeeWaived: true,
      compNote: "launch apology",
    } as unknown as Tenant;
    const { ctx, fake } = createFakeContext({
      answers: [""],
      tenant: comped,
      platform: { platform: { setTenantComp: vi.fn() } },
    });

    await compStore(ctx);
    expect(fake.text()).toContain("already comped");
    expect(fake.text()).toContain("launch apology");
  });
});

describe("revokeComp", () => {
  const comped = {
    ...fakeTenant,
    compPlan: "pro",
    compFeeWaived: true,
    compNote: "launch apology",
  } as unknown as Tenant;

  it("clears both halves of the grant", async () => {
    const setTenantComp = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["y"],
      tenant: comped,
      platform: { platform: { setTenantComp } },
    });

    await revokeComp(ctx);
    expect(setTenantComp).toHaveBeenCalledWith({
      tenantId: comped.id,
      plan: null,
      waiveOnlineFee: false,
    });
  });

  it("says the paid plan is untouched — a merchant who has since subscribed keeps it", async () => {
    const { ctx, fake } = createFakeContext({
      answers: ["n"],
      tenant: comped,
      platform: { platform: { setTenantComp: vi.fn() } },
    });

    await revokeComp(ctx);
    expect(fake.text()).toContain("Its paid plan (free) is untouched");
  });

  it("does nothing for a store that was never comped", async () => {
    const setTenantComp = vi.fn();
    const { ctx, fake } = createFakeContext({
      platform: { platform: { setTenantComp } },
    });

    await revokeComp(ctx);
    expect(setTenantComp).not.toHaveBeenCalled();
    expect(fake.text()).toContain("no comp to revoke");
  });
});

describe("photoCredits", () => {
  it("renders the ledger with grants and consumption distinguishable", async () => {
    const { ctx, fake } = createFakeContext({
      caller: {
        billing: {
          photoCreditHistory: async () => [
            {
              id: 1,
              kind: "monthly_grant",
              delta: 30,
              ref: null,
              note: null,
              createdAt: new Date("2026-03-01T00:00:00Z"),
            },
            {
              id: 2,
              kind: "consumption",
              delta: -1,
              ref: "product:5",
              note: null,
              createdAt: new Date("2026-03-02T00:00:00Z"),
            },
          ],
        },
      },
    });

    await photoCredits(ctx);
    expect(fake.text()).toContain("+30");
    expect(fake.text()).toContain("-1");
    expect(fake.text()).toContain("product:5");
  });

  it("says so for a store that has never used the feature", async () => {
    const { ctx, fake } = createFakeContext({
      caller: { billing: { photoCreditHistory: async () => [] } },
    });

    await photoCredits(ctx);
    expect(fake.text()).toContain("never generated an AI photo");
  });
});
