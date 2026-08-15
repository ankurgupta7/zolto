import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Stripe from "stripe";

const getOrderBySessionId = vi.fn();
const markProductsSold = vi.fn();
const releaseProductReservations = vi.fn();
const updateOrderBySessionId = vi.fn();
const createOrder = vi.fn();
const getProductsByIds = vi.fn();
const getTenantAdminContact = vi.fn();
const getTenantById = vi.fn();
const getTenantSettings = vi.fn();
const notifyOwner = vi.fn();
const sendOrderReceipt = vi.fn();
const sendOwnerOrderEmail = vi.fn();

vi.mock("./db", () => ({
  getOrderBySessionId: (...args: unknown[]) => getOrderBySessionId(...args),
  markProductsSold: (...args: unknown[]) => markProductsSold(...args),
  releaseProductReservations: (...args: unknown[]) =>
    releaseProductReservations(...args),
  updateOrderBySessionId: (...args: unknown[]) =>
    updateOrderBySessionId(...args),
  createOrder: (...args: unknown[]) => createOrder(...args),
  getProductsByIds: (...args: unknown[]) => getProductsByIds(...args),
  getTenantAdminContact: (...args: unknown[]) => getTenantAdminContact(...args),
  getTenantById: (...args: unknown[]) => getTenantById(...args),
  getTenantSettings: (...args: unknown[]) => getTenantSettings(...args),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: (...args: unknown[]) => notifyOwner(...args),
}));

// Discount bookkeeping is unit-tested in discounts.test.ts. Mocked here so
// fulfillment's call into it can be asserted, and so the great majority of
// orders — which carry no code — are seen to pass through it harmlessly.
const confirmDiscountForSession = vi.fn(async () => {});
vi.mock("./discounts", () => ({
  confirmDiscountForSession: (...args: unknown[]) =>
    confirmDiscountForSession(...args),
}));

vi.mock("./_core/email", () => ({
  sendOrderReceipt: (...args: unknown[]) => sendOrderReceipt(...args),
  sendOwnerOrderEmail: (...args: unknown[]) => sendOwnerOrderEmail(...args),
}));

// Billing delegation is unit-tested in billing.test.ts; here every event is a
// storefront event, so billing never claims anything.
const handleBillingEvent = vi.fn(async () => false);
vi.mock("./billing", () => ({
  handleBillingEvent: (...args: unknown[]) => handleBillingEvent(...args),
}));

import {
  fulfillOrder,
  getStripe,
  isStripeConfigured,
  registerStripeWebhook,
} from "./stripe";

function makeSession(
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    payment_intent: "pi_test_123",
    payment_method_types: ["card"],
    customer_details: {
      email: "buyer@example.com",
      name: "Jane Buyer",
    } as Stripe.Checkout.Session.CustomerDetails,
    ...overrides,
  } as Stripe.Checkout.Session;
}

