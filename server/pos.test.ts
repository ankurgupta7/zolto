import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

// The categories endpoint doesn't touch the DB or Stripe, but registerPosRoutes
// imports both, so mock them to keep this a pure unit test of the route.
// POS auth is now tenant-based: requirePosKey resolves the tenant that owns the
// X-POS-Key via getTenantByPosApiKey. Mock it key-aware so "test-pos-key" maps to
// a tenant and anything else is rejected — this drives auth for every test below.
const TEST_TENANT = {
  id: 1,
  slug: "test-store",
  name: "Test Store",
  posApiKey: "test-pos-key",
};
// A tenant that linked their own Stripe account (Tap to Pay runs on it).
const CONNECTED_TENANT = {
  id: 2,
  slug: "connected-store",
  posApiKey: "connected-pos-key",
  stripeConnectedAccountId: "acct_connected",
  terminalLocationId: null as string | null,
};
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getAllProducts: vi.fn().mockResolvedValue([]),
  updateProduct: vi.fn(),
  markProductsSold: vi.fn(),
  getTenantSettings: vi.fn().mockResolvedValue(null),
  setTenantTerminalLocation: vi.fn().mockResolvedValue(undefined),
  getTenantCategories: vi.fn(async (tenantId: number) =>
    [
      { key: "Necklaces", de: "Halsketten", extra: ["Sets"] },
      { key: "Earrings", de: "Ohrringe", extra: ["Sets"] },
      { key: "Sets", de: "Sets" },
      { key: "Rings", de: "Ringe" },
      { key: "Bracelets", de: "Armbänder" },
      { key: "Bangles", de: "Armreifen" },
      { key: "Anklets", de: "Fussschmuck" },
      { key: "Brooches", de: "Broschen" },
      { key: "Hair Accessories", de: "Haarschmuck" },
      { key: "Other", de: "Sonstiges" },
    ].map((c, i) => ({
      id: i + 1,
      tenantId,
      key: c.key,
      labelEn: c.key,
      labelDe: c.de,
      extraIncludes: ("extra" in c ? c.extra : null) ?? null,
      sortOrder: i,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
  ),
  getTenantByPosApiKey: vi.fn(async (key: string) =>
    key === "test-pos-key"
      ? TEST_TENANT
      : key === "connected-pos-key"
        ? CONNECTED_TENANT
        : undefined,
  ),
}));

vi.mock("./stripe", () => ({
  getStripe: vi.fn().mockReturnValue(null),
  isStripeConfigured: vi.fn().mockReturnValue(false),
}));

// Pairing redemption is covered end-to-end in server/posPairing.test.ts; here it
// is mocked so these tests are about the ROUTE — status codes, the single shared
// error message, and the rate limit.
vi.mock("./posPairing", () => ({ redeemPairingToken: vi.fn() }));

// The pairing limiter's default store is the DB-backed one, and ./db is mocked
// to have no database. An in-memory store keeps the limit real in tests.
vi.mock("./rateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rateLimit")>();
  return {
    ...actual,
    createRateLimiter: (opts: { limit: number; windowMs: number }) =>
      actual.createRateLimiter({
        ...opts,
        store: actual.createInMemoryRateLimitStore(),
      }),
  };
});

