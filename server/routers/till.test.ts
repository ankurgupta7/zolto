import { describe, expect, it, vi, beforeEach } from "vitest";

// The sale logic itself is covered in server/posTill.test.ts. This file is
// about the layer above it: who may reach a store's till at all, what the
// router does with the shared layer's answers, and what it exposes.
const createTillCheckoutSession = vi.fn();
const recordTillAttestedSale = vi.fn();
const getTillOrderStatus = vi.fn();

vi.mock("../posTill", () => ({
  createTillCheckoutSession: (...args: unknown[]) =>
    createTillCheckoutSession(...args),
  recordTillAttestedSale: (...args: unknown[]) =>
    recordTillAttestedSale(...args),
  getTillOrderStatus: (...args: unknown[]) => getTillOrderStatus(...args),
  TILL_ATTESTED_METHODS: ["cash", "twint_qr"],
}));

const getAllProducts = vi.fn();
const getTenantSettings = vi.fn();

vi.mock("../db", () => ({
  getAllProducts: (...args: unknown[]) => getAllProducts(...args),
  getTenantSettings: (...args: unknown[]) => getTenantSettings(...args),
}));

import { tillRouter } from "./till";
import type { TrpcContext } from "../_core/context";

const TENANT_ID = 7;
const OTHER_TENANT_ID = 8;
const CONNECTED = "acct_connected";

function ctx(
  opts: {
    role?: "staff" | "admin" | "superadmin";
    userTenantId?: number;
    tenant?: number | null;
    connected?: string | null;
  } = {},
): TrpcContext {
  const {
    role,
    userTenantId = TENANT_ID,
    tenant = TENANT_ID,
    connected = CONNECTED,
  } = opts;
  return {
    user: role ? ({ id: 1, tenantId: userTenantId, role } as never) : null,
    tenant:
      tenant === null
        ? null
        : ({
            id: tenant,
            slug: "shop",
            stripeConnectedAccountId: connected,
          } as never),
    req: { ip: "203.0.113.9" } as never,
    res: {} as never,
  };
}

function makeProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    tenantId: TENANT_ID,
    name: "Silberne Ohrringe",
    nameEn: "Silver Earrings",
    price: "45.00",
    category: "Earrings",
    imageUrl: null,
    visible: true,
    sold: false,
    quantity: 1,
    ...overrides,
  };
}

const CART = { productIds: [1] };

beforeEach(() => {
  vi.clearAllMocks();
  getAllProducts.mockResolvedValue([makeProduct()]);
  getTenantSettings.mockResolvedValue({ currency: "chf", twintQrUrl: null });
});

// The till sells inventory and takes money. Every procedure has to refuse an
// anonymous caller, a non-admin, and — the one that silently regresses — an
// admin of a different store pointing at this one's host.
describe("authorisation", () => {
  it("refuses an anonymous caller on every procedure", async () => {
    const caller = tillRouter.createCaller(ctx());
    await expect(caller.products({})).rejects.toThrow();
    await expect(caller.startCardPayment(CART)).rejects.toThrow();
    await expect(
      caller.recordAttestedSale({ ...CART, method: "cash" }),
    ).rejects.toThrow();
    await expect(caller.orderStatus({ posOrderId: 1 })).rejects.toThrow();
  });

  it("refuses a signed-in staff member who is not an admin", async () => {
    const caller = tillRouter.createCaller(ctx({ role: "staff" }));
    await expect(caller.products({})).rejects.toThrow();
    await expect(
      caller.recordAttestedSale({ ...CART, method: "twint_qr" }),
    ).rejects.toThrow();
  });

  it("refuses an admin of a DIFFERENT store addressing this one", async () => {
    // ctx.tenant comes from the request host, so without the belongs-to-this-
    // tenant check an admin of store A could sell store B's stock by pointing
    // at B's subdomain.
    const caller = tillRouter.createCaller(
      ctx({ role: "admin", userTenantId: OTHER_TENANT_ID, tenant: TENANT_ID }),
    );

    await expect(caller.products({})).rejects.toThrow();
    await expect(caller.startCardPayment(CART)).rejects.toThrow();
    await expect(
      caller.recordAttestedSale({ ...CART, method: "cash" }),
    ).rejects.toThrow();
    await expect(caller.orderStatus({ posOrderId: 1 })).rejects.toThrow();

    // And nothing was sold or charged on the way to being refused.
    expect(recordTillAttestedSale).not.toHaveBeenCalled();
    expect(createTillCheckoutSession).not.toHaveBeenCalled();
  });

  it("refuses when no store can be resolved from the host", async () => {
    const caller = tillRouter.createCaller(ctx({ role: "admin", tenant: null }));
    await expect(caller.products({})).rejects.toThrow();
  });
});

