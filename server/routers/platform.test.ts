import { describe, it, expect, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    getPlatformMetrics: vi.fn(),
    listTenantsForOperator: vi.fn(),
    getTenantDetailForOperator: vi.fn(),
    setTenantUserRoleByOperator: vi.fn(),
    setTenantPlanByOperator: vi.fn(),
    getTenantBySlug: vi.fn(),
    createTenant: vi.fn(),
    createTenantSettings: vi.fn(),
    setTenantPosApiKeyHash: vi.fn(),
  },
}));

vi.mock("../db", () => dbMock);

const runStripeReconciliationForAllTenants = vi.fn();
vi.mock("../reconciliation", () => ({
  runStripeReconciliationForAllTenants: (...args: unknown[]) =>
    runStripeReconciliationForAllTenants(...args),
}));

import { platformRouter, POS_TEST_TENANT_SLUG } from "./platform";
import { hashPosApiKey } from "../posApiKey";
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

const tenantRows = [
  {
    id: 1,
    slug: "kalakosh",
    name: "Kalakosh",
    domain: null,
    plan: "pro" as const,
    subscriptionStatus: "active" as const,
    trialEndsAt: null,
    createdAt: new Date("2026-01-05T00:00:00Z"),
    stripeConnected: true,
    adminCount: 1,
    userCount: 3,
  },
  {
    id: 2,
    slug: "orphan",
    name: "Orphan Store",
    domain: null,
    plan: "free" as const,
    subscriptionStatus: "trialing" as const,
    trialEndsAt: null,
    createdAt: new Date("2026-02-05T00:00:00Z"),
    stripeConnected: false,
    adminCount: 0,
    userCount: 2,
  },
];