import {
  registerPosRoutes,
  resetPosPairingRateLimits,
  buildPosSaleDescription,
} from "./pos";
import { getDb, markProductsSold } from "./db";
import { redeemPairingToken } from "./posPairing";
import { getStripe, isStripeConfigured } from "./stripe";

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
    name?: string;
    visible?: boolean;
    sold?: boolean;
    quantity?: number;
    reservedUntil?: Date | null;
  }>,
) {
  const rows = productRows.map((p) => ({
    name: `Product ${p.id}`,
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

function makeFakeTwintStripe(
  nextAction: unknown = {
    redirect_to_url: { url: "https://hooks.stripe.com/twint/pi_1" },
  },
) {
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

  it("serves the tenant's own categories in the pre-verticals payload shape", async () => {
    const res = await request(makeApp())
      .get("/api/pos/categories")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    // Android-compatibility tripwire: for a jewellery tenant, `categories`
    // and `extraIncludes` must be byte-identical to the payload the endpoint
    // served when the list was a global constant — same keys, same order,
    // same folding. `labels` is additive; old app versions ignore it.
    expect(res.body.categories).toEqual([
      "Necklaces",
      "Earrings",
      "Sets",
      "Rings",
      "Bracelets",
      "Bangles",
      "Anklets",
      "Brooches",
      "Hair Accessories",
      "Other",
    ]);
    expect(res.body.extraIncludes).toEqual({
      Necklaces: ["Sets"],
      Earrings: ["Sets"],
    });
    expect(res.body.labels.Necklaces).toEqual({
      en: "Necklaces",
      de: "Halsketten",
    });
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

  // The QR sticker's presence is what enables the POS's TWINT (QR) option, so
  // the app must be able to tell "uploaded" from "not uploaded" here.
  it("returns null twintQrUrl when the merchant hasn't uploaded a sticker", async () => {
    const res = await request(makeApp())
      .get("/api/pos/config")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body.twintQrUrl).toBeNull();
  });

  it("returns the merchant's TWINT QR sticker URL once uploaded", async () => {
    const { getTenantSettings } = await import("./db");
    vi.mocked(getTenantSettings).mockResolvedValueOnce({
      twintQrUrl: "/uploads/twint-qr/1_ab12.png",
    } as never);

    const res = await request(makeApp())
      .get("/api/pos/config")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body.twintQrUrl).toBe("/uploads/twint-qr/1_ab12.png");
  });

  it("still serves config when the settings read fails", async () => {
    // Losing the QR option is survivable; a POS that won't start is not.
    const { getTenantSettings } = await import("./db");
    vi.mocked(getTenantSettings).mockRejectedValueOnce(new Error("db down"));

    const res = await request(makeApp())
      .get("/api/pos/config")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body.twintQrUrl).toBeNull();
  });

  // Store identity for generic POS clients (Zolto POS) — the app renders the
  // paired store's name/logo at runtime instead of baking a brand into the
  // build, so config must always carry a usable identity.
  it("returns the tenant's name, no logo, and CHF by default", async () => {
    const res = await request(makeApp())
      .get("/api/pos/config")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body.storeName).toBe("Test Store");
    expect(res.body.logoUrl).toBeNull();
    expect(res.body.currency).toBe("chf");
  });

  it("prefers the white-label name and serves branding from settings", async () => {
    const { getTenantSettings } = await import("./db");
    vi.mocked(getTenantSettings).mockResolvedValueOnce({
      whiteLabelName: "Aurora Atelier",
      logoUrl: "https://cdn.example/logo.png",
      currency: "eur",
    } as never);

    const res = await request(makeApp())
      .get("/api/pos/config")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body.storeName).toBe("Aurora Atelier");
    expect(res.body.logoUrl).toBe("https://cdn.example/logo.png");
    expect(res.body.currency).toBe("eur");
  });

  it("keeps a usable store identity when the settings read fails", async () => {
    const { getTenantSettings } = await import("./db");
    vi.mocked(getTenantSettings).mockRejectedValueOnce(new Error("db down"));

    const res = await request(makeApp())
      .get("/api/pos/config")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(res.body.storeName).toBe("Test Store");
    expect(res.body.logoUrl).toBeNull();
    expect(res.body.currency).toBe("chf");
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
    columnName: string,
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
        ([key, val]) => key !== "table" && walk(val),
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
      conditionReferencesColumn(whereSpy.mock.calls[0][0], "visible"),
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
      conditionReferencesColumn(whereSpy.mock.calls[0][0], "visible"),
    ).toBe(false);
    expect(conditionReferencesColumn(whereSpy.mock.calls[0][0], "sold")).toBe(
      true,
    );
  });

  it("excludes pieces with a live checkout hold, POS <-> online inventory sync", async () => {
    const { db, whereSpy } = makeSpyDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .get("/api/pos/products")
      .set("x-pos-key", "test-pos-key");

    expect(res.status).toBe(200);
    expect(
      conditionReferencesColumn(whereSpy.mock.calls[0][0], "reserved_until"),
    ).toBe(true);
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
      makeFakeDb([{ id: 1, price: "50.00" }]) as never,
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
      makeFakeDb([{ id: 1, price: "50.00", visible: false }]) as never,
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
      makeFakeDb([{ id: 1, price: "50.00", visible: false }]) as never,
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
      expect.objectContaining({ amount: 5000 }),
      undefined, // no connected account → platform account
    );
  });

  it("still rejects a sold or out-of-stock product even when allowHidden is true", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([
        { id: 1, price: "50.00", visible: false, sold: true },
      ]) as never,
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

  it("rejects a piece that's actively held by an in-flight online checkout (POS <-> online inventory sync), even with allowHidden", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([
        {
          id: 1,
          price: "50.00",
          reservedUntil: new Date(Date.now() + 10 * 60 * 1000),
        },
      ]) as never,
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

  it("allows a piece through once its checkout hold has expired", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([
        {
          id: 1,
          price: "50.00",
          reservedUntil: new Date(Date.now() - 60 * 1000),
        },
      ]) as never,
    );
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1] });

    expect(res.status).toBe(200);
  });

  it("refuses to create a payment intent when the computed total is CHF 0.00", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([{ id: 1, price: "0.00" }]) as never,
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
      ]) as never,
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
      expect.objectContaining({ amount: 7550 }),
      undefined, // no connected account → platform account
    );
  });
});