const baseOrder = {
  id: 1,
  tenantId: 3,
  stripeSessionId: "cs_test_123",
  stripePaymentIntentId: null,
  status: "pending" as const,
  customerEmail: null,
  customerName: null,
  amountTotal: 18500,
  currency: "chf",
  productIds: "1,2",
  paymentMethod: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("fulfillOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    notifyOwner.mockResolvedValue(true);
    updateOrderBySessionId.mockResolvedValue(undefined);
    markProductsSold.mockResolvedValue(undefined);
    getProductsByIds.mockResolvedValue([]);
    sendOrderReceipt.mockResolvedValue(undefined);
    // No admin on file by default — tests that exercise the owner-email path
    // set this explicitly.
    getTenantAdminContact.mockResolvedValue(undefined);
    getTenantById.mockResolvedValue(undefined);
    sendOwnerOrderEmail.mockResolvedValue(undefined);
  });

  it("does nothing when no order is found and the session has no productIds metadata", async () => {
    getOrderBySessionId.mockResolvedValue(undefined);
    await fulfillOrder(makeSession());
    expect(updateOrderBySessionId).not.toHaveBeenCalled();
    expect(markProductsSold).not.toHaveBeenCalled();
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("reconstructs a missing order from session metadata and fulfills it", async () => {
    getOrderBySessionId
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...baseOrder, status: "pending" });
    createOrder.mockResolvedValue(undefined);

    await fulfillOrder(
      makeSession({ metadata: { productIds: "1,2" } as Stripe.Metadata }),
    );

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSessionId: "cs_test_123",
        status: "pending",
        productIds: "1,2",
      }),
    );
    expect(markProductsSold).toHaveBeenCalledWith(3, [1, 2]);
  });

  it("gives up when order reconstruction fails to produce an order", async () => {
    getOrderBySessionId.mockResolvedValue(undefined);
    createOrder.mockRejectedValue(new Error("db down"));

    await fulfillOrder(
      makeSession({ metadata: { productIds: "1,2" } as Stripe.Metadata }),
    );

    expect(updateOrderBySessionId).not.toHaveBeenCalled();
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("is idempotent: skips already-paid orders", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder, status: "paid" });
    await fulfillOrder(makeSession());
    expect(updateOrderBySessionId).not.toHaveBeenCalled();
    expect(markProductsSold).not.toHaveBeenCalled();
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("marks the order paid, decrements product stock, and notifies the owner", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    await fulfillOrder(makeSession());

    expect(updateOrderBySessionId).toHaveBeenCalledWith("cs_test_123", {
      status: "paid",
      stripePaymentIntentId: "pi_test_123",
      customerEmail: "buyer@example.com",
      customerName: "Jane Buyer",
      paymentMethod: "card",
    });
    expect(markProductsSold).toHaveBeenCalledWith(3, [1, 2]);
    expect(notifyOwner).toHaveBeenCalledTimes(1);
    expect(notifyOwner.mock.calls[0][0].content).toContain("CHF 185.00");
  });

  it("confirms the discount hold this session was holding", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    await fulfillOrder(makeSession());
    expect(confirmDiscountForSession).toHaveBeenCalledWith("cs_test_123", {
      orderId: 1,
      customerEmail: "buyer@example.com",
    });
  });

  // Already-paid orders return before any of this: a webhook Stripe retried
  // must not confirm a redemption a second time.
  it("does not re-confirm a discount on an order that was already fulfilled", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder, status: "paid" });
    await fulfillOrder(makeSession());
    expect(confirmDiscountForSession).not.toHaveBeenCalled();
  });

  it("emails the tenant's own admin (not just the platform Discord DM) when one is on file", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    getTenantAdminContact.mockResolvedValue({
      name: "Sheena Arora",
      email: "sheena@example.com",
    });
    getTenantById.mockResolvedValue({ id: 3, name: "Kalakosh" });
    getProductsByIds.mockResolvedValue([
      { id: 1, name: "Ring", nameEn: null, price: "100.00" },
      { id: 2, name: "Earrings", nameEn: null, price: "85.00" },
    ]);

    await fulfillOrder(makeSession());

    expect(sendOwnerOrderEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "sheena@example.com",
        ownerName: "Sheena Arora",
        orderRef: baseOrder.id,
        amountTotal: baseOrder.amountTotal,
        items: [
          { name: "Ring", nameEn: null, price: "100.00" },
          { name: "Earrings", nameEn: null, price: "85.00" },
        ],
      }),
    );
  });

  it("falls back to the store name when the admin has no name yet (pending claim)", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    getTenantAdminContact.mockResolvedValue({
      name: null,
      email: "sheena@example.com",
    });
    getTenantById.mockResolvedValue({ id: 3, name: "Kalakosh" });

    await fulfillOrder(makeSession());

    expect(sendOwnerOrderEmail).toHaveBeenCalledWith(
      expect.objectContaining({ ownerName: "Kalakosh" }),
    );
  });

  it("does not attempt an owner email when the tenant has no admin on file", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    getTenantAdminContact.mockResolvedValue(undefined);

    await fulfillOrder(makeSession());

    expect(sendOwnerOrderEmail).not.toHaveBeenCalled();
  });

  it("does not throw when the owner email fails to send", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    getTenantAdminContact.mockResolvedValue({
      name: "Sheena Arora",
      email: "sheena@example.com",
    });
    sendOwnerOrderEmail.mockRejectedValue(new Error("resend down"));

    await expect(fulfillOrder(makeSession())).resolves.toBeUndefined();
  });

  it("emails a receipt to the customer when an email address is available", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    getProductsByIds.mockResolvedValue([
      { id: 1, name: "Ring", nameEn: null, price: "100.00", imageUrl: null },
      { id: 2, name: "Earrings", nameEn: null, price: "85.00", imageUrl: null },
    ]);

    await fulfillOrder(makeSession());

    expect(getProductsByIds).toHaveBeenCalledWith(3, [1, 2]);
    expect(sendOrderReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "buyer@example.com",
        orderRef: baseOrder.id,
        amountTotal: baseOrder.amountTotal,
      }),
    );
  });

  it("does not throw when the receipt email fails", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    sendOrderReceipt.mockRejectedValue(new Error("smtp down"));
    await expect(fulfillOrder(makeSession())).resolves.toBeUndefined();
  });

  it("falls back to the order's stored customer details when Stripe omits them", async () => {
    getOrderBySessionId.mockResolvedValue({
      ...baseOrder,
      customerEmail: "stored@example.com",
      customerName: "Stored Name",
    });
    await fulfillOrder(
      makeSession({ customer_details: null, payment_method_types: undefined }),
    );

    expect(updateOrderBySessionId).toHaveBeenCalledWith(
      "cs_test_123",
      expect.objectContaining({
        customerEmail: "stored@example.com",
        customerName: "Stored Name",
        paymentMethod: null,
      }),
    );
  });

  it("does not throw when the owner notification fails", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    notifyOwner.mockRejectedValue(new Error("notification down"));
    await expect(fulfillOrder(makeSession())).resolves.toBeUndefined();
  });
});

