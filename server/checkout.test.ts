import { describe, expect, it, vi, beforeEach } from "vitest";

const getProductsByIds = vi.fn();
const createOrder = vi.fn();
const getOrderBySessionId = vi.fn();
const getTenantById = vi.fn();
const reserveProducts = vi.fn();
const releaseProductReservations = vi.fn();
const getPaidOrders = vi.fn();

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
  getTenantById: (...args: unknown[]) => getTenantById(...args),
  getTenantSettings: vi.fn().mockResolvedValue(null),
  reserveProducts: (...args: unknown[]) => reserveProducts(...args),
  releaseProductReservations: (...args: unknown[]) =>
    releaseProductReservations(...args),
  PRODUCT_RESERVATION_TTL_MS: 30 * 60 * 1000,
  getProductsMissingTranslation: vi.fn(),
  getPaidOrders: (...args: unknown[]) => getPaidOrders(...args),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

const checkoutSessionsCreate = vi.fn();
const sessionsRetrieve = vi.fn();
const getStripe = vi.fn();
const isStripeConfigured = vi.fn();
const fulfillOrder = vi.fn();

vi.mock("./stripe", () => ({
  getStripe: (...args: unknown[]) => getStripe(...args),
  isStripeConfigured: (...args: unknown[]) => isStripeConfigured(...args),
  fulfillOrder: (...args: unknown[]) => fulfillOrder(...args),
}));

import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const TEST_TENANT_ID = 7;
const TEST_CONNECTED_ACCOUNT_ID = "acct_test_connected";

function makeCtx(role: "admin" | "user" | null = null): TrpcContext {
  const user =
    role !== null
      ? {
          id: 1,
          tenantId: TEST_TENANT_ID,
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
    // The storefront tenant is resolved from the request; checkout scopes all
    // product/order lookups to it. Has a connected Stripe account by default
    // (tests that need the "not connected" case override this).
    tenant: {
      id: TEST_TENANT_ID,
      name: "Test Store",
      plan: "free",
      stripeConnectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
    } as TrpcContext["tenant"],
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
  getTenantById.mockResolvedValue({
    id: TEST_TENANT_ID,
    name: "Test Store",
    stripeConnectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
  });
  // Default: every requested piece gets reserved successfully (empty array =
  // no failures). Tests exercising the "someone else is already buying" path
  // override this.
  reserveProducts.mockResolvedValue([]);
  releaseProductReservations.mockResolvedValue(undefined);
});

describe("checkout.config", () => {
  it("reflects whether the platform Stripe key is configured", async () => {
    isStripeConfigured.mockReturnValue(false);
    const caller = appRouter.createCaller(makeCtx());
    expect(await caller.checkout.config()).toEqual({ enabled: false });

    isStripeConfigured.mockReturnValue(true);
    expect(await caller.checkout.config()).toEqual({ enabled: true });
  });

  it("is disabled when this tenant hasn't connected their own Stripe account", async () => {
    isStripeConfigured.mockReturnValue(true);
    const ctx = makeCtx();
    ctx.tenant = {
      id: TEST_TENANT_ID,
      stripeConnectedAccountId: null,
    } as TrpcContext["tenant"];
    const caller = appRouter.createCaller(ctx);
    expect(await caller.checkout.config()).toEqual({ enabled: false });
  });
});