// A card_present PaymentIntent has no line items, so `description` is the only
// field that says what was sold — without it the merchant's dashboard shows an
// amount and nothing else, and a sale can't be matched to an item.
describe("buildPosSaleDescription", () => {
  it("names every item in the sale", () => {
    expect(buildPosSaleDescription(["Silver Necklace", "Jade Earrings"])).toBe(
      "POS sale: Silver Necklace, Jade Earrings",
    );
  });

  it("collapses repeats into a quantity instead of repeating the name", () => {
    expect(
      buildPosSaleDescription([
        "Jade Earrings",
        "Silver Ring",
        "Jade Earrings",
      ]),
    ).toBe("POS sale: Jade Earrings ×2, Silver Ring");
  });

  it("ignores blank and missing names rather than emitting empty entries", () => {
    expect(
      buildPosSaleDescription([null, undefined, "  ", "Silver Ring"]),
    ).toBe("POS sale: Silver Ring");
  });

  it("falls back to a bare label when nothing is nameable", () => {
    expect(buildPosSaleDescription([null, ""])).toBe("POS sale");
  });

  it("summarises a cart too long to name in full, staying inside Stripe's limit", () => {
    const names = Array.from(
      { length: 60 },
      (_, i) => `Handmade Piece Number ${i}`,
    );
    const description = buildPosSaleDescription(names);

    expect(description.length).toBeLessThanOrEqual(500);
    expect(description).toContain("Handmade Piece Number 0");
    expect(description).toMatch(/\+\d+ more$/);
  });

  it("truncates a single name longer than the whole budget", () => {
    const description = buildPosSaleDescription([
      "x".repeat(900),
      "Silver Ring",
    ]);

    expect(description.length).toBeLessThanOrEqual(500);
    expect(description).toMatch(/…\s\+1 more$/);
  });
});

