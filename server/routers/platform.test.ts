import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: { getPlatformMetrics: vi.fn() },
}));

vi.mock("../db", () => dbMock);

const runStripeReconciliationForAllTenants = vi.fn();
vi.mock("../reconciliation", () => ({
  runStripeReconciliationForAllTenants: (...args: unknown[]) =>
    runStripeReconciliationForAllTenants(...args),
}));

import { platformRouter } from "./platform";
import type { TrpcContext } from "../_core/context";

const metrics = {
  month: "2026-07",
  tenants: { total: 10, free: 8, pro: 2 },
  northStar: {
    freeInPersonVendors: 6,
    freeInPersonVendorsSellingOnline: 3,
    conversionPct: 50,
  },
  online: {
    gmvChf: 4200,
    feeChf: 42,
    orders: 61,
    agentGmvChf: 900,
    agentOrders: 12,
    sellingTenants: 5,
  },
  inPerson: { gmvChf: 18000, orders: 320, sellingTenants: 7 },
  subscriptions: { active: 2, trialing: 1, pastDue: 0, canceled: 3 },
};

function ctx(role: string | null): TrpcContext {
  return {
    req: { headers: {} } as never,
    res: {} as never,
    user: role ? ({ id: 1, role, tenantId: 7 } as never) : null,
    tenant: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getPlatformMetrics.mockResolvedValue(metrics);
});

describe("platformRouter.metrics — access", () => {
  it("is superadmin only — cross-tenant data must never leak to a store owner", async () => {
    for (const role of [null, "customer", "staff", "admin"]) {
      const caller = platformRouter.createCaller(ctx(role));
      await expect(caller.metrics()).rejects.toThrow();
    }
    expect(dbMock.getPlatformMetrics).not.toHaveBeenCalled();
  });

  it("allows the platform owner", async () => {
    const caller = platformRouter.createCaller(ctx("superadmin"));
    const res = await caller.metrics();
    expect(res.month).toBe("2026-07");
  });
});

describe("platformRouter.metrics — payload", () => {
  it("returns the north star and the channel split", async () => {
    const caller = platformRouter.createCaller(ctx("superadmin"));
    const res = await caller.metrics();
    expect(res.northStar.conversionPct).toBe(50);
    expect(res.online.agentOrders).toBe(12);
    // In-person is reported but never monetized — it has no fee field at all.
    expect(res.inPerson).not.toHaveProperty("feeChf");
  });

  it("states the pricing model it is measuring, from the shared source", async () => {
    const caller = platformRouter.createCaller(ctx("superadmin"));
    const res = await caller.metrics();
    expect(res.model.feePercentLabel).toBe("1%");
    expect(res.model.proPriceChf).toBe(25);
  });
});

const sweep = {
  tenantsScanned: 2,
  tenantsFailed: 0,
  perTenant: [
    {
      tenantId: 1,
      slug: "a",
      name: "A",
      ok: true as const,
      scannedSucceededPayments: 3,
      alreadyRecorded: 1,
      newPendingReview: 2,
      newNoCandidates: 0,
      emailSent: true,
    },
  ],
  totals: {
    scannedSucceededPayments: 3,
    alreadyRecorded: 1,
    newPendingReview: 2,
    newNoCandidates: 0,
    emailsSent: 1,
  },
};

// The operator's cross-tenant sweep. It reads every merchant's Stripe account,
// so superadmin is the only role that may reach it — a store admin running
// this would see every other store's payment volume.
describe("platform.reconcileAllTenants", () => {
  beforeEach(() => {
    runStripeReconciliationForAllTenants.mockResolvedValue(sweep);
  });

  it("refuses an anonymous caller", async () => {
    await expect(
      platformRouter.createCaller(ctx(null)).reconcileAllTenants({}),
    ).rejects.toThrow();
    expect(runStripeReconciliationForAllTenants).not.toHaveBeenCalled();
  });

  it("refuses a store admin", async () => {
    await expect(
      platformRouter.createCaller(ctx("admin")).reconcileAllTenants({}),
    ).rejects.toThrow(/Superadmin/);
    expect(runStripeReconciliationForAllTenants).not.toHaveBeenCalled();
  });

  it("runs the sweep for a superadmin and returns per-tenant results", async () => {
    const result = await platformRouter
      .createCaller(ctx("superadmin"))
      .reconcileAllTenants({ lookbackDays: 14 });

    expect(runStripeReconciliationForAllTenants).toHaveBeenCalledWith(14);
    expect(result).toEqual(sweep);
  });

  it("passes undefined lookbackDays through when omitted", async () => {
    await platformRouter
      .createCaller(ctx("superadmin"))
      .reconcileAllTenants({});
    expect(runStripeReconciliationForAllTenants).toHaveBeenCalledWith(
      undefined,
    );
  });

  it("rejects an out-of-range lookbackDays", async () => {
    const caller = platformRouter.createCaller(ctx("superadmin"));
    await expect(
      caller.reconcileAllTenants({ lookbackDays: 0 }),
    ).rejects.toThrow();
    await expect(
      caller.reconcileAllTenants({ lookbackDays: 91 }),
    ).rejects.toThrow();
    expect(runStripeReconciliationForAllTenants).not.toHaveBeenCalled();
  });
});
