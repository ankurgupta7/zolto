import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// The categories endpoint doesn't touch the DB or Stripe, but registerPosRoutes
// imports both, so mock them to keep this a pure unit test of the route.
// POS auth is now tenant-based: requirePosKey resolves the tenant that owns the
// X-POS-Key via getTenantByPosApiKey. Mock it key-aware so "test-pos-key" maps to
// a tenant and anything else is rejected — this drives auth for every test below.
const TEST_TENANT = { id: 1, slug: "test-store", posApiKey: "test-pos-key" };
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getAllProducts: vi.fn().mockResolvedValue([]),
  updateProduct: vi.fn(),
  markProductsSold: vi.fn(),
  getTenantByPosApiKey: vi.fn(async (key: string) =>
    key === "test-pos-key" ? TEST_TENANT : undefined
  ),
}));

vi.mock("./stripe", () => ({
  getStripe: vi.fn().mockReturnValue(null),
  isStripeConfigured: vi.fn().mockReturnValue(false),
}));

import { registerPosRoutes } from "./pos";
import { getDb, markProductsSold } from "./db";
import { getStripe, isStripeConfigured } from "./stripe";
import { PRODUCT_CATEGORIES, CATEGORY_EXTRA_INCLUDES } from "../shared/const";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerPosRoutes(app);
  return app;
}

function makeFakeDb(
  productRows: Array<{
    id: number;
    price: string;
    visible?: boolean;
    sold?: boolean;
    quantity?: number;
  }>
) {
  const rows = productRows.map(p => ({
    visible: true,
    sold: false,
    quantity: 1,
    ...p,
  }));
  // Shared across every insert() call so tests can inspect exactly what was
  // written to pos_orders and pos_order_items (in that call order).
  const insertValuesSpy = vi.fn().mockResolvedValue({ insertId: 99 });
  return {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve(rows)),
      })),
    })),
    insert: vi.fn(() => ({
      values: insertValuesSpy,
    })),
    // createPosOrder calls db.update() to set the invoice number (KPOS-{id})
    // after the initial insert. Mock it so tests that reach createPosOrder
    // don't crash with "db.update is not a function".
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn().mockResolvedValue(undefined),
      })),
    })),
    insertValuesSpy,
  };
}

function makeFakeStripe() {
  return {
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_123" }) },
    paymentIntents: {
      create: vi
        .fn()
        .mockResolvedValue({ id: "pi_123", client_secret: "secret_123" }),
    },
  };
}

describe("GET /api/pos/categories", () => {
  const OLD_KEY = process.env.POS_API_KEY;

  beforeEach(() => {
    process.env.POS_API_KEY = "test-pos-key";
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.POS_API_KEY;
    else process.env.POS_API_KEY = OLD_KEY;
  });

  it("rejects requests without the POS key", async () => {
    const res = await request(makeApp()).get("/api/pos/categories");
    expect(res.status).toBe(401);
  });

  it("returns the canonical category list from the shared source of truth", async () => {
    const res = await request(makeApp())
      .get("/api/pos/categories")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    // Must equal PRODUCT_CATEGORIES exactly, in order — this is what guarantees
    // the POS apps show the same categories, in the same order, as the website.
    expect(res.body.categories).toEqual([...PRODUCT_CATEGORIES]);
    expect(res.body.extraIncludes).toEqual(CATEGORY_EXTRA_INCLUDES);
  });

  it("only folds real categories into real categories", () => {
    // Guards against a typo in CATEGORY_EXTRA_INCLUDES leaking to the apps.
    for (const [cat, extras] of Object.entries(CATEGORY_EXTRA_INCLUDES)) {
      expect(PRODUCT_CATEGORIES).toContain(cat);
      for (const extra of extras) expect(PRODUCT_CATEGORIES).toContain(extra);
    }
  });
});

