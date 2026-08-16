import { describe, expect, it, vi, beforeEach } from "vitest";

// The real sale-resolution and order-writing code in ./pos runs here on
// purpose — the point of the web till is that it prices a cart identically to
// the native apps, and mocking that away would test nothing worth testing.
// Only the database and Stripe are faked.
const getPosOrderById = vi.fn();
const markProductsSold = vi.fn();
const getTenantSettings = vi.fn();
const getDb = vi.fn();

vi.mock("./db", () => ({
  getDb: (...args: unknown[]) => getDb(...args),
  getPosOrderById: (...args: unknown[]) => getPosOrderById(...args),
  markProductsSold: (...args: unknown[]) => markProductsSold(...args),
  getTenantSettings: (...args: unknown[]) => getTenantSettings(...args),
}));

const getStripe = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: () => getStripe(),
  isStripeConfigured: vi.fn().mockReturnValue(true),
}));

import {
  createTillCheckoutSession,
  getTillOrderStatus,
  recordTillAttestedSale,
} from "./posTill";

const TENANT_ID = 7;
const CONNECTED = "acct_connected";
const TENANT = { tenantId: TENANT_ID, stripeConnectedAccountId: CONNECTED };

function makeFakeDb(
  productRows: Array<{
    id: number;
    price: string;
    name?: string;
    visible?: boolean;
    sold?: boolean;
    quantity?: number;
  }>,
) {
  const rows = productRows.map((p) => ({
    name: `Product ${p.id}`,
    visible: true,
    sold: false,
    quantity: 1,
    reservedUntil: null,
    ...p,
  }));

  const insertValues = vi.fn().mockResolvedValue({ insertId: 77 });

  return {
    insertValues,
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(rows)) })),
      })),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      })),
    },
  };
}

