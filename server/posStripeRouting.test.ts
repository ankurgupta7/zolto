/**
 * Which handler owns a Stripe event — POS fulfilment or storefront fulfilment.
 *
 * Three endpoints can deliver a POS sale's events, and the sale has to be
 * recorded once by whichever one gets it:
 *
 *   /api/pos/webhook             the platform account's POS endpoint
 *   /api/stripe/webhook          the platform account's storefront endpoint,
 *                                which ALSO receives a till session when the
 *                                store has not connected its own Stripe account
 *   /api/stripe/connect-webhook  events on a tenant's connected account, where
 *                                a connected store's till sessions and Terminal
 *                                payments fire — and which no platform-account
 *                                endpoint ever sees
 *
 * This file runs the real `./pos` and `./stripe` wiring against a fake database
 * — mocking the POS dispatch here would only assert the mock, and the whole
 * point is which of two real handlers gets the event.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

const getDb = vi.fn();
const markProductsSold = vi.fn();
const getOrderBySessionId = vi.fn();
const updateOrderBySessionId = vi.fn();
const createOrder = vi.fn();
const releaseProductReservations = vi.fn();
const getProductsByIds = vi.fn();
const getTenantAdminContact = vi.fn();
const getTenantById = vi.fn();
const getTenantSettings = vi.fn();

vi.mock("./db", () => ({
  getDb: (...a: unknown[]) => getDb(...a),
  markProductsSold: (...a: unknown[]) => markProductsSold(...a),
  getOrderBySessionId: (...a: unknown[]) => getOrderBySessionId(...a),
  updateOrderBySessionId: (...a: unknown[]) => updateOrderBySessionId(...a),
  createOrder: (...a: unknown[]) => createOrder(...a),
  releaseProductReservations: (...a: unknown[]) =>
    releaseProductReservations(...a),
  getProductsByIds: (...a: unknown[]) => getProductsByIds(...a),
  getTenantAdminContact: (...a: unknown[]) => getTenantAdminContact(...a),
  getTenantById: (...a: unknown[]) => getTenantById(...a),
  getTenantSettings: (...a: unknown[]) => getTenantSettings(...a),
  getAllProducts: vi.fn().mockResolvedValue([]),
  getTenantByPosApiKey: vi.fn().mockResolvedValue(null),
  getTenantCategories: vi.fn().mockResolvedValue([]),
  setTenantTerminalLocation: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
  notifyOwnerThrottled: vi.fn().mockResolvedValue(true),
}));
vi.mock("./_core/email", () => ({
  sendOrderReceipt: vi.fn().mockResolvedValue(undefined),
  sendOwnerOrderEmail: vi.fn().mockResolvedValue(undefined),
  sendTransactionalEmail: vi.fn(),
  escapeHtml: (s: string) => s,
}));
vi.mock("./discounts", () => ({
  confirmDiscountForSession: vi.fn().mockResolvedValue(undefined),
  releaseHeldProducts: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./billing", () => ({
  handleBillingEvent: vi.fn().mockResolvedValue(false),
}));
vi.mock("./posPairing", () => ({ redeemPairingToken: vi.fn() }));
vi.mock("./rateLimit", () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ allowed: true }),
    reset: vi.fn(),
  }),
}));

import Stripe from "stripe";
import { registerStripeWebhook } from "./stripe";

const PLATFORM_SECRET = "whsec_test_platform_secret";
const CONNECT_SECRET = "whsec_test_connect_secret";
const originalSecretKey = process.env.STRIPE_SECRET_KEY;
const originalPlatformSecret = process.env.STRIPE_WEBHOOK_SECRET;
const originalConnectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

/**
 * A fake database that answers the two reads POS fulfilment makes — the
 * pos_order (by session id or intent id, with `.limit(1)`) and its line items
 * — and records writes.
 */
function makeFakeDb(
  posOrder: Record<string, unknown> | undefined,
  items: Array<{ productId: number | null }> = [{ productId: 1 }],
) {
  const results: unknown[][] = [posOrder ? [posOrder] : [], items];
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

/** A Checkout Session as the web till creates it — note the metadata. */
function tillSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_till_1",
    payment_status: "paid",
    payment_intent: "pi_till_1",
    metadata: { source: "web_till", tenantId: "7", productIds: "1" },
    ...overrides,
  };
}

/** A Checkout Session as the storefront creates it. */
function storefrontSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_shop_1",
    payment_status: "paid",
    payment_intent: "pi_shop_1",
    payment_method_types: ["card"],
    customer_details: { email: null, name: null },
    metadata: { productIds: "9" },
    ...overrides,
  };
}

/**
 * Posts a genuinely signed event, so the real signature verification in
 * `registerStripeWebhook` runs rather than being mocked past — each endpoint
 * with its own secret, which is the difference that makes them two endpoints.
 */
function post(
  path: "/api/stripe/webhook" | "/api/stripe/connect-webhook",
  type: string,
  object: Record<string, unknown>,
) {
  const stripe = new Stripe("sk_test_123");
  const body = JSON.stringify({ id: "evt_1", type, data: { object } });
  const header = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: path.endsWith("connect-webhook") ? CONNECT_SECRET : PLATFORM_SECRET,
  });

  const app = express();
  registerStripeWebhook(app);
  return request(app)
    .post(path)
    .set("stripe-signature", header)
    .set("Content-Type", "application/json")
    .send(body);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  process.env.STRIPE_WEBHOOK_SECRET = PLATFORM_SECRET;
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = CONNECT_SECRET;
  getOrderBySessionId.mockResolvedValue(undefined);
  updateOrderBySessionId.mockResolvedValue(undefined);
  markProductsSold.mockResolvedValue(undefined);
  getProductsByIds.mockResolvedValue([]);
  getTenantAdminContact.mockResolvedValue(undefined);
  getTenantById.mockResolvedValue(undefined);
  getTenantSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = originalSecretKey;
  if (originalPlatformSecret === undefined)
    delete process.env.STRIPE_WEBHOOK_SECRET;
  else process.env.STRIPE_WEBHOOK_SECRET = originalPlatformSecret;
  if (originalConnectSecret === undefined)
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  else process.env.STRIPE_CONNECT_WEBHOOK_SECRET = originalConnectSecret;
});

