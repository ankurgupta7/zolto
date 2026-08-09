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

const sessionsCreate = vi.fn();
const getStripe = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: (...a: unknown[]) => getStripe(...a),
}));

import {
  CheckoutError,
  createStorefrontCheckoutSession,
  isPlatformFeeRejection,
  platformFeeRappen,
} from "./checkoutSession";
import type { Tenant } from "../drizzle/schema";

const tenant = {
  id: 7,
  name: "Aurora",
  plan: "free",
  stripeConnectedAccountId: "acct_connected",
} as Tenant;

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

beforeEach(() => {
  vi.clearAllMocks();
  getStripe.mockReturnValue({
    checkout: { sessions: { create: sessionsCreate } },
  });
  getTenantSettings.mockResolvedValue(null);
  getProductsByIds.mockResolvedValue([product]);
  reserveProducts.mockResolvedValue([]);
  releaseProductReservations.mockResolvedValue(undefined);
  createOrder.mockResolvedValue(undefined);
  sessionsCreate.mockResolvedValue({
    id: "cs_1",
    url: "https://checkout.stripe.com/cs_1",
    amount_total: 18500,
  });
});

function run(
  overrides: Partial<
    Parameters<typeof createStorefrontCheckoutSession>[0]
  > = {},
) {
  return createStorefrontCheckoutSession({
    tenant,
    productIds: [1],
    channel: "web",
    baseUrl: "https://aurora.zolto.ch",
    ...overrides,
  });
}

describe("platformFeeRappen", () => {
  it("takes 1% on Free, nothing on Pro, and treats unknown plans as Free", () => {
    expect(platformFeeRappen({ plan: "free" }, 18_500)).toBe(185);
    expect(platformFeeRappen({ plan: "pro" }, 18_500)).toBe(0);
    expect(platformFeeRappen({ plan: "legacy-tier" }, 18_500)).toBe(185);
  });

  it("takes nothing from a store comped onto Pro", () => {
    expect(platformFeeRappen({ plan: "free", compPlan: "pro" }, 18_500)).toBe(
      0,
    );
  });

  it("takes nothing from a store whose fee is waived on Free", () => {
    // The other half of the favour: still on Free's limits, but we don't skim.
    expect(
      platformFeeRappen({ plan: "free", compFeeWaived: true }, 18_500),
    ).toBe(0);
  });
});