describe("POS Stripe intents — description", () => {
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

  it("describes the card payment with the catalogue names of what was sold", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([
        { id: 1, price: "50.00", name: "Silver Necklace" },
        { id: 2, price: "25.50", name: "Jade Earrings" },
      ]) as never,
    );
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1, 2] });

    expect(res.status).toBe(200);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "POS sale: Silver Necklace, Jade Earrings",
      }),
      undefined,
    );
  });

  it("includes custom (non-inventory) items in the description", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([{ id: 1, price: "50.00", name: "Silver Necklace" }]) as never,
    );
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "test-pos-key")
      .send({
        productIds: [1],
        customItems: [{ name: "Gift Wrapping", priceRappen: 500 }],
      });

    expect(res.status).toBe(200);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "POS sale: Silver Necklace, Gift Wrapping",
      }),
      undefined,
    );
  });

  it("describes a TWINT payment the same way", async () => {
    vi.mocked(getDb).mockResolvedValueOnce(
      makeFakeDb([{ id: 1, price: "50.00", name: "Silver Necklace" }]) as never,
    );
    const fakeStripe = makeFakeTwintStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/twint-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1] });

    expect(res.status).toBe(200);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ description: "POS sale: Silver Necklace" }),
      undefined,
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
      expect.objectContaining({ amount: 3500 }),
      undefined, // no connected account → platform account
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
      expect.objectContaining({
        productId: null,
        priceRappen: 1000,
        name: "Custom repair",
      }),
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
      expect.objectContaining({ amount: 4200 }),
      undefined, // no connected account → platform account
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
    itemRows: Array<{
      posOrderId: number;
      productId: number | null;
      priceRappen: number;
      name: string | null;
    }>,
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
    const { db, updateWhereSpy } = makeFulfillFakeDb(
      { id: 7, status: "pending", tenantId: 1 },
      [
        { posOrderId: 7, productId: 1, priceRappen: 3000, name: null },
        {
          posOrderId: 7,
          productId: null,
          priceRappen: 1500,
          name: "Custom repair fee",
        },
      ],
    );
    vi.mocked(getDb).mockResolvedValue(db as never);
    const fakeStripe = {
      paymentIntents: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: "pi_1", status: "succeeded" }),
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
    expect(res.body).toEqual({
      success: true,
      posOrderId: 7,
      alreadyFulfilled: false,
    });
    expect(markProductsSold).toHaveBeenCalledWith(1, [1]);
    expect(updateWhereSpy).toHaveBeenCalled();
  });

  it("is a no-op for an order that's already marked paid, and reports alreadyFulfilled", async () => {
    const { db } = makeFulfillFakeDb({ id: 7, status: "paid" }, []);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const fakeStripe = {
      paymentIntents: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: "pi_1", status: "succeeded" }),
      },
    };
    vi.mocked(getStripe).mockReturnValue(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/sale")
      .set("x-pos-key", "test-pos-key")
      .send({ paymentIntentId: "pi_1" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      posOrderId: 7,
      alreadyFulfilled: true,
    });
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("returns 404 when no pos_order matches the PaymentIntent", async () => {
    const { db } = makeFulfillFakeDb(undefined, []);
    vi.mocked(getDb).mockResolvedValue(db as never);
    const fakeStripe = {
      paymentIntents: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ id: "pi_unknown", status: "succeeded" }),
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
    expect(res.body).toEqual({
      success: true,
      posOrderId: 99,
      totalRappen: 5000,
    });
    expect(db.insertValuesSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stripePaymentIntentId: null,
        status: "paid",
        paymentMethod: "cash",
        totalRappen: 5000,
      }),
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
      expect.objectContaining({
        productId: null,
        priceRappen: 1000,
        name: "Custom repair",
      }),
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
    const res = await request(makeApp())
      .post("/api/pos/manual-sale")
      .send({ productIds: [1] });
    expect(res.status).toBe(401);
  });

  // The TWINT QR-sticker rail rides this same endpoint: the customer scans the
  // merchant's own sticker, the merchant sees it land in their TWINT app, and
  // attests — exactly like cash. See docs/planning/native-twint-integration.md.
  it("records a twint_qr sale, distinct from Stripe-confirmed twint", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .post("/api/pos/manual-sale")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], paymentMethod: "twint_qr" });

    expect(res.status).toBe(200);
    expect(db.insertValuesSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stripePaymentIntentId: null,
        status: "paid",
        // NOT "twint" — that value means a Stripe PaymentIntent succeeded.
        paymentMethod: "twint_qr",
        totalRappen: 5000,
      }),
    );
    expect(markProductsSold).toHaveBeenCalledWith(1, [1]);
  });

  it("defaults to cash when no paymentMethod is sent (older POS builds)", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    await request(makeApp())
      .post("/api/pos/manual-sale")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1] });

    expect(db.insertValuesSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ paymentMethod: "cash" }),
    );
  });

  it("refuses to record a gateway-confirmed method on the attested path", async () => {
    // Otherwise a POS client could claim a `card` or Stripe `twint` sale that
    // no gateway ever confirmed, laundering an attestation into proof.
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .post("/api/pos/manual-sale")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], paymentMethod: "card" });

    expect(res.status).toBe(400);
    expect(db.insertValuesSpy).not.toHaveBeenCalled();
    expect(markProductsSold).not.toHaveBeenCalled();
  });

  it("refuses an unknown paymentMethod", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);

    const res = await request(makeApp())
      .post("/api/pos/manual-sale")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], paymentMethod: "bitcoin" });

    expect(res.status).toBe(400);
    expect(db.insertValuesSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/pos/twint-intent", () => {
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
      }),
      undefined,
    );
    expect(db.insertValuesSpy).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        paymentMethod: "twint",
        status: "pending",
        stripePaymentIntentId: "pi_twint_1",
      }),
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
      .send({
        productIds: [1],
        priceOverrides: { "1": 3000 },
        customerPhone: "0791234567",
      });

    expect(res.status).toBe(200);
    expect(res.body.totalRappen).toBe(3000);
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 3000 }),
      undefined,
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
    const res = await request(makeApp())
      .post("/api/pos/twint-intent")
      .send({ productIds: [1] });
    expect(res.status).toBe(401);
  });
});