describe("GET /api/pos/config", () => {
  const OLD_KEY = process.env.POS_API_KEY;
  const OLD_LOCATION = process.env.STRIPE_LOCATION_ID;

  beforeEach(() => {
    process.env.POS_API_KEY = "test-pos-key";
    delete process.env.STRIPE_LOCATION_ID;
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.POS_API_KEY;
    else process.env.POS_API_KEY = OLD_KEY;
    if (OLD_LOCATION === undefined) delete process.env.STRIPE_LOCATION_ID;
    else process.env.STRIPE_LOCATION_ID = OLD_LOCATION;
  });

  it("rejects requests without the POS key", async () => {
    const res = await request(makeApp()).get("/api/pos/config");
    expect(res.status).toBe(401);
  });

  it("returns the configured Terminal location id", async () => {
    process.env.STRIPE_LOCATION_ID = "tml_test_123";

    const res = await request(makeApp())
      .get("/api/pos/config")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body.locationId).toBe("tml_test_123");
  });

  it("returns an empty location id when STRIPE_LOCATION_ID is not set", async () => {
    const res = await request(makeApp())
      .get("/api/pos/config")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body.locationId).toBe("");
  });
});

describe("GET /api/pos/health", () => {
  const OLD_KEY = process.env.POS_API_KEY;

  beforeEach(() => {
    process.env.POS_API_KEY = "test-pos-key";
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.POS_API_KEY;
    else process.env.POS_API_KEY = OLD_KEY;
    vi.mocked(isStripeConfigured).mockReset().mockReturnValue(false);
  });

  it("rejects requests without the POS key", async () => {
    const res = await request(makeApp()).get("/api/pos/health");
    expect(res.status).toBe(401);
  });

  it("returns 200 OK when Stripe is configured", async () => {
    vi.mocked(isStripeConfigured).mockReturnValue(true);

    const res = await request(makeApp())
      .get("/api/pos/health")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, stripe: true });
  });

  it("returns 503 when Stripe is not configured", async () => {
    vi.mocked(isStripeConfigured).mockReturnValue(false);

    const res = await request(makeApp())
      .get("/api/pos/health")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(503);
    expect(res.body).toEqual({ ok: false, error: "Stripe not configured" });
  });
});

describe("GET /api/pos/products", () => {
  const OLD_KEY = process.env.POS_API_KEY;

  beforeEach(() => {
    process.env.POS_API_KEY = "test-pos-key";
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.POS_API_KEY;
    else process.env.POS_API_KEY = OLD_KEY;
    vi.mocked(getDb).mockReset().mockResolvedValue(null);
  });

  function makeSpyDb(rows: unknown[]) {
    const whereSpy = vi.fn(() => Promise.resolve(rows));
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({ where: whereSpy })),
      })),
    };
    return { db, whereSpy };
  }

  // The real drizzle table object is circularly-referenced (column -> table
  // -> columns -> column), so JSON.stringify can't walk it. Recursively hunt
  // for a referenced column name instead, tracking visited nodes to avoid
  // looping forever on that circularity.
  function conditionReferencesColumn(
    node: unknown,
    columnName: string
  ): boolean {
    const seen = new Set<unknown>();
    function walk(value: unknown): boolean {
      if (!value || typeof value !== "object" || seen.has(value)) return false;
      seen.add(value);
      const obj = value as Record<string, unknown>;
      if (obj.name === columnName) return true;
      // Skip "table" backreferences: a column's `.table` links back to every
      // sibling column, which would make any single referenced column look
      // like it "reaches" every other column in the table.
      return Object.entries(obj).some(
        ([key, val]) => key !== "table" && walk(val)
      );
    }
    return walk(node);
  }

  it("queries only visible products by default (no includeHidden param)", async () => {
    const { db, whereSpy } = makeSpyDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .get("/api/pos/products")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(
      conditionReferencesColumn(whereSpy.mock.calls[0][0], "visible")
    ).toBe(true);
  });

  it("drops the visible requirement when includeHidden=true, so the cashier's 'Show Hidden Items' toggle surfaces hidden products (sold/out-of-stock still excluded)", async () => {
    const { db, whereSpy } = makeSpyDb([
      { id: 1, price: "50.00", visible: false },
    ]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .get("/api/pos/products?includeHidden=true")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(
      conditionReferencesColumn(whereSpy.mock.calls[0][0], "visible")
    ).toBe(false);
    expect(conditionReferencesColumn(whereSpy.mock.calls[0][0], "sold")).toBe(
      true
    );
  });
});

