import { describe, expect, it, beforeAll } from "vitest";
import Stripe from "stripe";

/**
 * Stripe Integration Tests
 *
 * These tests hit the REAL Stripe API (test mode) to verify:
 * 1. Checkout session creation works with payment_intent_data.statement_descriptor
 * 2. TWINT PaymentIntent creation works end-to-end
 * 3. Webhook signature verification works with real Stripe events
 *
 * These tests are skipped if STRIPE_TEST_SECRET_KEY is not set.
 * They are NOT run in CI — they require network access to Stripe.
 *
 * Run locally:
 *   STRIPE_TEST_SECRET_KEY=sk_test_... \
 *   STRIPE_TEST_WEBHOOK_SECRET=whsec_... \
 *   pnpm test:integration
 */

const secretKey = process.env.STRIPE_TEST_SECRET_KEY;
const webhookSecret = process.env.STRIPE_TEST_WEBHOOK_SECRET;

// Only run these tests when a real Stripe test key is available
const describeIf = secretKey ? describe : describe.skip;

function getStripe(): Stripe {
  if (!secretKey) throw new Error("STRIPE_TEST_SECRET_KEY not set");
  return new Stripe(secretKey, { apiVersion: "2025-06-30.basil" });
}

describeIf("Stripe Integration — Checkout Session", () => {
  let stripe: Stripe;
  beforeAll(() => {
    stripe = getStripe();
  });

  // ─── REGRESSION: statement_descriptor nesting ────────────────────────────
  it("accepts statement_descriptor inside payment_intent_data (the bug that broke production)", async () => {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "twint"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: 6500,
            product_data: { name: "Integration Test Product" },
          },
        },
      ],
      customer_creation: "always",
      billing_address_collection: "required",
      shipping_address_collection: { allowed_countries: ["CH"] },
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 0, currency: "chf" },
            display_name: "Free shipping (Switzerland)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 3 },
            },
          },
        },
      ],
      phone_number_collection: { enabled: true },
      locale: "auto",
      // This is the critical fix — must be inside payment_intent_data,
      // NOT at the top level. Top-level statement_descriptor is rejected
      // by newer Stripe API versions with:
      //   "Received unknown parameter: statement_descriptor"
      payment_intent_data: {
        statement_descriptor: "KALAKOSH",
      },
      success_url:
        "https://kalakosh.ch/checkout/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://kalakosh.ch/checkout/cancel",
      metadata: { productIds: "1" },
    });

    // Session created successfully — the API call didn't throw
    expect(session.id).toMatch(/^cs_test_/);
    expect(session.status).toBe("open");
    expect(session.amount_total).toBe(6500);
    expect(session.currency).toBe("chf");
    expect(session.payment_method_types).toContain("twint");

    // Cleanup
    await stripe.checkout.sessions.expire(session.id);
  });

  it("rejects statement_descriptor at the top level (the old broken code)", async () => {
    // This test documents the exact error that caused the production outage.
    // If Stripe ever changes their API to accept top-level statement_descriptor,
    // this test will fail — which is a signal to revisit the code.
    await expect(
      stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "chf",
              unit_amount: 1000,
              product_data: { name: "Top-level descriptor test" },
            },
          },
        ],
        // BUG: top-level statement_descriptor is rejected
        statement_descriptor: "KALAKOSH" as unknown as undefined,
        success_url: "https://kalakosh.ch/success",
        cancel_url: "https://kalakosh.ch/cancel",
      }),
    ).rejects.toThrow(/Received unknown parameter: statement_descriptor/);
  });

  // ─── Shipping fee logic ──────────────────────────────────────────────────
  it("creates free shipping for orders >= CHF 50", async () => {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: 5000, // CHF 50.00
            product_data: { name: "Free shipping threshold test" },
          },
        },
      ],
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 0, currency: "chf" },
            display_name: "Free shipping (Switzerland)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 3 },
            },
          },
        },
      ],
      success_url: "https://kalakosh.ch/success",
      cancel_url: "https://kalakosh.ch/cancel",
    });

    expect(session.amount_total).toBe(5000); // no shipping added
    await stripe.checkout.sessions.expire(session.id);
  });

  it("creates CHF 2 shipping for orders < CHF 50", async () => {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: 3500, // CHF 35.00
            product_data: { name: "Paid shipping test" },
          },
        },
      ],
      shipping_options: [
        {
          shipping_rate_data: {
            type: "fixed_amount",
            fixed_amount: { amount: 200, currency: "chf" }, // CHF 2.00
            display_name: "Standard shipping (Switzerland)",
            delivery_estimate: {
              minimum: { unit: "business_day", value: 2 },
              maximum: { unit: "business_day", value: 3 },
            },
          },
        },
      ],
      success_url: "https://kalakosh.ch/success",
      cancel_url: "https://kalakosh.ch/cancel",
    });

    expect(session.amount_total).toBe(3700); // 3500 + 200 shipping
    await stripe.checkout.sessions.expire(session.id);
  });
});

describeIf("Stripe Integration — TWINT PaymentIntent", () => {
  let stripe: Stripe;
  beforeAll(() => {
    stripe = getStripe();
  });

  it("creates a TWINT PaymentIntent with statement_descriptor", async () => {
    const customer = await stripe.customers.create({
      name: "Test Customer",
      email: "test@kalakosh.ch",
    });

    const intent = await stripe.paymentIntents.create({
      amount: 5000,
      currency: "chf",
      customer: customer.id,
      payment_method_types: ["twint"],
      payment_method_data: { type: "twint" },
      confirm: true,
      return_url: "https://kalakosh.ch/pos/twint-return",
      statement_descriptor: "KALAKOSH",
      metadata: { productIds: "1", hasCustomItems: "false" },
    });

    expect(intent.id).toMatch(/^pi_/);
    expect(intent.status).toBe("requires_action");
    // Current Stripe API returns redirect_to_url for TWINT confirmation
    // (older versions returned use_stripe_sdk). What matters for the POS flow
    // is that an action is required and Stripe hands us a URL to send the
    // customer to.
    expect(intent.next_action?.type).toBe("redirect_to_url");
    const redirectUrl = (
      intent.next_action as { redirect_to_url?: { url?: string } } | null
    )?.redirect_to_url?.url;
    expect(redirectUrl).toMatch(/^https:\/\/.*stripe/);
    expect(intent.statement_descriptor).toBe("KALAKOSH");

    // Cleanup
    await stripe.paymentIntents.cancel(intent.id);
    await stripe.customers.del(customer.id);
  });
});

describeIf("Stripe Integration — Webhook Verification", () => {
  let stripe: Stripe;
  beforeAll(() => {
    stripe = getStripe();
  });

  // Skip webhook tests if no webhook secret is configured
  const describeWebhook = webhookSecret ? describe : describe.skip;

  describeWebhook("webhook signature verification", () => {
    it("verifies a valid webhook signature", () => {
      const payload = JSON.stringify({
        id: "evt_test_123",
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_123",
            payment_status: "paid",
          },
        },
      });

      const header = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: webhookSecret!,
      });

      // This should not throw
      const event = stripe.webhooks.constructEvent(
        payload,
        header,
        webhookSecret!,
      );
      expect(event.id).toBe("evt_test_123");
      expect(event.type).toBe("checkout.session.completed");
    });

    it("rejects an invalid webhook signature", () => {
      const payload = JSON.stringify({ id: "evt_test" });

      expect(() => {
        stripe.webhooks.constructEvent(
          payload,
          "t=1,v1=invalid_signature",
          webhookSecret!,
        );
      }).toThrow();
    });
  });
});
