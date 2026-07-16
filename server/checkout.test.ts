import { describe, expect, it, vi, beforeEach } from "vitest";

const getProductsByIds = vi.fn();
const createOrder = vi.fn();
const getOrderBySessionId = vi.fn();

vi.mock("./db", () => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
  getAllProducts: vi.fn().mockResolvedValue([]),
  getProductById: vi.fn(),
  getVisibleProductById: vi.fn(),
  getVisibleProducts: vi.fn().mockResolvedValue([]),
  setProductVisibility: vi.fn(),
  setProductSold: vi.fn(),
  setProductQuantity: vi.fn(),
  getProductImages: vi.fn(),
  addProductImage: vi.fn(),
  deleteProductImage: vi.fn(),
  deleteAllProductImages: vi.fn(),
  getInstagramPosts: vi.fn().mockResolvedValue([]),
  addInstagramPost: vi.fn(),
  deleteInstagramPost: vi.fn(),
  reorderInstagramPost: vi.fn(),
  insertBulkUploadLog: vi.fn(),
  getBulkUploadLogs: vi.fn(),
  getProductsByIds: (...args: unknown[]) => getProductsByIds(...args),
  createOrder: (...args: unknown[]) => createOrder(...args),
  getOrderBySessionId: (...args: unknown[]) => getOrderBySessionId(...args),
  getProductsMissingTranslation: vi.fn(),
  getPaidOrders: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

const checkoutSessionsCreate = vi.fn();
const sessionsRetrieve = vi.fn();
const getStripe = vi.fn();
const isStripeConfigured = vi.fn();

vi.mock("./stripe", () => ({
  getStripe: (...args: unknown[]) => getStripe(...args),
  isStripeConfigured: (...args: unknown[]) => isStripeConfigured(...args),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(role: "admin" | "user" | null = null): TrpcContext {
  const user =
    role !== null
      ? {
          id: 1,
          openId: "test-user",
          email: "test@example.com",
          name: "Test User",
          loginMethod: "manus",
          role,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        }
      : null;

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const sampleProduct = {
  id: 1,
  name: "Silver Moonstone Ring",
  description: "Delicate sterling silver ring with moonstone",
  price: "185.00",
  category: "Rings" as const,
  imageKey: null,
  imageUrl: null,
  visible: true,
  sold: false,
  quantity: 1,
  source: "manual" as const,
  discordMessageId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  nameEn: null,
  descriptionEn: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  getStripe.mockReturnValue({
    checkout: {
      sessions: { create: checkoutSessionsCreate, retrieve: sessionsRetrieve },
    },
  });
  isStripeConfigured.mockReturnValue(true);
});

describe("checkout.config", () => {
  it("reflects whether Stripe is configured", async () => {
    isStripeConfigured.mockReturnValue(false);
    const caller = appRouter.createCaller(makeCtx());
    expect(await caller.checkout.config()).toEqual({ enabled: false });

    isStripeConfigured.mockReturnValue(true);
    expect(await caller.checkout.config()).toEqual({ enabled: true });
  });
});

describe("checkout.createSession", () => {
  it("throws PRECONDITION_FAILED when Stripe is not configured", async () => {
    getStripe.mockReturnValue(null);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1] })
    ).rejects.toThrow(/not configured/);
  });

  it("throws NOT_FOUND when a requested product no longer exists", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1, 2] })
    ).rejects.toThrow(/no longer available/);
  });

  it("throws CONFLICT when a requested product is already sold", async () => {
    getProductsByIds.mockResolvedValue([{ ...sampleProduct, sold: true }]);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1] })
    ).rejects.toThrow(/Already sold/);
  });

  it("throws CONFLICT when a requested product has zero quantity", async () => {
    getProductsByIds.mockResolvedValue([{ ...sampleProduct, quantity: 0 }]);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1] })
    ).rejects.toThrow(/Already sold/);
  });

  it("creates a Stripe session and a pending order for available products", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_new",
      url: "https://checkout.stripe.com/cs_test_new",
      amount_total: 18500,
    });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.checkout.createSession({ productIds: [1, 1] });

    expect(getProductsByIds).toHaveBeenCalledWith([1]);
    expect(checkoutSessionsCreate).toHaveBeenCalledTimes(1);
    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    expect(sessionArgs.line_items).toHaveLength(1);
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(18500);

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeSessionId: "cs_test_new",
        status: "pending",
        amountTotal: 18500,
        productIds: "1",
      })
    );
    expect(result).toEqual({
      url: "https://checkout.stripe.com/cs_test_new",
      sessionId: "cs_test_new",
    });
  });

  it("ignores a client-controlled Origin header when building success/cancel URLs", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_redirect",
      url: "https://checkout.stripe.com/cs_test_redirect",
      amount_total: 18500,
    });

    const ctx = makeCtx();
    ctx.req.headers = { origin: "https://evil.example.com" };
    const caller = appRouter.createCaller(ctx);
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    expect(sessionArgs.success_url).not.toContain("evil.example.com");
    expect(sessionArgs.cancel_url).not.toContain("evil.example.com");
  });

  // ─── REGRESSION: statement_descriptor must be inside payment_intent_data ──
  // This test would have caught the bug where statement_descriptor was passed
  // at the top level, causing Stripe to reject it with:
  //   "Received unknown parameter: statement_descriptor"
  // See: https://github.com/ankurgupta7/Kalakosh-ch/pull/85

  it("places statement_descriptor inside payment_intent_data (regression guard)", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_descriptor",
      url: "https://checkout.stripe.com/cs_test",
      amount_total: 18500,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];

    // Must NOT be at the top level — newer Stripe API versions reject this.
    expect(sessionArgs).not.toHaveProperty("statement_descriptor");

    // Must be nested inside payment_intent_data.
    expect(sessionArgs).toHaveProperty("payment_intent_data");
    expect(sessionArgs.payment_intent_data.statement_descriptor).toBe("KALAKOSH");
  });

  // ─── Shipping fee logic ───────────────────────────────────────────────────

  it("adds free shipping when the subtotal is at or above CHF 50", async () => {
    getProductsByIds.mockResolvedValue([
      { ...sampleProduct, price: "65.00" },
    ]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_ship",
      url: "https://checkout.stripe.com/cs_test_ship",
      amount_total: 6500,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    const shippingRate = sessionArgs.shipping_options[0].shipping_rate_data;
    expect(shippingRate.fixed_amount.amount).toBe(0);
    expect(shippingRate.display_name).toBe("Free shipping (Switzerland)");
  });

  it("adds a CHF 2 shipping fee when the subtotal is below CHF 50", async () => {
    getProductsByIds.mockResolvedValue([
      { ...sampleProduct, price: "35.00" },
    ]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_ship2",
      url: "https://checkout.stripe.com/cs_test_ship2",
      amount_total: 3500,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    const shippingRate = sessionArgs.shipping_options[0].shipping_rate_data;
    expect(shippingRate.fixed_amount.amount).toBe(200);
    expect(shippingRate.display_name).toBe("Standard shipping (Switzerland)");
  });
});