// ─── Tap to Pay (Stripe Terminal) ────────────────────────────────────────────

function makeTerminalStripe() {
  return {
    terminal: {
      connectionTokens: {
        create: vi.fn().mockResolvedValue({ secret: "pst_secret_123" }),
      },
      locations: {
        create: vi.fn().mockResolvedValue({ id: "tml_new_123" }),
      },
    },
  };
}

describe("POST /api/pos/terminal/connection-token", () => {
  it("rejects requests without the POS key", async () => {
    const res = await request(makeApp()).post(
      "/api/pos/terminal/connection-token",
    );
    expect(res.status).toBe(401);
  });

  it("503s when Stripe isn't configured", async () => {
    const res = await request(makeApp())
      .post("/api/pos/terminal/connection-token")
      .set("x-pos-key", "connected-pos-key");
    expect(res.status).toBe(503);
  });

  it("409s with a clear message when the tenant hasn't connected Stripe", async () => {
    vi.mocked(getStripe).mockReturnValueOnce(makeTerminalStripe() as never);
    const res = await request(makeApp())
      .post("/api/pos/terminal/connection-token")
      .set("x-pos-key", "test-pos-key"); // TEST_TENANT: no connected account
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Connect your Stripe account/);
  });

  it("mints the token ON the tenant's connected account", async () => {
    const stripe = makeTerminalStripe();
    vi.mocked(getStripe).mockReturnValueOnce(stripe as never);
    const res = await request(makeApp())
      .post("/api/pos/terminal/connection-token")
      .set("x-pos-key", "connected-pos-key");
    expect(res.status).toBe(200);
    expect(res.body.secret).toBe("pst_secret_123");
    expect(stripe.terminal.connectionTokens.create).toHaveBeenCalledWith(
      {},
      { stripeAccount: "acct_connected" },
    );
  });
});

