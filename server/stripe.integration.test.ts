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

// ─── Stripe Connect: direct charge + platform fee ────────────────────────────
//
// This is the revenue mechanism of the whole pricing model
// (docs/planning/pricing-pivot-agent-commerce.md): a Free-plan tenant's
// customer pays into the TENANT's own connected account (a direct charge),
// and Zolto's 1% rides along as application_fee_amount.
//
// It matters that this is tested against the real API rather than a mock,
// because the failure mode is not "the fee is skipped" — Stripe rejects the
// whole `checkout.sessions.create` call, so EVERY online sale for that vendor
// fails. server/checkoutSession.ts carries a fallback for exactly that case;
// these tests are how we find out whether the fallback is ever needed.

/**
 * Find a connected account to run the direct-charge tests against.
 *
 * Deliberately does NOT create one. Zolto never creates connected accounts in
 * production — tenants link their OWN existing Stripe account over Connect
 * OAuth (server/stripeConnect.ts `stripe.oauth.token`), and we only ever
 * receive an account id. Creating one here also broke: Stripe now rejects
 * Accounts v1 for new integrations, which killed this whole suite and skipped
 * the fee tests silently. Borrowing an existing account is both closer to
 * production and immune to that.
 */
async function resolveConnectedAccount(stripe: Stripe): Promise<string> {
  const fromEnv = process.env.STRIPE_TEST_CONNECTED_ACCOUNT_ID;
  if (fromEnv) return fromEnv;

  let candidates: Stripe.Account[] = [];
  try {
    candidates = (await stripe.accounts.list({ limit: 100 })).data;
  } catch {
    // Listing may be restricted; fall through to the guidance below.
  }

  // Checkout needs an account that can actually take a charge AND has a
  // display name — Stripe refuses to render a checkout page for a nameless
  // account ("you must set an account or business name"). Picking the first
  // account off the list is how we previously landed on an unusable one.
  const named = (a: Stripe.Account) =>
    Boolean(a.business_profile?.name || a.settings?.dashboard?.display_name);
  const usable =
    candidates.find((a) => a.charges_enabled && named(a)) ??
    candidates.find((a) => a.charges_enabled) ??
    candidates[0];

  if (usable && !named(usable)) {
    // Best effort: give it a name so the suite can proceed. Platforms can't
    // always write a Standard account's profile, so this is allowed to fail —
    // the error below then tells the operator exactly which account to fix.
    await stripe.accounts
      .update(usable.id, {
        business_profile: { name: "Zolto Integration Test Store" },
      })
      .catch(() => {});
  }

  if (usable) return usable.id;

  // Fail loudly rather than skipping. A silent skip is exactly how the fee
  // path stayed unverified in the first place.
  throw new Error(
    "No connected account available, so the platform fee was NOT verified. " +
      "This is a test-environment gap, not a Stripe rejection of the fee. Fix by either: " +
      "(a) set STRIPE_TEST_CONNECTED_ACCOUNT_ID to an existing test-mode connected account (acct_...); " +
      "(b) link one through Zolto's own Connect OAuth flow, which is what production does; or " +
      "(c) create one via Accounts v2 (POST /v2/core/accounts) or by enabling Accounts v1 " +
      "support at https://dashboard.stripe.com/settings/features/feat_accounts_v1_support.",
  );
}

