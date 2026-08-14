import { describe, expect, it, vi } from "vitest";
import type { Tenant } from "../../../drizzle/schema";
import { createFakeContext, fakeTenant } from "../fakeContext";
import {
  recentOrders,
  reconcilePos,
  reconcileStripe,
  refulfilSession,
  salesInsights,
} from "./orders";

const connected = {
  ...fakeTenant,
  stripeConnectedAccountId: "acct_123",
} as unknown as Tenant;

describe("recentOrders", () => {
  it("lists paid orders with a total", async () => {
    const listOrders = vi.fn(async () => [
      {
        id: 1,
        status: "paid",
        amountTotal: 12000,
        currency: "chf",
        customerName: "A",
        customerEmail: "a@example.com",
        paymentMethod: "card",
        createdAt: "2026-03-01T10:00:00.000Z",
        items: [{ id: 4, name: "Silver ring" }],
      },
      {
        id: 2,
        status: "paid",
        amountTotal: 3050,
        currency: "chf",
        customerName: null,
        customerEmail: null,
        paymentMethod: null,
        createdAt: "2026-03-02T10:00:00.000Z",
        items: [],
      },
    ]);
    const { ctx, fake } = createFakeContext({
      answers: ["10"],
      caller: { checkout: { listOrders } },
    });

    await recentOrders(ctx);
    expect(listOrders).toHaveBeenCalledWith({ limit: 10 });
    expect(fake.text()).toContain("CHF 120.00");
    expect(fake.text()).toContain("2 orders, CHF 150.50 in total.");
  });

  it("defaults the page size and explains that POS sales are elsewhere", async () => {
    const listOrders = vi.fn(async () => []);
    const { ctx, fake } = createFakeContext({
      answers: [""],
      caller: { checkout: { listOrders } },
    });

    await recentOrders(ctx);
    expect(listOrders).toHaveBeenCalledWith({ limit: 50 });
    expect(fake.text()).toContain("POS sales are not listed here");
  });
});

describe("refulfilSession", () => {
  it("re-runs fulfilment for the session id given", async () => {
    const fulfillSession = vi.fn(async () => ({ success: true }));
    const { ctx } = createFakeContext({
      answers: ["cs_test_123", "y"],
      caller: { checkout: { fulfillSession } },
    });

    await refulfilSession(ctx);
    expect(fulfillSession).toHaveBeenCalledWith({ sessionId: "cs_test_123" });
  });

  it("does nothing on a blank session id", async () => {
    const fulfillSession = vi.fn();
    const { ctx } = createFakeContext({
      answers: [""],
      caller: { checkout: { fulfillSession } },
    });

    await refulfilSession(ctx);
    expect(fulfillSession).not.toHaveBeenCalled();
  });
});

describe("reconcileStripe", () => {
  it("refuses early for a store with no connected Stripe account", async () => {
    const run = vi.fn();
    const { ctx, fake } = createFakeContext({
      caller: { reconciliation: { run } },
    });

    await reconcileStripe(ctx);
    expect(run).not.toHaveBeenCalled();
    expect(fake.text()).toContain("has not connected Stripe");
  });

  it("scans the store's own account and prints the report", async () => {
    const run = vi.fn(async () => ({
      scannedSucceededPayments: 12,
      alreadyRecorded: 10,
      newPendingReview: 2,
      newNoCandidates: 0,
      emailSent: true,
    }));
    const { ctx, fake } = createFakeContext({
      answers: ["14", "y"],
      tenant: connected,
      caller: { reconciliation: { run } },
    });

    await reconcileStripe(ctx);
    expect(run).toHaveBeenCalledWith({ lookbackDays: 14 });
    expect(fake.text()).toContain("newPendingReview: 2");
  });

  it("says plainly that it emails the merchant before doing it", async () => {
    const run = vi.fn();
    const { ctx, fake } = createFakeContext({
      answers: ["", "n"],
      tenant: connected,
      caller: { reconciliation: { run } },
    });

    await reconcileStripe(ctx);
    expect(fake.text()).toContain("email them to confirm");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("reconcilePos", () => {
  it("runs the end-of-day attribution pass", async () => {
    const runPos = vi.fn(async () => ({ scanned: 3, queued: 1 }));
    const { ctx, fake } = createFakeContext({
      answers: ["", "y"],
      caller: { reconciliation: { runPos } },
    });

    await reconcilePos(ctx);
    expect(runPos).toHaveBeenCalledWith({ lookbackDays: 3 });
    expect(fake.text()).toContain("queued: 1");
  });
});

describe("salesInsights", () => {
  it("prints whatever the summary contains, without modelling its shape", async () => {
    const { ctx, fake } = createFakeContext({
      caller: {
        insights: {
          summary: async () => ({
            catalog: { total: 12, live: 8 },
            online: { revenue: 4000 },
          }),
        },
      },
    });

    await salesInsights(ctx);
    expect(fake.text()).toContain("catalog.total: 12");
    expect(fake.text()).toContain("online.revenue: 4000");
  });
});