function makeFakeStripe(
  session: Record<string, unknown> = {
    id: "cs_test_123",
    url: "https://checkout.stripe.com/c/pay/cs_test_123",
  },
) {
  const create = vi.fn().mockResolvedValue(session);
  const retrieve = vi.fn().mockResolvedValue(session);
  return {
    create,
    retrieve,
    stripe: { checkout: { sessions: { create, retrieve } } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getTenantSettings.mockResolvedValue({ currency: "chf" });
});

describe("createTillCheckoutSession", () => {
  it("prices the cart, opens a session, and records a PENDING order", async () => {
    const { db, insertValues } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);
    const { create, stripe } = makeFakeStripe();
    getStripe.mockReturnValue(stripe);

    const result = await createTillCheckoutSession(TENANT, { productIds: [1] });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.totalRappen).toBe(4500);

    // The order must NOT be paid yet — nobody has scanned anything.
    const orderInsert = insertValues.mock.calls[0][0];
    expect(orderInsert.status).toBe("pending");
    expect(orderInsert.paymentMethod).toBe("card");
    expect(orderInsert.tenantId).toBe(TENANT_ID);
    expect(orderInsert.stripeCheckoutSessionId).toBe("cs_test_123");
    // A Checkout Session has no PaymentIntent until the customer pays, so
    // there is nothing truthful to put here yet.
    expect(orderInsert.stripePaymentIntentId).toBeNull();
    expect(markProductsSold).not.toHaveBeenCalled();

    const params = create.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.line_items[0].price_data.unit_amount).toBe(4500);
    // The customer sees what they are buying, not just a number.
    expect(params.line_items[0].price_data.product_data.name).toBe("Product 1");
  });

  it("creates the sale ON the merchant's connected account", async () => {
    // Otherwise the money lands with the platform instead of the shop.
    const { db } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);
    const { create, stripe } = makeFakeStripe();
    getStripe.mockReturnValue(stripe);

    await createTillCheckoutSession(TENANT, { productIds: [1] });

    expect(create.mock.calls[0][1]).toEqual({ stripeAccount: CONNECTED });
  });

  it("falls back to the platform account when the store has not connected one", async () => {
    const { db } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);
    const { create, stripe } = makeFakeStripe();
    getStripe.mockReturnValue(stripe);

    await createTillCheckoutSession(
      { tenantId: TENANT_ID, stripeConnectedAccountId: null },
      { productIds: [1] },
    );

    expect(create.mock.calls[0][1]).toBeUndefined();
  });

  it("charges in the store's own currency", async () => {
    getTenantSettings.mockResolvedValue({ currency: "EUR" });
    const { db } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);
    const { create, stripe } = makeFakeStripe();
    getStripe.mockReturnValue(stripe);

    await createTillCheckoutSession(TENANT, { productIds: [1] });

    expect(create.mock.calls[0][0].line_items[0].price_data.currency).toBe(
      "eur",
    );
  });

  it("charges a bargained price rather than the list price", async () => {
    const { db } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);
    const { create, stripe } = makeFakeStripe();
    getStripe.mockReturnValue(stripe);

    const result = await createTillCheckoutSession(TENANT, {
      productIds: [1],
      priceOverrides: { "1": 4000 },
    });

    expect(result.ok && result.totalRappen).toBe(4000);
    expect(create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(
      4000,
    );
  });

  it("expires the code within the hour so a photographed QR goes stale", async () => {
    const { db } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);
    const { create, stripe } = makeFakeStripe();
    getStripe.mockReturnValue(stripe);

    const now = new Date("2026-08-16T12:00:00Z");
    await createTillCheckoutSession(TENANT, { productIds: [1] }, now);

    expect(create.mock.calls[0][0].expires_at).toBe(
      Math.floor(now.getTime() / 1000) + 30 * 60,
    );
  });

  it("refuses a stale cart instead of charging for an unavailable piece", async () => {
    const { db } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);
    const { create, stripe } = makeFakeStripe();
    getStripe.mockReturnValue(stripe);

    const result = await createTillCheckoutSession(TENANT, {
      productIds: [1, 2],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses to open a session for a zero total", async () => {
    const { db } = makeFakeDb([{ id: 1, price: "0.00" }]);
    getDb.mockResolvedValue(db);
    const { create, stripe } = makeFakeStripe();
    getStripe.mockReturnValue(stripe);

    const result = await createTillCheckoutSession(TENANT, { productIds: [1] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("reports a session that came back with no URL rather than a blank QR", async () => {
    const { db } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);
    const { stripe } = makeFakeStripe({ id: "cs_test_123", url: null });
    getStripe.mockReturnValue(stripe);

    const result = await createTillCheckoutSession(TENANT, { productIds: [1] });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(502);
  });
});

describe("recordTillAttestedSale", () => {
  it("records a TWINT-QR sale as PAID and decrements this store's stock", async () => {
    // Nothing can confirm this sale asynchronously — Stripe never sees it —
    // so the merchant's word settles it, exactly as for cash.
    const { db, insertValues } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);

    const result = await recordTillAttestedSale(TENANT, "twint_qr", {
      productIds: [1],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const orderInsert = insertValues.mock.calls[0][0];
    expect(orderInsert.status).toBe("paid");
    // Never collapsed into "twint": one is a gateway's proof, the other a
    // claim, and they reconcile against different statements.
    expect(orderInsert.paymentMethod).toBe("twint_qr");
    expect(orderInsert.stripePaymentIntentId).toBeNull();
    expect(markProductsSold).toHaveBeenCalledWith(TENANT_ID, [1]);
  });

  it("records cash the same way", async () => {
    const { db, insertValues } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);

    await recordTillAttestedSale(TENANT, "cash", { productIds: [1] });

    expect(insertValues.mock.calls[0][0].paymentMethod).toBe("cash");
    expect(insertValues.mock.calls[0][0].status).toBe("paid");
  });

  it("never touches Stripe", async () => {
    const { db } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);

    // The whole point of the button: no Stripe leg, so no Stripe fee.
    const result = await recordTillAttestedSale(TENANT, "twint_qr", {
      productIds: [1],
    });

    expect(result.ok).toBe(true);
    expect(getStripe).not.toHaveBeenCalled();
  });

  it("refuses a stale cart and sells nothing", async () => {
    const { db } = makeFakeDb([{ id: 1, price: "45.00" }]);
    getDb.mockResolvedValue(db);

    const result = await recordTillAttestedSale(TENANT, "cash", {
      productIds: [1, 2],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(markProductsSold).not.toHaveBeenCalled();
  });
});

describe("getTillOrderStatus", () => {
  it("scopes the lookup to the caller's store", async () => {
    // Order ids are sequential across the whole platform, so an unscoped
    // lookup would let one merchant watch another's sale by counting.
    getPosOrderById.mockResolvedValue(null);
    await getTillOrderStatus(TENANT, 5);
    expect(getPosOrderById).toHaveBeenCalledWith(TENANT_ID, 5);
  });

  it("reports a paid order without asking Stripe again", async () => {
    getPosOrderById.mockResolvedValue({
      id: 5,
      status: "paid",
      totalRappen: 4500,
      paymentMethod: "card",
      stripeCheckoutSessionId: "cs_test_123",
    });
    const { retrieve, stripe } = makeFakeStripe();
    getStripe.mockReturnValue(stripe);

    const result = await getTillOrderStatus(TENANT, 5);

    expect(result.ok && result.status).toBe("paid");
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("fulfils on the spot when Stripe says the session is paid", async () => {
    // This is what makes the till work on a deployment where nobody enabled
    // checkout.session.completed on the webhook endpoint.
    const { db } = makeFakeDb([]);
    const results: unknown[][] = [
      [{ id: 5, tenantId: TENANT_ID, status: "pending" }],
      [{ productId: 1 }],
    ];
    const chain = () => {
      const rows = results.shift() ?? [];
      const promise = Promise.resolve(rows) as Promise<unknown[]> & {
        limit: () => Promise<unknown[]>;
      };
      promise.limit = () => Promise.resolve(rows);
      return promise;
    };
    db.select = vi.fn(() => ({
      from: vi.fn(() => ({ where: vi.fn(chain) })),
    })) as never;
    getDb.mockResolvedValue(db);
    getPosOrderById.mockResolvedValue({
      id: 5,
      tenantId: TENANT_ID,
      status: "pending",
      totalRappen: 4500,
      paymentMethod: "card",
      stripeCheckoutSessionId: "cs_test_123",
    });
    const { retrieve, stripe } = makeFakeStripe({
      id: "cs_test_123",
      payment_status: "paid",
      payment_intent: "pi_test_9",
    });
    getStripe.mockReturnValue(stripe);

    const result = await getTillOrderStatus(TENANT, 5);

    expect(result.ok && result.status).toBe("paid");
    expect(markProductsSold).toHaveBeenCalledWith(TENANT_ID, [1]);
    // Read from the account the session was created on, or Stripe 404s it.
    expect(retrieve.mock.calls[0][2]).toEqual({ stripeAccount: CONNECTED });
  });

  it("stays pending while the customer hasn't paid", async () => {
    getPosOrderById.mockResolvedValue({
      id: 5,
      tenantId: TENANT_ID,
      status: "pending",
      totalRappen: 4500,
      paymentMethod: "card",
      stripeCheckoutSessionId: "cs_test_123",
    });
    const { db } = makeFakeDb([]);
    getDb.mockResolvedValue(db);
    const { stripe } = makeFakeStripe({
      id: "cs_test_123",
      payment_status: "unpaid",
    });
    getStripe.mockReturnValue(stripe);

    const result = await getTillOrderStatus(TENANT, 5);
    expect(result.ok && result.status).toBe("pending");
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("keeps waiting when Stripe can't be reached, rather than failing the sale", async () => {
    getPosOrderById.mockResolvedValue({
      id: 5,
      tenantId: TENANT_ID,
      status: "pending",
      totalRappen: 4500,
      paymentMethod: "card",
      stripeCheckoutSessionId: "cs_test_123",
    });
    const { db } = makeFakeDb([]);
    getDb.mockResolvedValue(db);
    getStripe.mockReturnValue({
      checkout: {
        sessions: { retrieve: vi.fn().mockRejectedValue(new Error("network")) },
      },
    });

    const result = await getTillOrderStatus(TENANT, 5);
    expect(result.ok && result.status).toBe("pending");
  });

  it("404s for an order that doesn't exist in this store", async () => {
    getPosOrderById.mockResolvedValue(null);
    const result = await getTillOrderStatus(TENANT, 999);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(404);
  });
});