describe("getStripe / isStripeConfigured", () => {
  const originalKey = process.env.STRIPE_SECRET_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalKey;
  });

  it("reports not configured when STRIPE_SECRET_KEY is unset", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(isStripeConfigured()).toBe(false);
  });

  it("reports configured when STRIPE_SECRET_KEY is set", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    expect(isStripeConfigured()).toBe(true);
  });

  it("returns null from getStripe when not configured", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(getStripe()).toBeNull();
  });
});

describe("registerStripeWebhook", () => {
  const webhookSecret = "whsec_test_secret";
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  function buildApp() {
    const app = express();
    registerStripeWebhook(app);
    return app;
  }

  function signedPayload(stripe: Stripe, payload: object) {
    const body = JSON.stringify(payload);
    const header = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: webhookSecret,
    });
    return { body, header };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    notifyOwner.mockResolvedValue(true);
    updateOrderBySessionId.mockResolvedValue(undefined);
    markProductsSold.mockResolvedValue(undefined);
    releaseProductReservations.mockResolvedValue(undefined);
    getProductsByIds.mockResolvedValue([]);
    sendOrderReceipt.mockResolvedValue(undefined);
    getTenantAdminContact.mockResolvedValue(undefined);
    getTenantById.mockResolvedValue(undefined);
    sendOwnerOrderEmail.mockResolvedValue(undefined);
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  });

  afterEach(() => {
    if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalSecretKey;
    if (originalWebhookSecret === undefined)
      delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
  });

  it("rejects requests with an invalid signature", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", "t=1,v1=invalid")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt_1" }));

    expect(res.status).toBe(400);
    expect(getOrderBySessionId).not.toHaveBeenCalled();
  });

  it("short-circuits events claimed by platform billing", async () => {
    handleBillingEvent.mockResolvedValueOnce(true);
    const stripe = new Stripe("sk_test_123");
    const app = buildApp();
    const { body, header } = signedPayload(stripe, {
      id: "evt_billing",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1" } },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(handleBillingEvent).toHaveBeenCalledTimes(1);
    // Billing claimed it — storefront order handling must not run.
    expect(getOrderBySessionId).not.toHaveBeenCalled();
  });

  it("returns 400 when Stripe is not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const app = buildApp();
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt_1" }));

    expect(res.status).toBe(400);
  });

  it("fulfills the order on checkout.session.completed", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    const stripe = new Stripe("sk_test_123");
    const app = buildApp();
    const { body, header } = signedPayload(stripe, {
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: makeSession() },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(markProductsSold).toHaveBeenCalledWith(3, [1, 2]);
  });

  it("marks the order expired and releases its product hold on checkout.session.expired", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    const stripe = new Stripe("sk_test_123");
    const app = buildApp();
    const { body, header } = signedPayload(stripe, {
      id: "evt_2",
      type: "checkout.session.expired",
      data: { object: { id: "cs_test_123" } },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(updateOrderBySessionId).toHaveBeenCalledWith("cs_test_123", {
      status: "expired",
    });
    // POS <-> online inventory sync: an expired session must give back the
    // hold it placed so the pieces are immediately sellable again.
    expect(releaseProductReservations).toHaveBeenCalledWith(3, [1, 2]);
  });

  it("marks the order failed and releases its product hold on checkout.session.async_payment_failed", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    const stripe = new Stripe("sk_test_123");
    const app = buildApp();
    const { body, header } = signedPayload(stripe, {
      id: "evt_3",
      type: "checkout.session.async_payment_failed",
      data: { object: { id: "cs_test_123" } },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(updateOrderBySessionId).toHaveBeenCalledWith("cs_test_123", {
      status: "failed",
    });
    expect(releaseProductReservations).toHaveBeenCalledWith(3, [1, 2]);
  });

  it("does not attempt to release a hold when no matching order exists", async () => {
    getOrderBySessionId.mockResolvedValue(undefined);
    const stripe = new Stripe("sk_test_123");
    const app = buildApp();
    const { body, header } = signedPayload(stripe, {
      id: "evt_5",
      type: "checkout.session.expired",
      data: { object: { id: "cs_unknown" } },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(releaseProductReservations).not.toHaveBeenCalled();
  });

  it("acknowledges unhandled event types without side effects", async () => {
    const stripe = new Stripe("sk_test_123");
    const app = buildApp();
    const { body, header } = signedPayload(stripe, {
      id: "evt_4",
      type: "customer.created",
      data: { object: {} },
    });

    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(updateOrderBySessionId).not.toHaveBeenCalled();
    expect(markProductsSold).not.toHaveBeenCalled();
  });
});

describe("registerStripeWebhook — Connect endpoint", () => {
  // Events on a TENANT's connected account (a customer paying for jewelry)
  // arrive at a separate URL, signed with a separate secret, from events on
  // Zolto's own platform account (tested above). Both share the same
  // handling logic since the order row already carries its own tenantId.
  const connectWebhookSecret = "whsec_test_connect_secret";
  const originalSecretKey = process.env.STRIPE_SECRET_KEY;
  const originalConnectWebhookSecret =
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  function buildApp() {
    const app = express();
    registerStripeWebhook(app);
    return app;
  }

  function signedPayload(stripe: Stripe, payload: object) {
    const body = JSON.stringify(payload);
    const header = stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: connectWebhookSecret,
    });
    return { body, header };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    notifyOwner.mockResolvedValue(true);
    updateOrderBySessionId.mockResolvedValue(undefined);
    markProductsSold.mockResolvedValue(undefined);
    releaseProductReservations.mockResolvedValue(undefined);
    getProductsByIds.mockResolvedValue([]);
    sendOrderReceipt.mockResolvedValue(undefined);
    getTenantAdminContact.mockResolvedValue(undefined);
    getTenantById.mockResolvedValue(undefined);
    sendOwnerOrderEmail.mockResolvedValue(undefined);
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = connectWebhookSecret;
  });

  afterEach(() => {
    if (originalSecretKey === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = originalSecretKey;
    if (originalConnectWebhookSecret === undefined)
      delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    else
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET = originalConnectWebhookSecret;
  });

  it("rejects requests with an invalid signature", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/stripe/connect-webhook")
      .set("stripe-signature", "t=1,v1=invalid")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt_1" }));

    expect(res.status).toBe(400);
    expect(getOrderBySessionId).not.toHaveBeenCalled();
  });

  it("returns 400 when Connect isn't configured", async () => {
    delete process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
    const app = buildApp();
    const res = await request(app)
      .post("/api/stripe/connect-webhook")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ id: "evt_1" }));

    expect(res.status).toBe(400);
  });

  it("fulfills the order on a connected account's checkout.session.completed", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    const stripe = new Stripe("sk_test_123");
    const app = buildApp();
    const { body, header } = signedPayload(stripe, {
      id: "evt_1",
      type: "checkout.session.completed",
      account: "acct_connected_test",
      data: { object: makeSession() },
    });

    const res = await request(app)
      .post("/api/stripe/connect-webhook")
      .set("stripe-signature", header)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(markProductsSold).toHaveBeenCalledWith(3, [1, 2]);
  });

  it("does not accept a payload signed with the platform webhook secret", async () => {
    const platformSignedStripe = new Stripe("sk_test_123");
    const app = buildApp();
    const body = JSON.stringify({
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: makeSession() },
    });
    const wrongHeader = platformSignedStripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: "whsec_test_secret",
    });

    const res = await request(app)
      .post("/api/stripe/connect-webhook")
      .set("stripe-signature", wrongHeader)
      .set("Content-Type", "application/json")
      .send(body);

    expect(res.status).toBe(400);
    expect(getOrderBySessionId).not.toHaveBeenCalled();
  });
});