describe("POST /api/pos/payment-intent", () => {
  const OLD_KEY = process.env.POS_API_KEY;

  beforeEach(() => {
    process.env.POS_API_KEY = "test-pos-key";
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.POS_API_KEY;
    else process.env.POS_API_KEY = OLD_KEY;
    vi.mocked(getDb).mockReset().mockResolvedValue(null);
    vi.mocked(getStripe).mockReset().mockReturnValue(null);
  });

  it("rejects when a requested product id no longer resolves to a row (e.g. stale POS cache after a catalogue re-import)", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([{ id: 1, price: "50.00" }]) as never
    );
    vi.mocked(getStripe).mockReturnValueOnce(makeFakeStripe() as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1, 2] });

    expect(res.status).toBe(409);
  });

  it("rejects when a resolved product exists but is hidden, sold, or out of stock (e.g. a stale POS cart that still holds a since-hidden or deleted duplicate)", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([{ id: 1, price: "50.00", visible: false }]) as never
    );
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1] });

    expect(res.status).toBe(409);
    expect(fakeStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("allows a hidden product through when allowHidden is true (cashier had 'Show Hidden Items' on when building this sale)", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([{ id: 1, price: "50.00", visible: false }]) as never
    );
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], allowHidden: true });

    expect(res.status).toBe(200);
    expect(res.body.totalRappen).toBe(5000);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000 })
    );
  });

  it("still rejects a sold or out-of-stock product even when allowHidden is true", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([
        { id: 1, price: "50.00", visible: false, sold: true },
      ]) as never
    );
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], allowHidden: true });

    expect(res.status).toBe(409);
    expect(fakeStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("refuses to create a payment intent when the computed total is CHF 0.00", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([{ id: 1, price: "0.00" }]) as never
    );
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1] });

    expect(res.status).toBe(422);
    expect(fakeStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("creates a payment intent for the correct non-zero total when all products resolve", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([
        { id: 1, price: "50.00" },
        { id: 2, price: "25.50" },
      ]) as never
    );
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1, 2] });

    expect(res.status).toBe(200);
    expect(res.body.totalRappen).toBe(7550);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 7550 })
    );
  });
});

describe("POST /api/pos/payment-intent — bargained price overrides and custom items", () => {
  const OLD_KEY = process.env.POS_API_KEY;

  beforeEach(() => {
    process.env.POS_API_KEY = "test-pos-key";
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.POS_API_KEY;
    else process.env.POS_API_KEY = OLD_KEY;
    vi.mocked(getDb).mockReset().mockResolvedValue(null);
    vi.mocked(getStripe).mockReset().mockReturnValue(null);
  });

  it("charges the cashier's bargained override instead of list price, and records it on the line item", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], priceOverrides: { "1": 3500 } });

    expect(res.status).toBe(200);
    expect(res.body.totalRappen).toBe(3500);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 3500 })
    );
    // Second insert() call is pos_order_items.
    expect(db.insertValuesSpy).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ productId: 1, priceRappen: 3500, name: null }),
    ]);
  });

  it("sells a custom (non-inventory) item alongside catalogue products", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({
        productIds: [1],
        customItems: [{ name: "Custom repair", priceRappen: 1000 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.totalRappen).toBe(6000);
    expect(db.insertValuesSpy).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ productId: 1, priceRappen: 5000, name: null }),
      expect.objectContaining({ productId: null, priceRappen: 1000, name: "Custom repair" }),
    ]);
  });

  it("allows a sale made entirely of custom items, with no catalogue products at all", async () => {
    const db = makeFakeDb([]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ customItems: [{ name: "Custom bracelet", priceRappen: 4200 }] });

    expect(res.status).toBe(200);
    expect(res.body.totalRappen).toBe(4200);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4200 })
    );
  });

  it("rejects when neither productIds nor customItems are provided", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(makeFakeDb([]) as never);
    vi.mocked(getStripe).mockReturnValueOnce(makeFakeStripe() as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({});

    expect(res.status).toBe(400);
  });

  it("rejects a custom item with a blank name", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(makeFakeDb([]) as never);
    vi.mocked(getStripe).mockReturnValueOnce(makeFakeStripe() as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ customItems: [{ name: "   ", priceRappen: 1000 }] });

    expect(res.status).toBe(400);
  });

  it("rejects a custom item with a negative or non-integer price", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(makeFakeDb([]) as never);
    vi.mocked(getStripe).mockReturnValueOnce(makeFakeStripe() as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ customItems: [{ name: "Repair", priceRappen: -5 }] });

    expect(res.status).toBe(400);
  });

  it("rejects a priceOverrides entry with a negative or non-integer amount", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], priceOverrides: { "1": 12.5 } });

    expect(res.status).toBe(400);
    expect(fakeStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("still refuses a CHF 0.00 total when overrides/custom items zero everything out", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], priceOverrides: { "1": 0 } });

    expect(res.status).toBe(422);
    expect(fakeStripe.paymentIntents.create).not.toHaveBeenCalled();
  });
});

