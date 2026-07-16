import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import Stripe from "stripe";

const getOrderBySessionId = vi.fn();
const markProductsSold = vi.fn();
const updateOrderBySessionId = vi.fn();
const createOrder = vi.fn();
const getProductsByIds = vi.fn();
const notifyOwner = vi.fn();
const sendOrderReceipt = vi.fn();

vi.mock("./db", () => ({
  getOrderBySessionId: (...args: unknown[]) => getOrderBySessionId(...args),
  markProductsSold: (...args: unknown[]) => markProductsSold(...args),
  updateOrderBySessionId: (...args: unknown[]) =>
    updateOrderBySessionId(...args),
  createOrder: (...args: unknown[]) => createOrder(...args),
  getProductsByIds: (...args: unknown[]) => getProductsByIds(...args),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: (...args: unknown[]) => notifyOwner(...args),
}));

vi.mock("./_core/email", () => ({
  sendOrderReceipt: (...args: unknown[]) => sendOrderReceipt(...args),
}));

import {
  fulfillOrder,
  getStripe,
  isStripeConfigured,
  registerStripeWebhook,
} from "./stripe";

function makeSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
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
      makeSession({ metadata: { productIds: "1,2" } as Stripe.Metadata })
    );

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSessionId: "cs_test_123",
        status: "pending",
        productIds: "1,2",
      })
    );
    expect(markProductsSold).toHaveBeenCalledWith([1, 2]);
  });

  it("gives up when order reconstruction fails to produce an order", async () => {
    getOrderBySessionId.mockResolvedValue(undefined);
    createOrder.mockRejectedValue(new Error("db down"));

    await fulfillOrder(
      makeSession({ metadata: { productIds: "1,2" } as Stripe.Metadata })
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
    expect(markProductsSold).toHaveBeenCalledWith([1, 2]);
    expect(notifyOwner).toHaveBeenCalledTimes(1);
    expect(notifyOwner.mock.calls[0][0].content).toContain("CHF 185.00");
  });

  it("emails a receipt to the customer when an email address is available", async () => {
    getOrderBySessionId.mockResolvedValue({ ...baseOrder });
    getProductsByIds.mockResolvedValue([
      { id: 1, name: "Ring", nameEn: null, price: "100.00", imageUrl: null },
      { id: 2, name: "Earrings", nameEn: null, price: "85.00", imageUrl: null },
    ]);

    await fulfillOrder(makeSession());

    expect(getProductsByIds).toHaveBeenCalledWith([1, 2]);
    expect(sendOrderReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "buyer@example.com",
        orderRef: baseOrder.id,
        amountTotal: baseOrder.amountTotal,
      })
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
      makeSession({ customer_details: null, payment_method_types: undefined })
    );

    expect(updateOrderBySessionId).toHaveBeenCalledWith(
      "cs_test_123",
      expect.objectContaining({
        customerEmail: "stored@example.com",
        customerName: "Stored Name",
        paymentMethod: null,
      })
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
    getProductsByIds.mockResolvedValue([]);
    sendOrderReceipt.mockResolvedValue(undefined);
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
    expect(markProductsSold).toHaveBeenCalledWith([1, 2]);
  });

  it("marks the order expired on checkout.session.expired", async () => {
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
  });

  it("marks the order failed on checkout.session.async_payment_failed", async () => {
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
