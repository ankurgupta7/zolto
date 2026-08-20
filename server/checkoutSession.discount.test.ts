/**
 * Discount codes at checkout — the integration between the pure rules, the
 * redemption bookkeeping and the Stripe session.
 *
 * The service itself is covered in server/discounts.test.ts. What is tested
 * here is the wiring around it, and specifically the three things that would
 * cost real money if they were wrong:
 *
 *   - the discount reaches Stripe as an amount-off coupon on the TENANT's
 *     connected account, so the customer is charged the figure the basket showed
 *   - the platform fee follows the discounted subtotal, so a merchant running a
 *     promotion is not billed on revenue nobody paid
 *   - every failure after the claim gives the redemption slot back, so a Stripe
 *     outage doesn't silently spend a customer's single-use code
 */

import { BRAND } from "@shared/brand";
import { describe, expect, it, vi, beforeEach } from "vitest";

const getProductsByIds = vi.fn();
const getTenantSettings = vi.fn();
const reserveProducts = vi.fn();
const releaseProductReservations = vi.fn();
const createOrder = vi.fn();

vi.mock("./db", () => ({
  getProductsByIds: (...a: unknown[]) => getProductsByIds(...a),
  getTenantSettings: (...a: unknown[]) => getTenantSettings(...a),
  reserveProducts: (...a: unknown[]) => reserveProducts(...a),
  releaseProductReservations: (...a: unknown[]) =>
    releaseProductReservations(...a),
  createOrder: (...a: unknown[]) => createOrder(...a),
  PRODUCT_RESERVATION_TTL_MS: 30 * 60 * 1000,
}));

const claimDiscount = vi.fn();
const recordDiscountHold = vi.fn();
const releaseDiscountClaim = vi.fn();
vi.mock("./discounts", () => ({
  claimDiscount: (...a: unknown[]) => claimDiscount(...a),
  recordDiscountHold: (...a: unknown[]) => recordDiscountHold(...a),
  releaseDiscountClaim: (...a: unknown[]) => releaseDiscountClaim(...a),
}));

const sessionsCreate = vi.fn();
const couponsCreate = vi.fn();
const getStripe = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: (...a: unknown[]) => getStripe(...a),
}));

import {
  CheckoutError,
  createStorefrontCheckoutSession,
} from "./checkoutSession";
import type { Tenant } from "../drizzle/schema";

const CONNECTED = "acct_connected";

const tenant = {
  id: 7,
  name: "Aurora",
  plan: "free", // 1% platform fee — the interesting case
  stripeConnectedAccountId: CONNECTED,
} as Tenant;

/** CHF 185.00 — one piece, so the subtotal is easy to read in assertions. */
const product = {
  id: 1,
  name: "Pearl Ring",
  description: "A ring",
  price: "185.00",
  imageUrl: null,
  visible: true,
  sold: false,
  quantity: 1,
} as never;

const CLAIM = {
  ok: true as const,
  discount: { codeId: 5, code: "WELCOME10", amountOffRappen: 1850 },
};