describe("a till session on the PLATFORM storefront endpoint", () => {
  // This is not a hypothetical: a store with no connected Stripe account has
  // its till sessions created on the platform account, and that endpoint is
  // subscribed to checkout.session.completed.
  it("is never mistaken for a storefront order", async () => {
    // The dangerous part is fulfillOrder's recovery path: given no storefront
    // order it RECONSTRUCTS one from `productIds` metadata — which the till
    // also sets — under the deployment's DEFAULT_TENANT_ID, and then sells that
    // tenant's stock and emails a receipt for a sale that already exists.
    const { db } = makeFakeDb({ id: 5, tenantId: 7, status: "pending" });
    getDb.mockResolvedValue(db);

    const res = await post(
      "/api/stripe/webhook",
      "checkout.session.completed",
      tillSession(),
    );

    expect(res.status).toBe(200);
    expect(createOrder).not.toHaveBeenCalled();
    expect(updateOrderBySessionId).not.toHaveBeenCalled();
  });

  it("is fulfilled as the POS sale it is, against the till's own tenant", async () => {
    const { db, updateSet } = makeFakeDb({
      id: 5,
      tenantId: 7,
      status: "pending",
    });
    getDb.mockResolvedValue(db);

    await post(
      "/api/stripe/webhook",
      "checkout.session.completed",
      tillSession(),
    );

    expect(updateSet).toHaveBeenCalledWith({
      status: "paid",
      stripePaymentIntentId: "pi_till_1",
    });
    expect(markProductsSold).toHaveBeenCalledWith(7, [1]);
  });
});

describe("a connected store's POS events on the CONNECT endpoint", () => {
  // The till creates the session ON the connected account, so these events
  // fire there and no platform-account endpoint ever sees them.
  it("fulfils a scan-to-pay sale", async () => {
    const { db, updateSet } = makeFakeDb({
      id: 5,
      tenantId: 7,
      status: "pending",
    });
    getDb.mockResolvedValue(db);

    const res = await post(
      "/api/stripe/connect-webhook",
      "checkout.session.completed",
      tillSession(),
    );

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({
      status: "paid",
      stripePaymentIntentId: "pi_till_1",
    });
    expect(markProductsSold).toHaveBeenCalledWith(7, [1]);
  });

  it("fulfils a Terminal tap on the merchant's own account", async () => {
    // The native apps' Tap to Pay PaymentIntents are created on the connected
    // account too, so they arrive here rather than at /api/pos/webhook.
    const { db, updateSet } = makeFakeDb({
      id: 6,
      tenantId: 7,
      status: "pending",
    });
    getDb.mockResolvedValue(db);

    const res = await post(
      "/api/stripe/connect-webhook",
      "payment_intent.succeeded",
      {
        id: "pi_terminal_1",
      },
    );

    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({ status: "paid" });
    expect(markProductsSold).toHaveBeenCalledWith(7, [1]);
  });

  it("fails the order when a connected store's QR expires unpaid", async () => {
    const { db, updateSet } = makeFakeDb({
      id: 5,
      tenantId: 7,
      status: "pending",
    });
    getDb.mockResolvedValue(db);

    await post(
      "/api/stripe/connect-webhook",
      "checkout.session.expired",
      tillSession({ status: "expired", payment_status: "unpaid" }),
    );

    expect(updateSet).toHaveBeenCalledWith({ status: "failed" });
    expect(markProductsSold).not.toHaveBeenCalled();
  });
});

describe("storefront sales still belong to storefront fulfilment", () => {
  it("fulfils an ordinary online order as before", async () => {
    const { db } = makeFakeDb(undefined);
    getDb.mockResolvedValue(db);
    getOrderBySessionId.mockResolvedValue({
      id: 1,
      tenantId: 3,
      stripeSessionId: "cs_shop_1",
      status: "pending",
      productIds: "9",
      amountTotal: 18500,
      currency: "chf",
      customerEmail: null,
      customerName: null,
      paymentMethod: null,
      locale: "de",
      createdAt: new Date(),
    });

    const res = await post(
      "/api/stripe/webhook",
      "checkout.session.completed",
      storefrontSession(),
    );

    expect(res.status).toBe(200);
    expect(updateOrderBySessionId).toHaveBeenCalledWith(
      "cs_shop_1",
      expect.objectContaining({ status: "paid" }),
    );
    expect(markProductsSold).toHaveBeenCalledWith(3, [9]);
  });

  it("does not let POS claim a session no pos_order owns", async () => {
    // No till metadata and no pos_order row: nothing about this is POS, so the
    // storefront's own no-order-and-no-metadata path must run.
    const { db } = makeFakeDb(undefined);
    getDb.mockResolvedValue(db);

    const res = await post(
      "/api/stripe/webhook",
      "checkout.session.completed",
      storefrontSession({ metadata: null }),
    );

    expect(res.status).toBe(200);
    expect(createOrder).not.toHaveBeenCalled();
    expect(markProductsSold).not.toHaveBeenCalled();
  });
});
