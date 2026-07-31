import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock, billingMock, photoCreditsMock } = vi.hoisted(() => ({
  dbMock: {
    getPhotoCreditHistory: vi.fn(),
    getMonthlyOnlineSales: vi.fn(),
    getTenantStorageBytes: vi.fn(),
  },
  billingMock: {
    createPlanCheckoutSession: vi.fn(),
    isBillingConfigured: vi.fn(() => true),
  },
  photoCreditsMock: {
    generateStyledProductPhoto: vi.fn(),
    countPhotoGenerationsThisMonth: vi.fn(),
    photoAllowanceForPlan: vi.fn((plan: string) => (plan === "pro" ? null : 5)),
  },
}));

vi.mock("../db", () => dbMock);
vi.mock("../billing", () => billingMock);
vi.mock("../photoCredits", () => photoCreditsMock);

import { billingRouter } from "./billing";
import type { TrpcContext } from "../_core/context";

const tenant = {
  id: 7,
  slug: "aurora",
  plan: "free",
  subscriptionStatus: "trialing",
  trialEndsAt: new Date("2026-08-01"),
} as never;

function ctx(
  role: string | null = "admin",
  tenantOverrides: Record<string, unknown> = {},
  // The store the request addresses (host-derived). Defaults to the admin's
  // own store; override to exercise the cross-tenant guard.
  userTenantId = 7,
): TrpcContext {
  return {
    req: { headers: {} } as never,
    res: {} as never,
    user: role
      ? ({ id: 1, openId: "google:1", role, tenantId: userTenantId } as never)
      : null,
    tenant: role
      ? ({ ...(tenant as object), ...tenantOverrides } as never)
      : null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  photoCreditsMock.photoAllowanceForPlan.mockImplementation((plan: string) =>
    plan === "pro" ? null : 5,
  );
  photoCreditsMock.countPhotoGenerationsThisMonth.mockResolvedValue(2);
  dbMock.getTenantStorageBytes.mockResolvedValue(1024 ** 3); // 1 GB used
  dbMock.getMonthlyOnlineSales.mockResolvedValue({
    gmvRappen: 320_000, // CHF 3,200
    feeRappen: 3_200, // CHF 32 — 1% of GMV
    agentGmvRappen: 50_000,
    orderCount: 12,
  });
  dbMock.getPhotoCreditHistory.mockResolvedValue([
    { id: 1, tenantId: 7, delta: -1, kind: "consumption" },
  ]);
  billingMock.createPlanCheckoutSession.mockResolvedValue({
    url: "https://checkout.stripe.com/plan",
  });
  photoCreditsMock.generateStyledProductPhoto.mockResolvedValue({
    imageUrl: "https://cdn.example.com/styled.png",
    remainingThisMonth: 2,
  });
});

describe("billingRouter auth", () => {
  it("rejects anonymous callers", async () => {
    const caller = billingRouter.createCaller(ctx(null));
    await expect(caller.getStatus()).rejects.toThrow();
  });

  it("rejects non-admin staff", async () => {
    const caller = billingRouter.createCaller(ctx("staff"));
    await expect(caller.getStatus()).rejects.toThrow();
  });
});

describe("billingRouter.getStatus", () => {
  it("returns plan, AI usage, online fees, and the two plans", async () => {
    const caller = billingRouter.createCaller(ctx());
    const status = await caller.getStatus();

    expect(status.plan).toBe("free");
    expect(status.ai).toEqual({ allowancePerMonth: 5, usedThisMonth: 2 });
    expect(status.onlineFees.monthGmvChf).toBe(3200);
    expect(status.onlineFees.monthFeeChf).toBe(32);
    expect(status.onlineFees.monthAgentGmvChf).toBe(500);
    expect(status.plans.map((p) => p.id)).toEqual(["free", "pro"]);
    expect(status.billingConfigured).toBe(true);
  });

  it("reports storage used against the plan's limit", async () => {
    // Shown in the admin so a merchant sees where they stand before an upload
    // is refused, rather than discovering the cap by hitting it.
    const caller = billingRouter.createCaller(ctx());
    const status = await caller.getStatus();
    expect(status.storage).toEqual({
      usedBytes: 1024 ** 3,
      limitBytes: 5 * 1024 ** 3, // Free = the 5 GB on the pricing card
    });
  });

  it("reports Pro's larger storage limit", async () => {
    const caller = billingRouter.createCaller(ctx("admin", { plan: "pro" }));
    const status = await caller.getStatus();
    expect(status.storage.limitBytes).toBe(50 * 1024 ** 3);
  });

  it("computes the skim-vs-Pro upsell for Free tenants", async () => {
    // CHF 32 in fees this month vs Pro at CHF 25 → CHF 7 to save.
    const caller = billingRouter.createCaller(ctx());
    const status = await caller.getStatus();
    expect(status.upsell).toEqual({
      breakEvenOnlineChf: 2500,
      proPriceChf: 25,
      savingsChf: 7,
    });
  });

  it("reports unmetered AI and no upsell on Pro", async () => {
    const caller = billingRouter.createCaller(ctx("admin", { plan: "pro" }));
    const status = await caller.getStatus();
    expect(status.ai).toEqual({ allowancePerMonth: null, usedThisMonth: null });
    expect(status.upsell).toBeNull();
    expect(
      photoCreditsMock.countPhotoGenerationsThisMonth,
    ).not.toHaveBeenCalled();
  });
});