describe("POST /api/pos/terminal/location", () => {
  const address = {
    line1: "Bahnhofstrasse 1",
    city: "Zürich",
    postal_code: "8001",
    country: "CH",
  };

  it("returns the stored location without calling Stripe", async () => {
    const stripe = makeTerminalStripe();
    vi.mocked(getStripe).mockReturnValueOnce(stripe as never);
    // Simulate an already-provisioned tenant by giving the context a location.
    CONNECTED_TENANT.terminalLocationId = "tml_existing_1";
    const res = await request(makeApp())
      .post("/api/pos/terminal/location")
      .set("x-pos-key", "connected-pos-key")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.locationId).toBe("tml_existing_1");
    expect(stripe.terminal.locations.create).not.toHaveBeenCalled();
    CONNECTED_TENANT.terminalLocationId = null;
  });

  it("400s on first provisioning without an address", async () => {
    vi.mocked(getStripe).mockReturnValueOnce(makeTerminalStripe() as never);
    const res = await request(makeApp())
      .post("/api/pos/terminal/location")
      .set("x-pos-key", "connected-pos-key")
      .send({ displayName: "My Stall" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/store address/);
  });

  it("creates the Location on the connected account and persists the id", async () => {
    const stripe = makeTerminalStripe();
    vi.mocked(getStripe).mockReturnValueOnce(stripe as never);
    const { setTenantTerminalLocation } = await import("./db");
    const res = await request(makeApp())
      .post("/api/pos/terminal/location")
      .set("x-pos-key", "connected-pos-key")
      .send({ displayName: "Connected Store", address });
    expect(res.status).toBe(200);
    expect(res.body.locationId).toBe("tml_new_123");
    expect(stripe.terminal.locations.create).toHaveBeenCalledWith(
      {
        display_name: "Connected Store",
        address,
      },
      { stripeAccount: "acct_connected" },
    );
    expect(setTenantTerminalLocation).toHaveBeenCalledWith(2, "tml_new_123");
  });

  it("409s when the tenant hasn't connected Stripe", async () => {
    vi.mocked(getStripe).mockReturnValueOnce(makeTerminalStripe() as never);
    const res = await request(makeApp())
      .post("/api/pos/terminal/location")
      .set("x-pos-key", "test-pos-key")
      .send({ address });
    expect(res.status).toBe(409);
  });
});

describe("GET /api/pos/config with per-tenant locations", () => {
  it("prefers the tenant's own location over the env fallback", async () => {
    process.env.STRIPE_LOCATION_ID = "tml_env_fallback";
    CONNECTED_TENANT.terminalLocationId = "tml_tenant_1";
    const res = await request(makeApp())
      .get("/api/pos/config")
      .set("x-pos-key", "connected-pos-key");
    expect(res.body.locationId).toBe("tml_tenant_1");
    CONNECTED_TENANT.terminalLocationId = null;
    delete process.env.STRIPE_LOCATION_ID;
  });
});

describe("POST /api/pos/payment-intent on a connected account", () => {
  it("creates the card_present intent on the tenant's Stripe account in their currency", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);
    const { getTenantSettings } = await import("./db");
    vi.mocked(getTenantSettings).mockResolvedValueOnce({
      currency: "eur",
    } as never);

    const res = await request(makeApp())
      .post("/api/pos/payment-intent")
      .set("x-pos-key", "connected-pos-key")
      .send({ productIds: [1] });

    expect(res.status).toBe(200);
    expect(fakeStripe.customers.create).toHaveBeenCalledWith(
      expect.anything(),
      { stripeAccount: "acct_connected" },
    );
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 5000, currency: "eur" }),
      { stripeAccount: "acct_connected" },
    );
  });
});

describe("POST /api/pos/twint-intent on a connected account", () => {
  it("creates the customer and twint intent on the tenant's Stripe account, not the platform's", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeTwintStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/twint-intent")
      .set("x-pos-key", "connected-pos-key")
      .send({ productIds: [1], customerPhone: "0791234567" });

    expect(res.status).toBe(200);
    expect(fakeStripe.customers.create).toHaveBeenCalledWith(
      expect.anything(),
      { stripeAccount: "acct_connected" },
    );
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method_types: ["twint"] }),
      { stripeAccount: "acct_connected" },
    );
  });

  it("falls back to the platform account when the tenant hasn't connected Stripe (self-hosted single-tenant)", async () => {
    const db = makeFakeDb([{ id: 1, price: "50.00" }]);
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const fakeStripe = makeFakeTwintStripe();
    vi.mocked(getStripe).mockReturnValueOnce(fakeStripe as never);

    const res = await request(makeApp())
      .post("/api/pos/twint-intent")
      .set("x-pos-key", "test-pos-key")
      .send({ productIds: [1], customerPhone: "0791234567" });

    expect(res.status).toBe(200);
    expect(fakeStripe.customers.create).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
    );
    expect(fakeStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method_types: ["twint"] }),
      undefined,
    );
  });
});

