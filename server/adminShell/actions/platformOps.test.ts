import { describe, expect, it, vi } from "vitest";
import { createFakeContext, fakeOperator } from "../fakeContext";
import {
  operatingMetrics,
  reconcileEveryStore,
  rotatePosTestKey,
  serviceHealth,
  whoAmI,
} from "./platformOps";

const metrics = {
  month: "2026-03",
  tenants: { total: 12, free: 10, pro: 2 },
  northStar: {
    freeInPersonVendors: 8,
    freeInPersonVendorsSellingOnline: 3,
    conversionPct: 37.5,
  },
  online: {
    gmvChf: 4200,
    feeChf: 42,
    orders: 31,
    agentGmvChf: 300,
    agentOrders: 4,
    sellingTenants: 5,
  },
  inPerson: { gmvChf: 9000, orders: 210, sellingTenants: 7 },
  subscriptions: { active: 2, trialing: 1, pastDue: 0, canceled: 1 },
  model: { feePercentLabel: "1%", proPriceChf: 25 },
};

describe("operatingMetrics", () => {
  it("leads with the north star, spelled out rather than left as a percentage", async () => {
    const { ctx, fake } = createFakeContext({
      platform: { platform: { metrics: async () => metrics } },
    });

    await operatingMetrics(ctx);
    expect(fake.text()).toContain(
      "37.5% of free in-person vendors also sell online (3/8)",
    );
    expect(fake.text()).toContain("CHF 42.00 (1%)");
    expect(fake.text()).toContain("2 active · 1 trialing");
  });

  it("copes with a platform too new to have a conversion rate", async () => {
    const { ctx, fake } = createFakeContext({
      platform: {
        platform: {
          metrics: async () => ({
            ...metrics,
            northStar: {
              freeInPersonVendors: 0,
              freeInPersonVendorsSellingOnline: 0,
              conversionPct: null,
            },
          }),
        },
      },
    });

    await operatingMetrics(ctx);
    expect(fake.text()).toContain("north star");
  });
});

describe("reconcileEveryStore", () => {
  const report = {
    tenantsScanned: 2,
    tenantsFailed: 1,
    perTenant: [
      {
        tenantId: 1,
        slug: "kalakosh",
        name: "Kalakosh",
        ok: true as const,
        scannedSucceededPayments: 10,
        alreadyRecorded: 9,
        newPendingReview: 1,
        newNoCandidates: 0,
        emailSent: true,
      },
      {
        tenantId: 2,
        slug: "broken",
        name: "Broken",
        ok: false as const,
        error: "Connect grant revoked",
      },
    ],
    totals: {
      scannedSucceededPayments: 10,
      alreadyRecorded: 9,
      newPendingReview: 1,
      newNoCandidates: 0,
      emailsSent: 1,
    },
  };

  it("shows every store, including the one that failed", async () => {
    const reconcileAllTenants = vi.fn(async () => report);
    const { ctx, fake } = createFakeContext({
      answers: ["", "y"],
      platform: { platform: { reconcileAllTenants } },
    });

    await reconcileEveryStore(ctx);
    expect(reconcileAllTenants).toHaveBeenCalledWith({ lookbackDays: 7 });
    expect(fake.text()).toContain("2 scanned, 1 failed");
    expect(fake.text()).toContain("Connect grant revoked");
    expect(fake.text()).toContain("1 emails sent");
  });

  it("warns that merchants get emailed, and stops on a declined confirmation", async () => {
    const reconcileAllTenants = vi.fn();
    const { ctx, fake } = createFakeContext({
      answers: ["", "n"],
      platform: { platform: { reconcileAllTenants } },
    });

    await reconcileEveryStore(ctx);
    expect(fake.text()).toContain("emails each merchant");
    expect(reconcileAllTenants).not.toHaveBeenCalled();
  });
});

describe("rotatePosTestKey", () => {
  it("says CI breaks until the secret is updated, then shows the key once", async () => {
    const rotate = vi.fn(async () => ({
      tenantId: 9,
      slug: "platform-tests",
      posApiKey: "pos_test_new",
    }));
    const { ctx, fake } = createFakeContext({
      answers: ["y"],
      platform: { platform: { rotatePosTestKey: rotate } },
    });

    await rotatePosTestKey(ctx);
    expect(fake.text()).toContain("breaks CI until");
    expect(fake.text()).toContain("pos_test_new");
  });

  it("rotates nothing without an explicit yes", async () => {
    const rotate = vi.fn();
    const { ctx } = createFakeContext({
      answers: [""],
      platform: { platform: { rotatePosTestKey: rotate } },
    });

    await rotatePosTestKey(ctx);
    expect(rotate).not.toHaveBeenCalled();
  });
});

describe("serviceHealth", () => {
  it("reports the round trip through the real procedure", async () => {
    const health = vi.fn(async () => ({ ok: true }));
    const { ctx, fake } = createFakeContext({
      platform: { system: { health } },
    });

    await serviceHealth(ctx);
    expect(health).toHaveBeenCalledWith({ timestamp: expect.any(Number) });
    expect(fake.text()).toContain("app + database");
    expect(fake.text()).toContain("ok");
  });
});

describe("whoAmI", () => {
  it("names the account whose authority the session carries", async () => {
    const { ctx, fake } = createFakeContext({});
    await whoAmI(ctx);
    expect(fake.text()).toContain(fakeOperator.email as string);
    expect(fake.text()).toContain("superadmin");
    expect(fake.text()).toContain("read-write");
    expect(fake.text()).toContain("operator-audit");
  });

  it("says when the shell cannot write", async () => {
    const { ctx, fake } = createFakeContext({ readOnly: true });
    await whoAmI(ctx);
    expect(fake.text()).toContain("read-only");
  });
});