describe("checkout.orderStatus", () => {
  it("returns null when no order matches the session id", async () => {
    getOrderBySessionId.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.checkout.orderStatus({
      sessionId: "cs_missing",
    });
    expect(result).toBeNull();
  });

  it("returns order summary fields when found", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    getOrderBySessionId.mockResolvedValue({
      id: 7,
      status: "paid",
      amountTotal: 18500,
      currency: "chf",
      customerEmail: "buyer@example.com",
      customerName: "Jane Buyer",
      paymentMethod: "card",
      productIds: "1",
      createdAt,
    });
    getProductsByIds.mockResolvedValue([sampleProduct]);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.checkout.orderStatus({
      sessionId: "cs_test_new",
    });
    expect(result).toEqual({
      reference: 7,
      status: "paid",
      amountTotal: 18500,
      currency: "chf",
      customerEmail: "buyer@example.com",
      customerName: "Jane Buyer",
      paymentMethod: "card",
      createdAt: createdAt.toISOString(),
      items: [
        {
          id: sampleProduct.id,
          name: sampleProduct.name,
          nameEn: sampleProduct.nameEn ?? null,
          price: sampleProduct.price,
          imageUrl: sampleProduct.imageUrl ?? null,
        },
      ],
    });
  });

  it("polls Stripe for a still-pending order and reflects the paid status", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    getOrderBySessionId.mockResolvedValue({
      id: 8,
      status: "pending",
      amountTotal: 9900,
      currency: "chf",
      customerEmail: null,
      customerName: null,
      paymentMethod: null,
      productIds: "1",
      createdAt,
    });
    getProductsByIds.mockResolvedValue([sampleProduct]);
    sessionsRetrieve.mockResolvedValue({
      payment_status: "paid",
      customer_details: { email: "buyer@example.com", name: "Jane Buyer" },
      payment_method_types: ["twint"],
    });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.checkout.orderStatus({
      sessionId: "cs_test_new",
    });

    expect(result?.status).toBe("paid");
    expect(result?.customerEmail).toBe("buyer@example.com");
    expect(result?.paymentMethod).toBe("twint");
  });
});

describe("auth.me", () => {
  it("returns null when there is no authenticated user", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    expect(await caller.auth.me()).toBeNull();
  });

  it("returns the current user when authenticated", async () => {
    const ctx = makeCtx("admin");
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toEqual(ctx.user);
  });
});