// ─── Sales history + receipts ────────────────────────────────────────────────

function makeSalesDb(orders: unknown[], items: unknown[]) {
  const updateSetSpy = vi.fn(() => ({
    where: vi.fn().mockResolvedValue(undefined),
  }));
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        // loadOwnPosOrder's order lookup: where(...).limit(1)
        where: vi.fn(() => {
          const isItems = (table as { _: unknown }) === table; // can't distinguish; use call count
          return {
            limit: vi.fn(() => Promise.resolve(orders)),
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve(orders)),
            })),
            then: (resolve: (v: unknown) => unknown) => resolve(items),
          };
        }),
      })),
    })),
    update: vi.fn(() => ({ set: updateSetSpy })),
    _updateSetSpy: updateSetSpy,
  };
}

describe("GET /api/pos/sales", () => {
  it("returns paid orders with their line items", async () => {
    const db = makeSalesDb(
      [
        {
          id: 9,
          status: "paid",
          paymentMethod: "card",
          totalRappen: 7550,
          createdAt: new Date("2026-07-01T10:00:00Z"),
          invoiceNumber: "KPOS-9",
          receiptUrl: null,
          customerEmail: null,
          customerPhone: null,
        },
      ],
      [
        { posOrderId: 9, productId: 1, name: "Pearl Ring", priceRappen: 5000 },
        {
          posOrderId: 9,
          productId: null,
          name: "Gift wrap",
          priceRappen: 2550,
        },
      ],
    );
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const res = await request(makeApp())
      .get("/api/pos/sales")
      .set("x-pos-key", "test-pos-key");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      id: 9,
      status: "paid",
      totalRappen: 7550,
      totalChf: "75.50",
      paymentMethod: "card",
    });
    expect(res.body[0].items).toEqual([
      { productId: 1, productName: "Pearl Ring", priceRappen: 5000 },
      { productId: null, productName: "Gift wrap", priceRappen: 2550 },
    ]);
  });
});