describe("checkout.createSession", () => {
  it("throws PRECONDITION_FAILED when Stripe is not configured", async () => {
    getStripe.mockReturnValue(null);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1] }),
    ).rejects.toThrow(/not configured/);
  });

  it("throws PRECONDITION_FAILED when this store hasn't connected Stripe (Connect)", async () => {
    const ctx = makeCtx();
    ctx.tenant = {
      id: TEST_TENANT_ID,
      name: "Test Store",
      stripeConnectedAccountId: null,
    } as TrpcContext["tenant"];
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.checkout.createSession({ productIds: [1] }),
    ).rejects.toThrow(/hasn't connected online payments/);
    expect(checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when a requested product no longer exists", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1, 2] }),
    ).rejects.toThrow(/no longer available/);
  });

  it("throws CONFLICT when a requested product is already sold", async () => {
    getProductsByIds.mockResolvedValue([{ ...sampleProduct, sold: true }]);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1] }),
    ).rejects.toThrow(/Already sold/);
  });

  it("throws CONFLICT when a requested product has zero quantity", async () => {
    getProductsByIds.mockResolvedValue([{ ...sampleProduct, quantity: 0 }]);
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1] }),
    ).rejects.toThrow(/Already sold/);
  });

  // ─── POS <-> online inventory sync (checkout holds) ────────────────────────

  it("reserves the requested products before creating the Stripe session", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_reserve",
      url: "https://checkout.stripe.com/cs_test_reserve",
      amount_total: 18500,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });

    expect(reserveProducts).toHaveBeenCalledWith(TEST_TENANT_ID, [1]);
  });

  it("sets the Stripe session's expires_at to match the reservation TTL", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_expiry",
      url: "https://checkout.stripe.com/cs_test_expiry",
      amount_total: 18500,
    });

    const before = Date.now();
    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });
    const after = Date.now();

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    const expiresAtMs = sessionArgs.expires_at * 1000;
    // Stripe's minimum expires_at is 30 minutes from creation — the hold
    // must never outlive the session, so these need to line up.
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + 30 * 60 * 1000 - 2000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + 30 * 60 * 1000 + 2000);
  });

  it("throws CONFLICT and releases any partial hold when another sale already claimed a piece", async () => {
    const second = { ...sampleProduct, id: 2, name: "Baroque Pearl Drops" };
    getProductsByIds.mockResolvedValue([sampleProduct, second]);
    // Product 2 lost the race — someone else (POS, or another checkout) is
    // already buying it.
    reserveProducts.mockResolvedValue([2]);

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1, 2] }),
    ).rejects.toThrow(/Someone else is already buying.*Baroque Pearl Drops/);

    // The hold this call DID win (on product 1) must be given back since
    // we're not proceeding with this checkout at all.
    expect(releaseProductReservations).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      [1],
    );
    expect(checkoutSessionsCreate).not.toHaveBeenCalled();
  });

  it("releases the reservation if Stripe session creation fails", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockRejectedValueOnce(new Error("Stripe is down"));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1] }),
    ).rejects.toThrow("Stripe is down");

    expect(releaseProductReservations).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      [1],
    );
  });

  it("releases the reservation if persisting the order fails", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_order_fail",
      url: "https://checkout.stripe.com/cs_test_order_fail",
      amount_total: 18500,
    });
    createOrder.mockRejectedValueOnce(new Error("DB unavailable"));

    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.checkout.createSession({ productIds: [1] }),
    ).rejects.toThrow("DB unavailable");

    expect(releaseProductReservations).toHaveBeenCalledWith(
      TEST_TENANT_ID,
      [1],
    );
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

    expect(getProductsByIds).toHaveBeenCalledWith(TEST_TENANT_ID, [1]);
    expect(checkoutSessionsCreate).toHaveBeenCalledTimes(1);
    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    expect(sessionArgs.line_items).toHaveLength(1);
    expect(sessionArgs.line_items[0].price_data.unit_amount).toBe(18500);

    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TEST_TENANT_ID,
        stripeSessionId: "cs_test_new",
        status: "pending",
        amountTotal: 18500,
        productIds: "1",
      }),
    );
    expect(result).toEqual({
      url: "https://checkout.stripe.com/cs_test_new",
      sessionId: "cs_test_new",
    });

    // Runs on the tenant's own connected account — never Zolto's own.
    const options = checkoutSessionsCreate.mock.calls[0][1];
    expect(options).toEqual({ stripeAccount: TEST_CONNECTED_ACCOUNT_ID });
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

  it("places statement_descriptor (derived from the tenant's name) inside payment_intent_data", async () => {
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

    // Must be nested inside payment_intent_data, and per-tenant — not a
    // hardcoded brand name (this router serves every tenant's storefront).
    expect(sessionArgs).toHaveProperty("payment_intent_data");
    expect(sessionArgs.payment_intent_data.statement_descriptor).toBe(
      "TEST STORE",
    );
  });

  it("truncates statement_descriptor to Stripe's 22-char limit", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_long_name",
      url: "https://checkout.stripe.com/cs_test",
      amount_total: 18500,
    });

    const ctx = makeCtx();
    ctx.tenant = {
      id: TEST_TENANT_ID,
      name: "A Very Long Jewelry Store Name Indeed",
      stripeConnectedAccountId: TEST_CONNECTED_ACCOUNT_ID,
    } as TrpcContext["tenant"];
    const caller = appRouter.createCaller(ctx);
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    expect(
      sessionArgs.payment_intent_data.statement_descriptor.length,
    ).toBeLessThanOrEqual(22);
  });

  it("takes the 1% platform fee on the product subtotal for Free-plan tenants", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]); // CHF 185.00
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_fee",
      url: "https://checkout.stripe.com/cs_test",
      amount_total: 18500,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    // 1% of 18500 Rappen — computed on the subtotal, never on shipping.
    expect(sessionArgs.payment_intent_data.application_fee_amount).toBe(185);
    // The fee is recorded on the order for skim-revenue instrumentation.
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ platformFeeRappen: 185, channel: "web" }),
    );
  });

  it("takes no platform fee on the Pro plan", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_fee_pro",
      url: "https://checkout.stripe.com/cs_test",
      amount_total: 18500,
    });

    const ctx = makeCtx();
    ctx.tenant = {
      ...ctx.tenant,
      plan: "pro",
    } as TrpcContext["tenant"];
    const caller = appRouter.createCaller(ctx);
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    // Omitted entirely, not passed as 0 — Pro keeps every online sale.
    expect("application_fee_amount" in sessionArgs.payment_intent_data).toBe(
      false,
    );
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ platformFeeRappen: 0 }),
    );
  });

  it("attributes agent-originated checkouts as their own channel", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_agent",
      url: "https://checkout.stripe.com/cs_test",
      amount_total: 18500,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1], channel: "agent" });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    expect(sessionArgs.metadata.channel).toBe("agent");
    // Agent orders are online orders — the Free-plan fee applies the same.
    expect(sessionArgs.payment_intent_data.application_fee_amount).toBe(185);
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "agent" }),
    );
  });

  // ─── Shipping fee logic ───────────────────────────────────────────────────

  it("adds free CH shipping when the subtotal is at or above CHF 50", async () => {
    getProductsByIds.mockResolvedValue([{ ...sampleProduct, price: "65.00" }]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_ship",
      url: "https://checkout.stripe.com/cs_test_ship",
      amount_total: 6500,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    const chRate = sessionArgs.shipping_options[0].shipping_rate_data;
    expect(chRate.fixed_amount.amount).toBe(0);
    expect(chRate.display_name).toBe("Free shipping (Switzerland)");
  });

  it("adds a CHF 8 CH shipping fee when the subtotal is below CHF 50", async () => {
    getProductsByIds.mockResolvedValue([{ ...sampleProduct, price: "35.00" }]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_ship2",
      url: "https://checkout.stripe.com/cs_test_ship2",
      amount_total: 3500,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    const chRate = sessionArgs.shipping_options[0].shipping_rate_data;
    expect(chRate.fixed_amount.amount).toBe(800);
    expect(chRate.display_name).toBe("Standard shipping (Switzerland)");
  });

  it("always offers a flat CHF 15 EU shipping option alongside the CH one", async () => {
    getProductsByIds.mockResolvedValue([{ ...sampleProduct, price: "65.00" }]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_ship3",
      url: "https://checkout.stripe.com/cs_test_ship3",
      amount_total: 6500,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    expect(sessionArgs.shipping_options).toHaveLength(2);
    const euRate = sessionArgs.shipping_options[1].shipping_rate_data;
    expect(euRate.fixed_amount.amount).toBe(1500);
    expect(euRate.display_name).toBe("Standard shipping (EU)");
  });

  it("allows shipping to CH and all EU member countries", async () => {
    getProductsByIds.mockResolvedValue([sampleProduct]);
    checkoutSessionsCreate.mockResolvedValue({
      id: "cs_test_countries",
      url: "https://checkout.stripe.com/cs_test_countries",
      amount_total: 1000,
    });

    const caller = appRouter.createCaller(makeCtx());
    await caller.checkout.createSession({ productIds: [1] });

    const sessionArgs = checkoutSessionsCreate.mock.calls[0][0];
    const allowedCountries =
      sessionArgs.shipping_address_collection.allowed_countries;
    expect(allowedCountries).toContain("CH");
    expect(allowedCountries).toContain("DE");
    expect(allowedCountries).toContain("FR");
    expect(allowedCountries.length).toBe(28); // CH + 27 EU member states
  });
});

describe("checkout.fulfillSession", () => {
  it("throws NOT_FOUND when no order matches the session id", async () => {
    getOrderBySessionId.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.checkout.fulfillSession({ sessionId: "cs_missing" }),
    ).rejects.toThrow(/Order not found/);
  });

  it("throws NOT_FOUND when the order belongs to a different tenant", async () => {
    getOrderBySessionId.mockResolvedValue({
      id: 1,
      tenantId: TEST_TENANT_ID + 1,
      productIds: "1",
    });
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.checkout.fulfillSession({ sessionId: "cs_test" }),
    ).rejects.toThrow(/Order not found/);
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the store has no connected Stripe account", async () => {
    getOrderBySessionId.mockResolvedValue({
      id: 1,
      tenantId: TEST_TENANT_ID,
      productIds: "1",
    });
    getTenantById.mockResolvedValue({
      id: TEST_TENANT_ID,
      stripeConnectedAccountId: null,
    });
    const caller = appRouter.createCaller(makeCtx("admin"));
    await expect(
      caller.checkout.fulfillSession({ sessionId: "cs_test" }),
    ).rejects.toThrow(/no connected Stripe account/);
  });

  it("retrieves the session on the tenant's connected account and fulfills it", async () => {
    getOrderBySessionId.mockResolvedValue({
      id: 1,
      tenantId: TEST_TENANT_ID,
      productIds: "1",
    });
    sessionsRetrieve.mockResolvedValue({
      id: "cs_test",
      payment_status: "paid",
    });
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.checkout.fulfillSession({
      sessionId: "cs_test",
    });

    expect(sessionsRetrieve).toHaveBeenCalledWith(
      "cs_test",
      {},
      { stripeAccount: TEST_CONNECTED_ACCOUNT_ID },
    );
    expect(result).toEqual({ success: true });
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
    expect(sessionsRetrieve).toHaveBeenCalledWith(
      "cs_test_new",
      {},
      { stripeAccount: TEST_CONNECTED_ACCOUNT_ID },
    );
  });

  it("does not poll Stripe when the order's tenant has no connected account", async () => {
    getOrderBySessionId.mockResolvedValue({
      id: 9,
      tenantId: TEST_TENANT_ID,
      status: "pending",
      amountTotal: 9900,
      currency: "chf",
      customerEmail: null,
      customerName: null,
      paymentMethod: null,
      productIds: "1",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    getProductsByIds.mockResolvedValue([sampleProduct]);
    getTenantById.mockResolvedValue({
      id: TEST_TENANT_ID,
      stripeConnectedAccountId: null,
    });

    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.checkout.orderStatus({
      sessionId: "cs_test_new",
    });

    expect(sessionsRetrieve).not.toHaveBeenCalled();
    expect(result?.status).toBe("pending");
  });
});

describe("checkout.listOrders", () => {
  it("requires an admin", async () => {
    const caller = appRouter.createCaller(makeCtx("user"));
    await expect(caller.checkout.listOrders()).rejects.toThrow();
    expect(getPaidOrders).not.toHaveBeenCalled();
  });

  it("returns paid orders with resolved product names, newest-first as given", async () => {
    getPaidOrders.mockResolvedValue([
      {
        id: 42,
        tenantId: TEST_TENANT_ID,
        status: "paid",
        amountTotal: 18500,
        currency: "chf",
        customerName: "Ada",
        customerEmail: "ada@example.com",
        paymentMethod: "card",
        productIds: "1, 2",
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);
    getProductsByIds.mockResolvedValue([
      { id: 1, name: "Silver Ring" },
      { id: 2, name: "Gold Band" },
    ]);

    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.checkout.listOrders();

    expect(getPaidOrders).toHaveBeenCalledWith(TEST_TENANT_ID, 100);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(42);
    expect(result[0].items).toEqual([
      { id: 1, name: "Silver Ring" },
      { id: 2, name: "Gold Band" },
    ]);
  });

  it("falls back to #id for a product that no longer exists", async () => {
    getPaidOrders.mockResolvedValue([
      {
        id: 7,
        tenantId: TEST_TENANT_ID,
        status: "paid",
        amountTotal: 5000,
        currency: "chf",
        customerName: null,
        customerEmail: null,
        paymentMethod: "twint",
        productIds: "99",
        createdAt: new Date(),
      },
    ]);
    getProductsByIds.mockResolvedValue([]);

    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.checkout.listOrders();
    expect(result[0].items).toEqual([{ id: 99, name: "#99" }]);
  });

  it("skips the product lookup entirely when there are no orders", async () => {
    getPaidOrders.mockResolvedValue([]);
    const caller = appRouter.createCaller(makeCtx("admin"));
    const result = await caller.checkout.listOrders();
    expect(result).toEqual([]);
    expect(getProductsByIds).not.toHaveBeenCalled();
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