beforeEach(() => {
  vi.clearAllMocks();
  getStripe.mockReturnValue({
    checkout: { sessions: { create: sessionsCreate } },
    coupons: { create: couponsCreate },
  });
  getTenantSettings.mockResolvedValue(null);
  getProductsByIds.mockResolvedValue([product]);
  reserveProducts.mockResolvedValue([]);
  releaseProductReservations.mockResolvedValue(undefined);
  createOrder.mockResolvedValue(undefined);
  claimDiscount.mockResolvedValue(CLAIM);
  recordDiscountHold.mockResolvedValue(undefined);
  releaseDiscountClaim.mockResolvedValue(undefined);
  couponsCreate.mockResolvedValue({ id: "co_test_1" });
  sessionsCreate.mockResolvedValue({
    id: "cs_1",
    url: "https://checkout.stripe.com/cs_1",
    amount_total: 16650,
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function run(overrides: Record<string, unknown> = {}) {
  return createStorefrontCheckoutSession({
    tenant,
    productIds: [1],
    channel: "web",
    baseUrl: `https://aurora.${BRAND.domain}`,
    ...overrides,
  });
}

describe("no discount code", () => {
  it("sends exactly the parameters it always did", async () => {
    const result = await run();
    expect(claimDiscount).not.toHaveBeenCalled();
    expect(couponsCreate).not.toHaveBeenCalled();
    expect(sessionsCreate.mock.calls[0][0]).not.toHaveProperty("discounts");
    expect(result.discount).toBeNull();
  });

  it("treats a blank code as no code at all", async () => {
    await run({ discountCode: "   " });
    expect(claimDiscount).not.toHaveBeenCalled();
  });

  it("charges the platform fee on the full subtotal", async () => {
    await run();
    const params = sessionsCreate.mock.calls[0][0];
    // 1% of CHF 185.00
    expect(params.payment_intent_data.application_fee_amount).toBe(185);
  });
});

describe("with a discount code", () => {
  it("validates the code against this basket's own subtotal", async () => {
    await run({ discountCode: " welcome10 " });
    expect(claimDiscount).toHaveBeenCalledWith({
      tenantId: 7,
      rawCode: " welcome10 ",
      subtotalRappen: 18_500,
      currency: "chf",
    });
  });

  it("passes the discount to Stripe as an amount-off coupon, not a percentage", async () => {
    await run({ discountCode: "WELCOME10" });
    expect(couponsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        amount_off: 1850,
        currency: "chf",
        duration: "once",
        max_redemptions: 1,
      }),
      { stripeAccount: CONNECTED },
    );
    expect(sessionsCreate.mock.calls[0][0].discounts).toEqual([
      { coupon: "co_test_1" },
    ]);
  });

  it("creates the coupon on the tenant's own connected account", async () => {
    await run({ discountCode: "WELCOME10" });
    expect(couponsCreate.mock.calls[0][1]).toEqual({
      stripeAccount: CONNECTED,
    });
  });

  // A fee on revenue nobody paid makes running a promotion cost the merchant
  // more per franc earned than not running one.
  it("charges the platform fee on the DISCOUNTED subtotal", async () => {
    await run({ discountCode: "WELCOME10" });
    const params = sessionsCreate.mock.calls[0][0];
    // 1% of (CHF 185.00 − CHF 18.50) = CHF 1.665 → 167 Rappen
    expect(params.payment_intent_data.application_fee_amount).toBe(167);
  });

  it("records the hold against the session Stripe just created", async () => {
    await run({ discountCode: "WELCOME10" });
    expect(recordDiscountHold).toHaveBeenCalledWith({
      tenantId: 7,
      discount: CLAIM.discount,
      stripeSessionId: "cs_1",
      currency: "chf",
    });
  });

  it("names the code on the session, so support can answer 'why was this less?'", async () => {
    await run({ discountCode: "WELCOME10" });
    expect(sessionsCreate.mock.calls[0][0].metadata).toMatchObject({
      discountCode: "WELCOME10",
    });
  });

  it("reports what came off, for the confirmation screen", async () => {
    const result = await run({ discountCode: "WELCOME10" });
    expect(result.discount).toEqual({
      code: "WELCOME10",
      amountOffRappen: 1850,
    });
  });

  // Free shipping is earned on what the shopper put in the basket. Taking it
  // away because a code dropped them under the threshold reads as the discount
  // not working.
  it("keeps free shipping earned before the discount was applied", async () => {
    // CHF 185 is over the CHF 50 threshold; a discount of CHF 18.50 leaves it
    // over too, so use a code big enough to cross back under.
    claimDiscount.mockResolvedValue({
      ok: true,
      discount: { codeId: 5, code: "BIG", amountOffRappen: 17_000 },
    });
    await run({ discountCode: "BIG" });
    const chOption = sessionsCreate.mock.calls[0][0].shipping_options[0];
    expect(chOption.shipping_rate_data.fixed_amount.amount).toBe(0);
  });
});

describe("a refused code", () => {
  beforeEach(() => {
    claimDiscount.mockResolvedValue({
      ok: false,
      reason: "expired",
      message: "That discount code has expired.",
    });
  });

  it("fails the checkout with the reason the shopper can act on", async () => {
    await expect(run({ discountCode: "OLD" })).rejects.toMatchObject({
      code: "DISCOUNT_REFUSED",
      message: "That discount code has expired.",
    });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("is a CheckoutError, so every front door maps it the same way", async () => {
    await expect(run({ discountCode: "OLD" })).rejects.toBeInstanceOf(
      CheckoutError,
    );
  });

  // The basket was reserved before the code was checked. Leaving those pieces
  // held for half an hour over a typo'd code would make them unbuyable.
  it("gives the reserved pieces back", async () => {
    await expect(run({ discountCode: "OLD" })).rejects.toThrow();
    expect(releaseProductReservations).toHaveBeenCalledWith(7, [1]);
  });
});

describe("failures after the slot was claimed", () => {
  it("gives the slot back when Stripe's coupon call fails", async () => {
    couponsCreate.mockRejectedValue(new Error("stripe down"));
    await expect(run({ discountCode: "WELCOME10" })).rejects.toThrow();
    expect(releaseDiscountClaim).toHaveBeenCalledWith({
      tenantId: 7,
      codeId: 5,
    });
  });

  it("gives the slot back when the session can't be created", async () => {
    sessionsCreate.mockRejectedValue(new Error("stripe down"));
    await expect(run({ discountCode: "WELCOME10" })).rejects.toThrow();
    expect(releaseDiscountClaim).toHaveBeenCalledWith({
      tenantId: 7,
      codeId: 5,
    });
  });

  // Once a hold row exists, the release has to name the session — otherwise the
  // row stays `held`, a later sweep releases it too, and the counter is
  // decremented twice for one claim.
  it("names the session when the hold was already written", async () => {
    createOrder.mockRejectedValue(new Error("db gone"));
    await expect(run({ discountCode: "WELCOME10" })).rejects.toThrow();
    expect(releaseDiscountClaim).toHaveBeenCalledWith({
      tenantId: 7,
      codeId: 5,
      stripeSessionId: "cs_1",
    });
  });

  it("leaves the slot alone on a successful checkout", async () => {
    await run({ discountCode: "WELCOME10" });
    expect(releaseDiscountClaim).not.toHaveBeenCalled();
  });
});