const tenantDetail = {
  tenant: {
    ...tenantRows[1],
    onboardingStep: 2,
    referralCode: "ABC123",
  },
  users: [
    {
      id: 11,
      email: "owner@example.com",
      name: "Owner",
      role: "customer" as const,
      loginMethod: "google",
      pendingClaim: false,
      lastSignedIn: new Date("2026-07-01T00:00:00Z"),
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getPlatformMetrics.mockResolvedValue(metrics);
  dbMock.listTenantsForOperator.mockResolvedValue(tenantRows);
  dbMock.getTenantDetailForOperator.mockResolvedValue(tenantDetail);
  dbMock.setTenantUserRoleByOperator.mockResolvedValue(true);
  dbMock.setTenantPlanByOperator.mockResolvedValue(true);
});

// This endpoint replaced `tenant.list`, which shipped as a publicProcedure
// with a "TODO: Add superadmin guard" — unauthenticated enumeration of every
// store on the platform. The anonymous case is the one that regressed; the
// cross-tenant case (an admin of store A reading store B) is the one CLAUDE.md
// warns silently regresses, so both are pinned here.
describe("platform.tenants — access", () => {
  it("refuses every non-superadmin caller, including a store admin", async () => {
    for (const role of [null, "customer", "staff", "admin"]) {
      await expect(
        platformRouter.createCaller(ctx(role)).tenants(),
      ).rejects.toThrow();
    }
    expect(dbMock.listTenantsForOperator).not.toHaveBeenCalled();
  });

  it("refuses an admin of another tenant with an explicit superadmin error", async () => {
    await expect(
      platformRouter.createCaller(ctx("admin")).tenants(),
    ).rejects.toThrow(/Superadmin/);
  });

  it("returns every store to the platform owner", async () => {
    const res = await platformRouter.createCaller(ctx("superadmin")).tenants();
    expect(res).toHaveLength(2);
    expect(res.map((t) => t.slug)).toEqual(["kalakosh", "orphan"]);
  });

  it("never returns the POS API key, the credential the old endpoint stripped by hand", async () => {
    const res = await platformRouter.createCaller(ctx("superadmin")).tenants();
    for (const t of res) {
      expect(t).not.toHaveProperty("posApiKey");
    }
  });

  it("surfaces stores with no admin — the usual cause of 'I can't press anything'", async () => {
    const res = await platformRouter.createCaller(ctx("superadmin")).tenants();
    expect(res.find((t) => t.slug === "orphan")?.adminCount).toBe(0);
  });
});

// Every operator action reaches across tenants by definition, so the guard is
// the whole security model. Anonymous rarely regresses; the admin-of-another-
// store case is the one that silently does (CLAUDE.md), so it is pinned on
// each mutation, not just the reads.
describe("platform operator actions — access", () => {
  const cases: Array<[string, (c: ReturnType<typeof callerFor>) => unknown]> = [
    ["tenantDetail", (c) => c.tenantDetail({ tenantId: 2 })],
    [
      "setTenantUserRole",
      (c) => c.setTenantUserRole({ tenantId: 2, userId: 11, role: "admin" }),
    ],
    ["setTenantPlan", (c) => c.setTenantPlan({ tenantId: 2, plan: "pro" })],
  ];

  function callerFor(role: string | null) {
    return platformRouter.createCaller(ctx(role));
  }

  for (const [name, call] of cases) {
    it(`${name} refuses an admin of another tenant`, async () => {
      await expect(call(callerFor("admin"))).rejects.toThrow(/Superadmin/);
    });

    it(`${name} refuses anonymous and staff callers`, async () => {
      await expect(call(callerFor(null))).rejects.toThrow();
      await expect(call(callerFor("staff"))).rejects.toThrow();
    });
  }

  it("performs no write when the caller is refused", async () => {
    await expect(
      callerFor("admin").setTenantUserRole({
        tenantId: 2,
        userId: 11,
        role: "admin",
      }),
    ).rejects.toThrow();
    await expect(
      callerFor("admin").setTenantPlan({ tenantId: 2, plan: "pro" }),
    ).rejects.toThrow();
    expect(dbMock.setTenantUserRoleByOperator).not.toHaveBeenCalled();
    expect(dbMock.setTenantPlanByOperator).not.toHaveBeenCalled();
  });
});

describe("platform.tenantDetail", () => {
  it("returns the store and everyone who can sign in to it", async () => {
    const res = await platformRouter
      .createCaller(ctx("superadmin"))
      .tenantDetail({ tenantId: 2 });
    expect(res.tenant.slug).toBe("orphan");
    expect(res.users).toHaveLength(1);
  });

  it("404s on a store that does not exist rather than returning an empty shell", async () => {
    dbMock.getTenantDetailForOperator.mockResolvedValue(null);
    await expect(
      platformRouter.createCaller(ctx("superadmin")).tenantDetail({
        tenantId: 999,
      }),
    ).rejects.toThrow(/No such store/);
  });
});

describe("platform.setTenantUserRole", () => {
  it("promotes a store's user to its admin", async () => {
    const res = await platformRouter
      .createCaller(ctx("superadmin"))
      .setTenantUserRole({ tenantId: 2, userId: 11, role: "admin" });
    expect(dbMock.setTenantUserRoleByOperator).toHaveBeenCalledWith(
      2,
      11,
      "admin",
    );
    expect(res.success).toBe(true);
  });

  it("cannot grant platform ownership — superadmin is not an accepted role", async () => {
    await expect(
      platformRouter.createCaller(ctx("superadmin")).setTenantUserRole({
        tenantId: 2,
        userId: 11,
        // Deliberately outside the input enum: the console hands out a store's
        // keys, never the platform's.
        role: "superadmin",
      } as never),
    ).rejects.toThrow();
    expect(dbMock.setTenantUserRoleByOperator).not.toHaveBeenCalled();
  });

  it("refuses when the user is not on that store, instead of silently no-oping", async () => {
    dbMock.setTenantUserRoleByOperator.mockResolvedValue(false);
    await expect(
      platformRouter
        .createCaller(ctx("superadmin"))
        .setTenantUserRole({ tenantId: 2, userId: 11, role: "admin" }),
    ).rejects.toThrow(/not on that store/);
  });
});

describe("platform.setTenantPlan", () => {
  it("moves a store between plans", async () => {
    const res = await platformRouter
      .createCaller(ctx("superadmin"))
      .setTenantPlan({ tenantId: 2, plan: "pro" });
    expect(dbMock.setTenantPlanByOperator).toHaveBeenCalledWith(2, "pro");
    expect(res.success).toBe(true);
  });

  it("rejects a plan id that is not in the schema", async () => {
    await expect(
      platformRouter
        .createCaller(ctx("superadmin"))
        .setTenantPlan({ tenantId: 2, plan: "enterprise" } as never),
    ).rejects.toThrow();
  });

  it("404s on a store that does not exist", async () => {
    dbMock.setTenantPlanByOperator.mockResolvedValue(false);
    await expect(
      platformRouter
        .createCaller(ctx("superadmin"))
        .setTenantPlan({ tenantId: 999, plan: "pro" }),
    ).rejects.toThrow(/No such store/);
  });
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

// The platform's own POS test key: what the POS apps' CI authenticates with,
// so pipelines never skip a test for lack of a key. It must stay an entirely
// ordinary tenant key — the tests pin that it is stored hashed through the
// same helpers as a merchant's, with no special-case auth path to drift.
describe("platform.rotatePosTestKey", () => {
  it("refuses every non-superadmin caller, including a store admin", async () => {
    for (const role of [null, "customer", "staff", "admin"]) {
      await expect(
        platformRouter.createCaller(ctx(role)).rotatePosTestKey(),
      ).rejects.toThrow();
    }
    expect(dbMock.createTenant).not.toHaveBeenCalled();
    expect(dbMock.setTenantPosApiKeyHash).not.toHaveBeenCalled();
  });

  it("provisions the platform-tests store on first use and returns the key once", async () => {
    dbMock.getTenantBySlug.mockResolvedValue(undefined);
    dbMock.createTenant.mockResolvedValue(42);

    const res = await platformRouter
      .createCaller(ctx("superadmin"))
      .rotatePosTestKey();

    expect(res.tenantId).toBe(42);
    expect(res.slug).toBe(POS_TEST_TENANT_SLUG);
    // A real key, and only its hash was persisted.
    expect(res.posApiKey.length).toBeGreaterThanOrEqual(32);
    expect(dbMock.createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: POS_TEST_TENANT_SLUG,
        posApiKey: hashPosApiKey(res.posApiKey),
      }),
    );
    expect(dbMock.createTenant.mock.calls[0][0].posApiKey).not.toBe(
      res.posApiKey,
    );
    expect(dbMock.createTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 42 }),
    );
  });

  it("rotates in place when the platform-tests store already exists", async () => {
    dbMock.getTenantBySlug.mockResolvedValue({
      id: 7,
      slug: POS_TEST_TENANT_SLUG,
    });

    const res = await platformRouter
      .createCaller(ctx("superadmin"))
      .rotatePosTestKey();

    expect(res.tenantId).toBe(7);
    expect(dbMock.createTenant).not.toHaveBeenCalled();
    expect(dbMock.setTenantPosApiKeyHash).toHaveBeenCalledWith(
      7,
      hashPosApiKey(res.posApiKey),
    );
  });

  it("returns a fresh key on every rotation", async () => {
    dbMock.getTenantBySlug.mockResolvedValue({
      id: 7,
      slug: POS_TEST_TENANT_SLUG,
    });
    const caller = platformRouter.createCaller(ctx("superadmin"));
    const first = await caller.rotatePosTestKey();
    const second = await caller.rotatePosTestKey();
    expect(first.posApiKey).not.toBe(second.posApiKey);
  });
});
