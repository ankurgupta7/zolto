/**
 * The POS webhook's Checkout Session branch — the web till's scan-to-pay sales.
 *
 * Kept apart from pos.test.ts because it needs a database mock shaped for
 * fulfilment (two chained reads plus an update), where that file's mocks are
 * shaped for the route handlers.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

const getDb = vi.fn();
const markProductsSold = vi.fn();

vi.mock("./db", () => ({
  getDb: (...args: unknown[]) => getDb(...args),
  markProductsSold: (...args: unknown[]) => markProductsSold(...args),
  getAllProducts: vi.fn().mockResolvedValue([]),
  getTenantByPosApiKey: vi.fn().mockResolvedValue(null),
  getTenantCategories: vi.fn().mockResolvedValue([]),
  getTenantSettings: vi.fn().mockResolvedValue(null),
  setTenantTerminalLocation: vi.fn(),
}));

const getStripe = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: () => getStripe(),
  isStripeConfigured: vi.fn().mockReturnValue(true),
}));

vi.mock("./_core/email", () => ({
  sendTransactionalEmail: vi.fn(),
  escapeHtml: (s: string) => s,
}));

vi.mock("./posPairing", () => ({ redeemPairingToken: vi.fn() }));
vi.mock("./rateLimit", () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ allowed: true }),
    reset: vi.fn(),
  }),
}));

import { registerPosWebhook } from "./pos";

const TENANT_ID = 7;
const originalWebhookSecret = process.env.STRIPE_POS_WEBHOOK_SECRET;

/**
 * Fulfilment reads the pos_order (with .limit(1)) then its line items
 * (without), so hand back each in turn from something both awaitable and
 * chainable.
 */
function makeFulfilmentDb(
  order: Record<string, unknown> | undefined,
  items: Array<{ productId: number | null }>,
) {
  const results: unknown[][] = [order ? [order] : [], items];
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const chain = () => {
    const rows = results.shift() ?? [];
    const promise = Promise.resolve(rows) as Promise<unknown[]> & {
      limit: () => Promise<unknown[]>;
    };
    promise.limit = () => Promise.resolve(rows);
    return promise;
  };
  return {
    updateSet,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(chain) })),
      })),
      update: vi.fn(() => ({ set: updateSet })),
    },
  };
}

function postSession(session: Record<string, unknown>) {
  process.env.STRIPE_POS_WEBHOOK_SECRET = "whsec_pos_test";
  getStripe.mockReturnValue({
    webhooks: {
      constructEvent: vi.fn(() => ({
        type: "checkout.session.completed",
        data: { object: session },
      })),
    },
  });

  const app = express();
  registerPosWebhook(app);
  return request(app)
    .post("/api/pos/webhook")
    .set("stripe-signature", "t=1,v1=valid")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ id: "evt_1" }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  if (originalWebhookSecret === undefined)
    delete process.env.STRIPE_POS_WEBHOOK_SECRET;
  else process.env.STRIPE_POS_WEBHOOK_SECRET = originalWebhookSecret;
});

describe("checkout.session.completed", () => {
  it("marks the order paid, sells the stock, and records the PaymentIntent", async () => {
    // The PaymentIntent id is written here because this is the first moment it
    // exists — an open Checkout Session has none, which is why the order was
    // matched by session id in the first place.
    const { db, updateSet } = makeFulfilmentDb(
      { id: 5, tenantId: TENANT_ID, status: "pending" },
      [{ productId: 1 }, { productId: null }],
    );
    getDb.mockResolvedValue(db);

    const res = await postSession({
      id: "cs_test_1",
      payment_status: "paid",
      payment_intent: "pi_test_9",
    });

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({
      status: "paid",
      stripePaymentIntentId: "pi_test_9",
    });
    // Custom line items have no product row to decrement.
    expect(markProductsSold).toHaveBeenCalledWith(TENANT_ID, [1]);
  });

  it("leaves the order pending when the money has not actually arrived", async () => {
    // A session can complete while a delayed-notification method is still
    // processing. Handing the piece over then would be handing it over unpaid.
    const { db, updateSet } = makeFulfilmentDb(
      { id: 5, tenantId: TENANT_ID, status: "pending" },
      [{ productId: 1 }],
    );
    getDb.mockResolvedValue(db);

    const res = await postSession({
      id: "cs_test_1",
      payment_status: "unpaid",
      payment_intent: "pi_test_9",
    });

    expect(res.status).toBe(200);
    expect(updateSet).not.toHaveBeenCalled();
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("does not sell anything twice when Stripe redelivers the event", async () => {
    const { db, updateSet } = makeFulfilmentDb(
      { id: 5, tenantId: TENANT_ID, status: "paid" },
      [{ productId: 1 }],
    );
    getDb.mockResolvedValue(db);

    const res = await postSession({
      id: "cs_test_1",
      payment_status: "paid",
      payment_intent: "pi_test_9",
    });

    expect(res.status).toBe(200);
    expect(updateSet).not.toHaveBeenCalled();
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("acknowledges a session with no matching order instead of retrying forever", async () => {
    const { db } = makeFulfilmentDb(undefined, []);
    getDb.mockResolvedValue(db);

    const res = await postSession({
      id: "cs_unknown",
      payment_status: "paid",
      payment_intent: "pi_test_9",
    });

    expect(res.status).toBe(200);
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("decrements stock for the store that made the sale, not a fixed one", async () => {
    const { db } = makeFulfilmentDb(
      { id: 5, tenantId: 42, status: "pending" },
      [{ productId: 3 }],
    );
    getDb.mockResolvedValue(db);

    await postSession({
      id: "cs_test_1",
      payment_status: "paid",
      payment_intent: "pi_test_9",
    });

    expect(markProductsSold).toHaveBeenCalledWith(42, [3]);
  });
});
