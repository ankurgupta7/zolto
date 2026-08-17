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
 *
 * `claimLookup` prepends one more read: with no `source: "web_till"` metadata
 * on the session, the dispatch first asks whether any pos_order owns the
 * session id before claiming the event as POS at all.
 */
function makeFulfilmentDb(
  order: Record<string, unknown> | undefined,
  items: Array<{ productId: number | null }>,
  claimLookup: "none" | "owned" | "unowned" = "none",
) {
  const results: unknown[][] = [order ? [order] : [], items];
  if (claimLookup !== "none") {
    results.unshift(claimLookup === "owned" && order ? [{ id: order.id }] : []);
  }
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

function postSession(
  session: Record<string, unknown>,
  type = "checkout.session.completed",
) {
  process.env.STRIPE_POS_WEBHOOK_SECRET = "whsec_pos_test";
  getStripe.mockReturnValue({
    webhooks: {
      constructEvent: vi.fn(() => ({
        type,
        // Stamped the way the till stamps its own sessions, since that is what
        // every session in this file is. It is also what lets the dispatch
        // claim the event without a database round-trip; a case passing
        // `metadata: null` exercises the pos_order lookup instead.
        data: { object: { metadata: { source: "web_till" }, ...session } },
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

// A delayed-notification payment method completes its session BEFORE the money
// arrives, so `completed` deliberately leaves the order pending. These are the
// events that say how it ended — without them such an order never resolves
// either way, and neither does a QR nobody scanned.
describe("the other three endings of a till Checkout Session", () => {
  it("fulfils the sale when a delayed payment finally succeeds", async () => {
    const { db, updateSet } = makeFulfilmentDb(
      { id: 5, tenantId: TENANT_ID, status: "pending" },
      [{ productId: 1 }],
    );
    getDb.mockResolvedValue(db);

    const res = await postSession(
      { id: "cs_test_1", payment_status: "paid", payment_intent: "pi_test_9" },
      "checkout.session.async_payment_succeeded",
    );

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({
      status: "paid",
      stripePaymentIntentId: "pi_test_9",
    });
    expect(markProductsSold).toHaveBeenCalledWith(TENANT_ID, [1]);
  });

  it.each([
    "checkout.session.async_payment_failed",
    "checkout.session.expired",
  ])("marks the order failed on %s, and sells nothing", async (type) => {
    const { db, updateSet } = makeFulfilmentDb(
      { id: 5, tenantId: TENANT_ID, status: "pending" },
      [{ productId: 1 }],
    );
    getDb.mockResolvedValue(db);

    const res = await postSession(
      { id: "cs_test_1", status: "expired", payment_status: "unpaid" },
      type,
    );

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({ status: "failed" });
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("never downgrades a paid order, however late a terminal event arrives", async () => {
    // Webhook deliveries can arrive out of order. Marking a completed sale
    // failed would be worse than ignoring a stray event.
    const { db, updateSet } = makeFulfilmentDb(
      { id: 5, tenantId: TENANT_ID, status: "paid" },
      [{ productId: 1 }],
    );
    getDb.mockResolvedValue(db);

    const res = await postSession(
      { id: "cs_test_1", status: "expired", payment_status: "unpaid" },
      "checkout.session.expired",
    );

    expect(res.status).toBe(200);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("acknowledges a terminal event for a session it has no order for", async () => {
    const { db, updateSet } = makeFulfilmentDb(undefined, []);
    getDb.mockResolvedValue(db);

    const res = await postSession(
      { id: "cs_unknown", status: "expired" },
      "checkout.session.expired",
    );

    expect(res.status).toBe(200);
    expect(updateSet).not.toHaveBeenCalled();
  });
});

// Whether an event is a POS sale at all is decided on evidence, because this
// same dispatch now runs on the storefront and Connect endpoints too, where
// most Checkout Sessions are ordinary online orders. Metadata is the cheap
// proof; a pos_order owning the session id is the durable one.
describe("deciding a Checkout Session is a till sale", () => {
  it("claims a session with no metadata when a pos_order owns it", async () => {
    const { db, updateSet } = makeFulfilmentDb(
      { id: 5, tenantId: TENANT_ID, status: "pending" },
      [{ productId: 1 }],
      "owned",
    );
    getDb.mockResolvedValue(db);

    const res = await postSession({
      id: "cs_test_1",
      metadata: null,
      payment_status: "paid",
      payment_intent: "pi_test_9",
    });

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({
      status: "paid",
      stripePaymentIntentId: "pi_test_9",
    });
    expect(markProductsSold).toHaveBeenCalledWith(TENANT_ID, [1]);
  });

  it("leaves a session alone when nothing marks it as POS", async () => {
    // On this endpoint that means an acknowledged no-op. On the storefront and
    // Connect endpoints it is what lets an ordinary online order fall through
    // to storefront fulfilment untouched — see posStripeRouting.test.ts.
    const { db, updateSet } = makeFulfilmentDb(
      { id: 5, tenantId: TENANT_ID, status: "pending" },
      [{ productId: 1 }],
      "unowned",
    );
    getDb.mockResolvedValue(db);

    const res = await postSession({
      id: "cs_storefront_1",
      metadata: null,
      payment_status: "paid",
      payment_intent: "pi_test_9",
    });

    expect(res.status).toBe(200);
    expect(updateSet).not.toHaveBeenCalled();
    expect(markProductsSold).not.toHaveBeenCalled();
  });
});
