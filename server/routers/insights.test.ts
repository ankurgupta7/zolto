import { describe, it, expect, vi, beforeEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  getTenantSettings: vi.fn(),
}));

const insightsMock = vi.hoisted(() => ({
  computeInsights: vi.fn(),
  generateInsightsNarrative: vi.fn(),
}));

vi.mock("../db", () => dbMock);
vi.mock("../insights", () => insightsMock);

import { insightsRouter } from "./insights";
import type { TrpcContext } from "../_core/context";

const admin = {
  id: 1,
  openId: "google:a",
  role: "admin",
  tenantId: 42,
} as never;

function ctx(plan: string, userTenantId = 42): TrpcContext {
  return {
    req: { headers: {} } as never,
    res: {} as never,
    user: { ...(admin as object), tenantId: userTenantId },
    tenant: { id: 42, slug: "aurora", name: "Aurora", plan },
  } as never;
}

const summary = {
  currency: "CHF",
  catalog: { total: 10, live: 8, sold: 2, avgPrice: 140 },
  last30d: {
    onlineOrders: 3,
    onlineRevenue: 420,
    posSales: 5,
    posRevenue: 600,
    totalRevenue: 1020,
    totalUnits: 8,
  },
  topSellers: [{ name: "Ring", units: 4, revenue: 400 }],
  staleStock: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getTenantSettings.mockResolvedValue({ currency: "chf" });
  insightsMock.computeInsights.mockResolvedValue(summary);
  insightsMock.generateInsightsNarrative.mockResolvedValue(
    "Observations\n- ...\nActions\n- ...",
  );
});

describe("insights.summary", () => {
  it("returns computed stats on any plan", async () => {
    const res = await insightsRouter.createCaller(ctx("free")).summary();
    expect(res.last30d.totalRevenue).toBe(1020);
    expect(insightsMock.computeInsights).toHaveBeenCalledWith(42, "chf");
  });

  it("defaults the currency to chf when no settings exist", async () => {
    dbMock.getTenantSettings.mockResolvedValue(null);
    await insightsRouter.createCaller(ctx("free")).summary();
    expect(insightsMock.computeInsights).toHaveBeenCalledWith(42, "chf");
  });
});

describe("insights.narrative", () => {
  it("is FORBIDDEN on the free plan (basic analytics)", async () => {
    await expect(
      insightsRouter.createCaller(ctx("free")).narrative(),
    ).rejects.toThrow(/Pro plan/);
    expect(insightsMock.generateInsightsNarrative).not.toHaveBeenCalled();
  });

  it("is FORBIDDEN on the free plan (basic analytics)", async () => {
    await expect(
      insightsRouter.createCaller(ctx("free")).narrative(),
    ).rejects.toThrow(/Pro plan/);
  });

  it("returns the narrative on pro (advanced analytics)", async () => {
    const res = await insightsRouter.createCaller(ctx("pro")).narrative();
    expect(res.narrative).toContain("Observations");
    expect(insightsMock.generateInsightsNarrative).toHaveBeenCalledWith(
      "Aurora",
      summary,
    );
  });
});

// Regression: insights read ctx.tenant (host-derived) behind a local
// `adminProcedure.use(requireTenant)` alias with no belongs-to-this-tenant
// check — so an admin of any store could read another store's revenue,
// top sellers, and stale stock by pointing at its subdomain.
describe("insights cross-tenant guard", () => {
  it("refuses to compute another store's summary", async () => {
    await expect(
      insightsRouter.createCaller(ctx("free", 999)).summary(),
    ).rejects.toThrow();
  });

  it("refuses to narrate another store's numbers", async () => {
    await expect(
      insightsRouter.createCaller(ctx("pro", 999)).narrative(),
    ).rejects.toThrow();
  });

  it("still serves the store's own admin", async () => {
    await expect(
      insightsRouter.createCaller(ctx("free")).summary(),
    ).resolves.toBeDefined();
  });
});