describe("fulfillment via POST /api/pos/sale", () => {
  const OLD_KEY = process.env.POS_API_KEY;

  function makeFulfillFakeDb(
    orderRow: { id: number; status: string } | undefined,
    itemRows: Array<{ posOrderId: number; productId: number | null; priceRappen: number; name: string | null }>
  ) {
    const updateWhereSpy = vi.fn().mockResolvedValue(undefined);
    let selectCallCount = 0;
    const db = {
      select: vi.fn(() => {
        selectCallCount++;
        if (selectCallCount === 1) {
          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve(orderRow ? [orderRow] : [])),
              })),
            })),
          };
        }
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve(itemRows)),
          })),
        };
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: updateWhereSpy,
        })),
      })),
    };
    return { db, updateWhereSpy };
  }

  beforeEach(() => {
    process.env.POS_API_KEY = "test-pos-key";
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.POS_API_KEY;
    else process.env.POS_API_KEY = OLD_KEY;
    vi.mocked(getDb).mockReset().mockResolvedValue(null);
    vi.mocked(getStripe).mockReset().mockReturnValue(null);
    vi.mocked(markProductsSold).mockClear();
  });

  it("marks stock sold using the productIds recorded on pos_order_items, not Stripe metadata (custom items are skipped since they have no product row)", async () => {
    const { db, updateWhereSpy } = makeFulfillFakeDb({ id: 7, status: "pending", tenantId: 1 }, [
      { posOrderId: 7, productId: 1, priceRappen: 3000, name: null },
      { posOrderId: 7, productId: null, priceRappen: 1500, name: "Custom repair fee" },
    ]);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const fakeStripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({ id: "pi_1", status: "succeeded" }),
      },
    };
    vi.mocked(getStripe).mockReturnValue(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/sale")
      .set("x-pos-key", "test-pos-key")
      .send({ paymentIntentId: "pi_1" });

    expect(res.status).toBe(200);
    // success:true with a non-optional bool is what the iOS SaleResponse model
    // requires to decode at all — { ok: true } (the old shape) would throw a
    // decoding error client-side and report a successful charge as "Payment
    // Failed" to the cashier.
    expect(res.body).toEqual({ success: true, posOrderId: 7, alreadyFulfilled: false });
    expect(markProductsSold).toHaveBeenCalledWith(1, [1]);
    expect(updateWhereSpy).toHaveBeenCalled();
  });

  it("is a no-op for an order that's already marked paid, and reports alreadyFulfilled", async () => {
    const { db } = makeFulfillFakeDb({ id: 7, status: "paid" }, []);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const fakeStripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({ id: "pi_1", status: "succeeded" }),
      },
    };
    vi.mocked(getStripe).mockReturnValue(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/sale")
      .set("x-pos-key", "test-pos-key")
      .send({ paymentIntentId: "pi_1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, posOrderId: 7, alreadyFulfilled: true });
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("returns 404 when no pos_order matches the PaymentIntent", async () => {
    const { db } = makeFulfillFakeDb(undefined, []);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const fakeStripe = {
      paymentIntents: {
        retrieve: vi.fn().mockResolvedValue({ id: "pi_unknown", status: "succeeded" }),
      },
    };
    vi.mocked(getStripe).mockReturnValue(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/sale")
      .set("x-pos-key", "test-pos-key")
      .send({ paymentIntentId: "pi_unknown" });

    expect(res.status).toBe(404);
  });
});

describe("POST /api/pos/manual-sale (cash)", () => {
  const OLD_KEY = process.env.POS_API_KEY;

  beforeEach(() => {
    process.env.POS_API_KEY = "test-pos-key";
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.POS_API_KEY;
    else process.env.POS_API_KEY = OLD_KEY;
    vi.mocked(getDb).mockReset().mockResolvedValue(null);
    vi.mocked(markProductsSold).mockClear();
  });

  it("records the sale as paid immediately, with no Stripe involvement", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .post("/api/pos/manual-sale")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, posOrderId: 99, totalRappen: 5000 });
    expect(db.insertValuesSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stripePaymentIntentId: null,
        status: "paid",
        paymentMethod: "cash",
        totalRappen: 5000,
      })
    );
    expect(markProductsSold).toHaveBeenCalledWith(1, [1]);
  });

  it("honors a bargained price override and a custom item, same as payment-intent", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .post("/api/pos/manual-sale")
      .set("x-pos-key", "test-pos-key")
      .send({
        productIds: [1],
        priceOverrides: { "1": 3500 },
        customItems: [{ name: "Custom repair", priceRappen: 1000 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.totalRappen).toBe(4500);
    expect(db.insertValuesSpy).toHaveBeenNthCalledWith(2, [
      expect.objectContaining({ productId: 1, priceRappen: 3500, name: null }),
      expect.objectContaining({ productId: null, priceRappen: 1000, name: "Custom repair" }),
    ]);
  });

  it("rejects when a product is no longer available, same validation as payment-intent", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00", sold: true }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .post("/api/pos/manual-sale")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1] });

    expect(res.status).toBe(409);
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("rejects a CHF 0.00 total", async () => {
    const db = makeFakeDb([{ id: 1, price: "0.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .post("/api/pos/manual-sale")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1] });

    expect(res.status).toBe(422);
  });

  it("rejects requests without the POS key", async () => {
    const res = await request(makeApp()).post("/api/pos/manual-sale").send({ productIds: [1] });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/pos/twint-intent", () => {
  const OLD_KEY = process.env.POS_API_KEY;

  function makeFakeTwintStripe(nextAction: unknown = { redirect_to_url: { url: "https://hooks.stripe.com/twint/pi_1" } }) {
    return {
      customers: { create: vi.fn().mockResolvedValue({ id: "cus_123" }) },
      paymentIntents: {
        create: vi.fn().mockResolvedValue({
          id: "pi_twint_1",
          next_action: nextAction,
        }),
      },
    };
  }

  beforeEach(() => {
    process.env.POS_API_KEY = "test-pos-key";
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.POS_API_KEY;
    else process.env.POS_API_KEY = OLD_KEY;
    vi.mocked(getDb).mockReset().mockResolvedValue(null);
    vi.mocked(getStripe).mockReset().mockReturnValue(null);
  });

  it("creates a confirmed twint PaymentIntent and returns its redirect URL", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeTwintStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/twint-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], customerPhone: "0791234567" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      redirectUrl: "https://hooks.stripe.com/twint/pi_1",
      paymentIntentId: "pi_twint_1",
      posOrderId: 99,
      totalRappen: 5000,
    });
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        payment_method_types: ["twint"],
        confirm: true,
      })
    );
    expect(db.insertValuesSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ paymentMethod: "twint", status: "pending", stripePaymentIntentId: "pi_twint_1" })
    );
  });

  it("honors bargained price overrides and custom items", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeTwintStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/twint-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], priceOverrides: { "1": 3000 }, customerPhone: "0791234567" });

    expect(res.status).toBe(200);
    expect(res.body.totalRappen).toBe(3000);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 3000 })
    );
  });

  it("returns 502 if Stripe doesn't hand back a redirect URL", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeTwintStripe(null);
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/twint-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], customerPhone: "0791234567" });

    expect(res.status).toBe(502);
  });

  it("rejects when the computed total is CHF 0.00, without calling Stripe", async () => {
    const db = makeFakeDb([{ id: 1, price: "0.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeTwintStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/twint-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1] });

    expect(res.status).toBe(422);
    expect(fakeStripe.paymentIntents.create).not.toHaveBeenCalled();
  });

  it("rejects requests without the POS key", async () => {
    const res = await request(makeApp()).post("/api/pos/twint-intent").send({ productIds: [1] });
    expect(res.status).toBe(401);
  });
});
