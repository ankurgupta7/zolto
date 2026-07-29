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
    baseUrl: "https://aurora.zolto.shop",
    ...overrides,
  });
}

describe("platformFeeRappen", () => {
  it("takes 1% on Free, nothing on Pro, and treats unknown plans as Free", () => {
    expect(platformFeeRappen("free", 18_500)).toBe(185);
    expect(platformFeeRappen("pro", 18_500)).toBe(0);
    expect(platformFeeRappen("legacy-tier", 18_500)).toBe(185);
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

  it("records the sales channel on both the order and the Stripe session", async () => {
    await run({ channel: "agent" });
    expect(sessionsCreate.mock.calls[0][0].metadata.channel).toBe("agent");
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "agent", platformFeeRappen: 185 }),
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