describe("till.products", () => {
  it("prices in minor units and reports the store's own currency", async () => {
    getTenantSettings.mockResolvedValue({ currency: "eur", twintQrUrl: null });
    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    const result = await caller.products({});

    expect(result.products[0].priceRappen).toBe(4500);
    expect(result.currency).toBe("EUR");
  });

  it("reads only this store's catalogue", async () => {
    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    await caller.products({});
    expect(getAllProducts).toHaveBeenCalledWith(TENANT_ID);
  });

  it("passes the TWINT sticker through so the till can offer that button", async () => {
    getTenantSettings.mockResolvedValue({
      currency: "chf",
      twintQrUrl: "https://cdn.example.com/twint.png",
    });
    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    expect((await caller.products({})).twintQrUrl).toContain("twint.png");
  });

  it("hides hidden products unless the cashier asked for them", async () => {
    getAllProducts.mockResolvedValue([
      makeProduct({ id: 1 }),
      makeProduct({ id: 2, visible: false }),
    ]);
    const caller = tillRouter.createCaller(ctx({ role: "admin" }));

    expect((await caller.products({})).products.map((p) => p.id)).toEqual([1]);
    expect(
      (await caller.products({ includeHidden: true })).products.map(
        (p) => p.id,
      ),
    ).toEqual([1, 2]);
  });

  it("never lists sold or out-of-stock pieces, even with includeHidden", async () => {
    getAllProducts.mockResolvedValue([
      makeProduct({ id: 1, sold: true }),
      makeProduct({ id: 2, quantity: 0 }),
    ]);
    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    expect((await caller.products({ includeHidden: true })).products).toEqual(
      [],
    );
  });
});

describe("till.startCardPayment", () => {
  it("returns a rendered QR alongside the payment URL", async () => {
    createTillCheckoutSession.mockResolvedValue({
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
      checkoutSessionId: "cs_test_1",
      posOrderId: 7,
      totalRappen: 4500,
    });

    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    const result = await caller.startCardPayment(CART);

    expect(result.posOrderId).toBe(7);
    // Rendered server-side so the page needs no QR library of its own.
    expect(result.qrDataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("charges on the store's own connected account", async () => {
    createTillCheckoutSession.mockResolvedValue({
      ok: true,
      url: "https://checkout.stripe.com/c/pay/cs_test_1",
      checkoutSessionId: "cs_test_1",
      posOrderId: 7,
      totalRappen: 4500,
    });

    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    await caller.startCardPayment(CART);

    expect(createTillCheckoutSession).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, stripeConnectedAccountId: CONNECTED },
      expect.objectContaining({ productIds: [1] }),
    );
  });

  it("surfaces a stale cart as a CONFLICT the cashier can act on", async () => {
    createTillCheckoutSession.mockResolvedValue({
      ok: false,
      status: 409,
      error: "One or more items are no longer available.",
    });

    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    await expect(caller.startCardPayment(CART)).rejects.toThrow(
      /no longer available/,
    );
  });
});

describe("till.recordAttestedSale", () => {
  it("passes the method through to the shared sale layer", async () => {
    recordTillAttestedSale.mockResolvedValue({
      ok: true,
      posOrderId: 8,
      totalRappen: 4500,
    });

    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    await caller.recordAttestedSale({ ...CART, method: "twint_qr" });

    expect(recordTillAttestedSale).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, stripeConnectedAccountId: CONNECTED },
      "twint_qr",
      expect.objectContaining({ productIds: [1] }),
    );
  });

  it("refuses to record a card sale on the client's say-so", async () => {
    // `card` has to be confirmed by Stripe. Accepting it here would let a
    // client mark stock sold for a payment that never happened.
    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    await expect(
      caller.recordAttestedSale({ ...CART, method: "card" as "cash" }),
    ).rejects.toThrow();
    expect(recordTillAttestedSale).not.toHaveBeenCalled();
  });

  it("forwards a bargained price map unchanged", async () => {
    recordTillAttestedSale.mockResolvedValue({
      ok: true,
      posOrderId: 9,
      totalRappen: 4000,
    });

    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    await caller.recordAttestedSale({
      productIds: [1],
      priceOverrides: { "1": 4000 },
      method: "cash",
    });

    expect(recordTillAttestedSale).toHaveBeenCalledWith(
      expect.anything(),
      "cash",
      expect.objectContaining({ priceOverrides: { "1": 4000 } }),
    );
  });
});

describe("till.orderStatus", () => {
  it("looks the order up within the caller's own store", async () => {
    getTillOrderStatus.mockResolvedValue({
      ok: true,
      posOrderId: 7,
      status: "paid",
      totalRappen: 4500,
      paymentMethod: "card",
    });

    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    expect((await caller.orderStatus({ posOrderId: 7 })).status).toBe("paid");
    expect(getTillOrderStatus).toHaveBeenCalledWith(
      { tenantId: TENANT_ID, stripeConnectedAccountId: CONNECTED },
      7,
    );
  });

  it("surfaces an unknown order as NOT_FOUND", async () => {
    getTillOrderStatus.mockResolvedValue({
      ok: false,
      status: 404,
      error: "Order not found",
    });
    const caller = tillRouter.createCaller(ctx({ role: "admin" }));
    await expect(caller.orderStatus({ posOrderId: 999 })).rejects.toThrow(
      /not found/i,
    );
  });
});