describeIf(
  "Stripe Integration — Connect direct charge with platform fee",
  () => {
    let stripe: Stripe;
    let connectedAccountId: string;

    beforeAll(async () => {
      stripe = getStripe();

      // Reachability first, so a blocked network can't masquerade as "Stripe
      // rejected our platform fee". Those two need telling apart instantly:
      // one is an infrastructure problem, the other means every online sale
      // on the Free plan is broken. The Stripe SDK surfaces a proxy's HTML
      // error page as "Invalid JSON received from the Stripe API", which
      // reads like the latter and is actually the former.
      try {
        await stripe.balance.retrieve();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(
          "Cannot reach the Stripe API, so the platform-fee path was NOT " +
            "verified. This is a connectivity/egress problem, not a Stripe " +
            "rejection — do not read it as the fee being broken. " +
            `Underlying error: ${msg}`,
        );
      }

      connectedAccountId = await resolveConnectedAccount(stripe);
      // Printed because a Checkout config failure ("you must set an account or
      // business name") is a property of a SPECIFIC account — without knowing
      // which one was used, the operator can't tell whether to fix the
      // platform account or this connected one.
      console.info(
        `[integration] platform-fee tests running on connected account ${connectedAccountId}`,
      );
    }, 30_000);

    // Nothing to tear down: we borrow an existing connected account rather
    // than creating one, so there is no account of ours to delete.

    it("accepts application_fee_amount on a direct charge (the Free-plan skim)", async () => {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "chf",
                unit_amount: 6500, // CHF 65.00
                product_data: { name: "Perlenkette" },
              },
            },
          ],
          payment_intent_data: {
            statement_descriptor: "ZOLTO TEST",
            // 1% of the CHF 65 subtotal — what a Free-plan tenant is charged.
            application_fee_amount: 65,
          },
          success_url: "https://example.com/checkout/success",
          cancel_url: "https://example.com/checkout/cancel",
          metadata: { productIds: "1", channel: "web" },
        },
        { stripeAccount: connectedAccountId },
      );

      expect(session.id).toMatch(/^cs_test_/);
      expect(session.status).toBe("open");
      expect(session.amount_total).toBe(6500);

      await stripe.checkout.sessions
        .expire(session.id, { stripeAccount: connectedAccountId } as never)
        .catch(() => {});
    }, 30_000);

    it("accepts an agent-originated session identically to a web one", async () => {
      // The agent path must not be a special case at the Stripe layer — same
      // call, same fee, only the metadata channel differs.
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "chf",
                unit_amount: 6500,
                product_data: { name: "Perlenkette" },
              },
            },
          ],
          payment_intent_data: { application_fee_amount: 65 },
          success_url: "https://example.com/checkout/success",
          cancel_url: "https://example.com/checkout/cancel",
          metadata: { productIds: "1", channel: "agent" },
        },
        { stripeAccount: connectedAccountId },
      );

      expect(session.id).toMatch(/^cs_test_/);
      expect(session.metadata?.channel).toBe("agent");

      await stripe.checkout.sessions
        .expire(session.id, { stripeAccount: connectedAccountId } as never)
        .catch(() => {});
    }, 30_000);

    it("omits the fee entirely for Pro tenants without breaking the charge", async () => {
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: ["card"],
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: "chf",
                unit_amount: 6500,
                product_data: { name: "Perlenkette" },
              },
            },
          ],
          // Pro: no application_fee_amount key at all.
          payment_intent_data: { statement_descriptor: "ZOLTO TEST" },
          success_url: "https://example.com/checkout/success",
          cancel_url: "https://example.com/checkout/cancel",
          metadata: { productIds: "1", channel: "web" },
        },
        { stripeAccount: connectedAccountId },
      );

      expect(session.id).toMatch(/^cs_test_/);

      await stripe.checkout.sessions
        .expire(session.id, { stripeAccount: connectedAccountId } as never)
        .catch(() => {});
    }, 30_000);

    it("rejects a fee larger than the charge — the bound our maths must respect", async () => {
      // Documents WHY platformFeeRappen is computed on the subtotal and capped
      // by construction: an over-large fee is a hard API error, i.e. a failed
      // sale. If Stripe ever stops rejecting this, revisit the fallback.
      await expect(
        stripe.checkout.sessions.create(
          {
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: "chf",
                  unit_amount: 1000,
                  product_data: { name: "Cheap thing" },
                },
              },
            ],
            payment_intent_data: { application_fee_amount: 5000 },
            success_url: "https://example.com/success",
            cancel_url: "https://example.com/cancel",
          },
          { stripeAccount: connectedAccountId },
        ),
      ).rejects.toThrow(/application[_ ]fee|fee.*(greater|exceed)|amount/i);
    }, 30_000);
  },
);