describe("billingRouter.checkout mutations", () => {
  it("creates a Pro plan checkout", async () => {
    const caller = billingRouter.createCaller(ctx());
    const { url } = await caller.createPlanCheckout({ plan: "pro" });
    expect(url).toContain("checkout.stripe.com");
    expect(billingMock.createPlanCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "pro" }),
    );
  });

  it("rejects the free plan as a checkout target", async () => {
    const caller = billingRouter.createCaller(ctx());
    await expect(
      caller.createPlanCheckout({ plan: "free" as never }),
    ).rejects.toThrow();
    expect(billingMock.createPlanCheckoutSession).not.toHaveBeenCalled();
  });

  it("rejects the retired paid tiers as checkout targets", async () => {
    const caller = billingRouter.createCaller(ctx());
    for (const plan of ["maker", "studio", "atelier"]) {
      await expect(
        caller.createPlanCheckout({ plan: plan as never }),
      ).rejects.toThrow();
    }
    expect(billingMock.createPlanCheckoutSession).not.toHaveBeenCalled();
  });

  it("surfaces billing misconfiguration as a readable error", async () => {
    billingMock.createPlanCheckoutSession.mockRejectedValue(
      new Error("STRIPE_PRICE_PRO unset"),
    );
    const caller = billingRouter.createCaller(ctx());
    await expect(caller.createPlanCheckout({ plan: "pro" })).rejects.toThrow(
      /STRIPE_PRICE_PRO/,
    );
  });
});

describe("billingRouter.generateProductPhoto", () => {
  it("delegates to the photo service with the tenant's plan", async () => {
    const caller = billingRouter.createCaller(ctx());
    const result = await caller.generateProductPhoto({
      productId: 42,
      stylePrompt: "Clean catalogue shot",
    });
    expect(result.imageUrl).toContain("styled.png");
    expect(photoCreditsMock.generateStyledProductPhoto).toHaveBeenCalledWith({
      tenantId: 7,
      plan: "free",
      productId: 42,
      stylePrompt: "Clean catalogue shot",
    });
  });

  it("rejects empty prompts", async () => {
    const caller = billingRouter.createCaller(ctx());
    await expect(
      caller.generateProductPhoto({ productId: 42, stylePrompt: "x" }),
    ).rejects.toThrow();
  });
});

describe("billingRouter.photoCreditHistory", () => {
  it("returns the tenant's generation log", async () => {
    const caller = billingRouter.createCaller(ctx());
    const history = await caller.photoCreditHistory();
    expect(history).toHaveLength(1);
    expect(dbMock.getPhotoCreditHistory).toHaveBeenCalledWith(7);
  });
});

// Regression: every procedure here read/wrote ctx.tenant (host-derived) behind
// a local `adminProcedure.use(requireTenant)` alias with no belongs-to-this-
// tenant check, so an admin of store A hitting store B's subdomain could read
// B's revenue, start a subscription for B, and burn B's AI allowance.
describe("billing cross-tenant guard", () => {
  const OTHER = 999; // an admin of some other store

  it("refuses to reveal another store's billing status", async () => {
    const caller = billingRouter.createCaller(ctx("admin", {}, OTHER));
    await expect(caller.getStatus()).rejects.toThrow();
  });

  it("refuses to start a subscription for another store", async () => {
    const caller = billingRouter.createCaller(ctx("admin", {}, OTHER));
    await expect(caller.createPlanCheckout({ plan: "pro" })).rejects.toThrow();
    expect(billingMock.createPlanCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses to burn another store's AI photo allowance", async () => {
    const caller = billingRouter.createCaller(ctx("admin", {}, OTHER));
    await expect(
      caller.generateProductPhoto({ productId: 1, stylePrompt: "on white" }),
    ).rejects.toThrow();
    expect(photoCreditsMock.generateStyledProductPhoto).not.toHaveBeenCalled();
  });

  it("refuses to read another store's AI usage log", async () => {
    const caller = billingRouter.createCaller(ctx("admin", {}, OTHER));
    await expect(caller.photoCreditHistory()).rejects.toThrow();
  });

  it("still serves the store's own admin", async () => {
    const caller = billingRouter.createCaller(ctx("admin"));
    await expect(caller.getStatus()).resolves.toMatchObject({ plan: "free" });
  });
});