describe("createStorefrontCheckoutSession", () => {
  it("creates the session on the tenant's own connected account", async () => {
    const result = await run();
    expect(result.url).toBe("https://checkout.stripe.com/cs_1");
    expect(sessionsCreate.mock.calls[0][1]).toEqual({
      stripeAccount: "acct_connected",
    });
  });

  it("applies the platform fee on the subtotal, never on shipping", async () => {
    // CHF 185 subtotal → free CH shipping (over the CHF 50 threshold), so the
    // fee must still be 1% of 18500 and not of the shipped total.
    await run();
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.payment_intent_data.application_fee_amount).toBe(185);
    expect(
      args.shipping_options[0].shipping_rate_data.fixed_amount.amount,
    ).toBe(0);
  });

  it("omits the fee entirely for Pro tenants", async () => {
    await run({ tenant: { ...tenant, plan: "pro" } as Tenant });
    const args = sessionsCreate.mock.calls[0][0];
    expect("application_fee_amount" in args.payment_intent_data).toBe(false);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ platformFeeRappen: 0 }),
    );
  });

  // The end of the "don't charge them any margin" promise: the merchant's own
  // Stripe charge must carry no application_fee_amount at all, and the order
  // must record that Zolto earned nothing on it.
  it("omits the fee entirely for a store comped onto Pro", async () => {
    await run({
      tenant: { ...tenant, plan: "free", compPlan: "pro" } as Tenant,
    });
    const args = sessionsCreate.mock.calls[0][0];
    expect("application_fee_amount" in args.payment_intent_data).toBe(false);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ platformFeeRappen: 0 }),
    );
  });

  it("omits the fee for a Free store whose fee alone is waived", async () => {
    await run({
      tenant: { ...tenant, plan: "free", compFeeWaived: true } as Tenant,
    });
    const args = sessionsCreate.mock.calls[0][0];
    expect("application_fee_amount" in args.payment_intent_data).toBe(false);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ platformFeeRappen: 0 }),
    );
  });

  it("still takes 1% from an ordinary free store", async () => {
    await run();
    expect(
      sessionsCreate.mock.calls[0][0].payment_intent_data
        .application_fee_amount,
    ).toBe(185);
  });

  it("records the sales channel on both the order and the Stripe session", async () => {
    await run({ channel: "agent" });
    expect(sessionsCreate.mock.calls[0][0].metadata.channel).toBe("agent");
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "agent", platformFeeRappen: 185 }),
    );
  });

  it("passes the customer's language to Stripe and stores it on the order", async () => {
    await run({ locale: "fr" });
    expect(sessionsCreate.mock.calls[0][0].locale).toBe("fr");
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "fr" }),
    );
  });

  it("falls back to Stripe auto-detection and a null order locale when none is sent", async () => {
    await run();
    expect(sessionsCreate.mock.calls[0][0].locale).toBe("auto");
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ locale: null }),
    );
  });

  it("refuses when this store hasn't connected Stripe", async () => {
    await expect(
      run({ tenant: { ...tenant, stripeConnectedAccountId: null } as Tenant }),
    ).rejects.toMatchObject({ code: "NOT_CONNECTED" });
    expect(reserveProducts).not.toHaveBeenCalled();
  });

  it("refuses when Zolto's own Stripe key is missing", async () => {
    getStripe.mockReturnValue(null);
    await expect(run()).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("refuses unknown ids without reserving anything", async () => {
    getProductsByIds.mockResolvedValue([]);
    await expect(run({ productIds: [99] })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(reserveProducts).not.toHaveBeenCalled();
  });

  it("refuses pieces that are already sold", async () => {
    getProductsByIds.mockResolvedValue([{ ...product, sold: true }]);
    await expect(run()).rejects.toBeInstanceOf(CheckoutError);
    expect(reserveProducts).not.toHaveBeenCalled();
  });

  it("releases partial holds when someone else is mid-purchase", async () => {
    getProductsByIds.mockResolvedValue([
      product,
      { ...product, id: 2, name: "Second" },
    ]);
    reserveProducts.mockResolvedValue([2]); // id 2 lost the race
    await expect(run({ productIds: [1, 2] })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // The one we DID get must not stay held.
    expect(releaseProductReservations).toHaveBeenCalledWith(7, [1]);
  });

  it("releases the hold when Stripe fails after reserving", async () => {
    sessionsCreate.mockRejectedValue(new Error("stripe exploded"));
    await expect(run()).rejects.toThrow(/stripe exploded/);
    expect(releaseProductReservations).toHaveBeenCalledWith(7, [1]);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("de-duplicates repeated ids — each piece is one-of-a-kind", async () => {
    await run({ productIds: [1, 1, 1] });
    expect(getProductsByIds).toHaveBeenCalledWith(7, [1]);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ productIds: "1" }),
    );
  });
});

/**
 * Stripe rejecting the application fee fails the WHOLE session creation, so
 * without a fallback a Connect misconfiguration takes a vendor's storefront
 * offline rather than costing Zolto 1%.
 */
describe("platform fee rejection", () => {
  function stripeErr(props: Record<string, unknown>) {
    return Object.assign(new Error(String(props.message ?? "boom")), props);
  }

  describe("isPlatformFeeRejection", () => {
    it("recognises the fee parameter being named", () => {
      expect(
        isPlatformFeeRejection(
          stripeErr({
            type: "StripeInvalidRequestError",
            param: "payment_intent_data[application_fee_amount]",
          }),
        ),
      ).toBe(true);
    });

    it("recognises a Connect permissions failure", () => {
      expect(
        isPlatformFeeRejection(stripeErr({ type: "StripePermissionError" })),
      ).toBe(true);
      expect(
        isPlatformFeeRejection(
          stripeErr({
            type: "StripeError",
            code: "application_fees_not_allowed",
          }),
        ),
      ).toBe(true);
    });

    it("recognises an invalid request that names application fees", () => {
      expect(
        isPlatformFeeRejection(
          stripeErr({
            type: "StripeInvalidRequestError",
            message: "You cannot collect an application fee on this account.",
          }),
        ),
      ).toBe(true);
    });

    it("does NOT swallow unrelated failures", () => {
      // These must propagate — retrying them fee-free would hide a real bug.
      expect(
        isPlatformFeeRejection(stripeErr({ type: "StripeCardError" })),
      ).toBe(false);
      expect(
        isPlatformFeeRejection(
          stripeErr({
            type: "StripeInvalidRequestError",
            param: "line_items[0][price]",
          }),
        ),
      ).toBe(false);
      expect(
        isPlatformFeeRejection(
          stripeErr({ type: "StripeAPIError", message: "service unavailable" }),
        ),
      ).toBe(false);
      expect(isPlatformFeeRejection(new Error("plain"))).toBe(false);
      expect(isPlatformFeeRejection(null)).toBe(false);
      expect(isPlatformFeeRejection("nope")).toBe(false);
    });

    it("does not match a card error that merely mentions a fee", () => {
      expect(
        isPlatformFeeRejection(
          stripeErr({
            type: "StripeCardError",
            message: "Card declined: application fee dispute",
          }),
        ),
      ).toBe(false);
    });
  });

  it("still completes the sale when Stripe rejects the fee, recording zero taken", async () => {
    sessionsCreate
      .mockRejectedValueOnce(
        stripeErr({
          type: "StripeInvalidRequestError",
          param: "payment_intent_data[application_fee_amount]",
        }),
      )
      .mockResolvedValueOnce({
        id: "cs_retry",
        url: "https://checkout.stripe.com/cs_retry",
        amount_total: 18500,
      });

    const result = await run();

    // The buyer gets a working checkout — losing 1% beats losing the order.
    expect(result.url).toBe("https://checkout.stripe.com/cs_retry");
    expect(sessionsCreate).toHaveBeenCalledTimes(2);
    // First attempt carried the fee, retry dropped it entirely.
    expect(
      sessionsCreate.mock.calls[0][0].payment_intent_data
        .application_fee_amount,
    ).toBe(185);
    expect(
      "application_fee_amount" in
        sessionsCreate.mock.calls[1][0].payment_intent_data,
    ).toBe(false);
    // The order tells the truth: we earned nothing on it.
    expect(result.platformFeeRappen).toBe(0);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ platformFeeRappen: 0 }),
    );
    // And the stock stays held for the buyer who is now paying.
    expect(releaseProductReservations).not.toHaveBeenCalled();
  });

  it("logs loudly enough to be noticed, since revenue is silently lost", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    sessionsCreate
      .mockRejectedValueOnce(stripeErr({ type: "StripePermissionError" }))
      .mockResolvedValueOnce({ id: "cs_r", url: "u", amount_total: 18500 });

    await run();

    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toMatch(/rejected the platform fee/i);
    spy.mockRestore();
  });

  it("does not retry for a Pro tenant — there was no fee to reject", async () => {
    sessionsCreate.mockRejectedValue(
      stripeErr({
        type: "StripeInvalidRequestError",
        param: "payment_intent_data[application_fee_amount]",
      }),
    );
    await expect(
      run({ tenant: { ...tenant, plan: "pro" } as Tenant }),
    ).rejects.toThrow();
    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    expect(releaseProductReservations).toHaveBeenCalledWith(7, [1]);
  });

  it("gives up (and releases stock) if the fee-free retry also fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    sessionsCreate
      .mockRejectedValueOnce(
        stripeErr({
          type: "StripeInvalidRequestError",
          param: "payment_intent_data[application_fee_amount]",
        }),
      )
      .mockRejectedValueOnce(new Error("stripe still down"));

    await expect(run()).rejects.toThrow(/stripe still down/);
    expect(releaseProductReservations).toHaveBeenCalledWith(7, [1]);
    expect(createOrder).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