describe("POST /api/pos/send-receipt", () => {
  it("400s on a missing or invalid email", async () => {
    const res = await request(makeApp())
      .post("/api/pos/send-receipt")
      .set("x-pos-key", "test-pos-key")
      .send({ posOrderId: 9, email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("404s for an order belonging to another tenant", async () => {
    const db = makeSalesDb([], []); // loadOwnPosOrder finds nothing
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const res = await request(makeApp())
      .post("/api/pos/send-receipt")
      .set("x-pos-key", "test-pos-key")
      .send({ posOrderId: 9, email: "buyer@example.com" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/pos/save-receipt", () => {
  it("400s without posOrderId", async () => {
    const res = await request(makeApp())
      .post("/api/pos/save-receipt")
      .set("x-pos-key", "test-pos-key")
      .send({});
    expect(res.status).toBe(400);
  });

  it("saves customer details even when storage isn't configured", async () => {
    const db = makeSalesDb(
      [
        {
          id: 9,
          status: "paid",
          paymentMethod: "card",
          totalRappen: 5000,
          createdAt: new Date("2026-07-01T10:00:00Z"),
          invoiceNumber: "KPOS-9",
          receiptUrl: null,
          customerEmail: null,
          customerPhone: null,
        },
      ],
      [{ posOrderId: 9, productId: 1, name: "Pearl Ring", priceRappen: 5000 }],
    );
    vi.mocked(getDb).mockResolvedValueOnce(db as never);
    const res = await request(makeApp())
      .post("/api/pos/save-receipt")
      .set("x-pos-key", "test-pos-key")
      .send({ posOrderId: 9, customerEmail: "buyer@example.com" });
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(true);
    // storagePut without S3 env throws internally → receiptUrl stays null,
    // but the customer details still get persisted (graceful degradation).
    expect(db.update).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/pos/pair — one-tap register pairing
// ═══════════════════════════════════════════════════════════════════════════════
//
// The one POS route with no X-POS-Key, because it is how a register that has no
// key yet gets one. What stands in for auth is the pairing token itself.

describe("POST /api/pos/pair", () => {
  beforeEach(async () => {
    vi.mocked(redeemPairingToken).mockReset();
    await resetPosPairingRateLimits();
  });

  it("hands the store's credentials to a register with a good token", async () => {
    vi.mocked(redeemPairingToken).mockResolvedValue({
      apiKey: "k".repeat(64),
      storeName: "Bergblume",
      storeSlug: "bergblume",
    });

    const res = await request(makeApp())
      .post("/api/pos/pair")
      .send({ token: "tok" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      apiKey: "k".repeat(64),
      storeName: "Bergblume",
      storeSlug: "bergblume",
    });
  });

  it("needs no POS key — that is the whole point", async () => {
    vi.mocked(redeemPairingToken).mockResolvedValue({
      apiKey: "k".repeat(64),
      storeName: "Bergblume",
      storeSlug: "bergblume",
    });
    const res = await request(makeApp())
      .post("/api/pos/pair")
      .send({ token: "tok" });
    // No x-pos-key header was set anywhere above.
    expect(res.status).toBe(200);
  });

  // Unknown, expired, already-spent and internal failure must be
  // indistinguishable: a differentiated error tells someone grinding tokens
  // which guesses were once real.
  it("answers every failure identically", async () => {
    const app = makeApp();

    vi.mocked(redeemPairingToken).mockResolvedValue(null);
    const rejected = await request(app)
      .post("/api/pos/pair")
      .send({ token: "nope" });

    vi.mocked(redeemPairingToken).mockRejectedValue(new Error("db down"));
    const threw = await request(app)
      .post("/api/pos/pair")
      .send({ token: "tok" });

    const missing = await request(app).post("/api/pos/pair").send({});
    const wrongType = await request(app)
      .post("/api/pos/pair")
      .send({ token: 12345 });

    for (const res of [rejected, threw, missing, wrongType]) {
      expect(res.status).toBe(400);
      expect(res.body.error).toBe(rejected.body.error);
    }
  });

  it("never echoes the token back", async () => {
    vi.mocked(redeemPairingToken).mockResolvedValue(null);
    const res = await request(makeApp())
      .post("/api/pos/pair")
      .send({ token: "super-secret-token" });
    expect(JSON.stringify(res.body)).not.toContain("super-secret-token");
  });

  it("rate limits a caller grinding tokens", async () => {
    const app = makeApp();
    vi.mocked(redeemPairingToken).mockResolvedValue(null);

    let sawLimit = false;
    for (let i = 0; i < 25; i++) {
      const res = await request(app)
        .post("/api/pos/pair")
        .set("x-forwarded-for", "203.0.113.9")
        .send({ token: `guess-${i}` });
      if (res.status === 429) {
        sawLimit = true;
        expect(res.body.retryAfter).toBeGreaterThan(0);
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });

  it("buckets by caller, so one grinder can't lock out a real merchant", async () => {
    const app = makeApp();
    vi.mocked(redeemPairingToken).mockResolvedValue(null);

    for (let i = 0; i < 25; i++) {
      await request(app)
        .post("/api/pos/pair")
        .set("x-forwarded-for", "203.0.113.9")
        .send({ token: `guess-${i}` });
    }

    vi.mocked(redeemPairingToken).mockResolvedValue({
      apiKey: "k".repeat(64),
      storeName: "Bergblume",
      storeSlug: "bergblume",
    });
    const other = await request(app)
      .post("/api/pos/pair")
      .set("x-forwarded-for", "198.51.100.4")
      .send({ token: "good" });
    expect(other.status).toBe(200);
  });
});
