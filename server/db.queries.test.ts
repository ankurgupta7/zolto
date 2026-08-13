import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";

// A drizzle query builder is a thenable that returns `result` when awaited.
// Every builder method returns the same chain so any call order resolves.
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "limit",
    "orderBy",
    "set",
    "values",
    "onDuplicateKeyUpdate",
    "innerJoin",
    "leftJoin",
  ];
  for (const m of methods) chain[m] = () => chain;
  chain.$returningId = () => Promise.resolve(result);
  chain.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) =>
    Promise.resolve(result).then(res, rej);
  return chain;
}

const mockConnection = { release: vi.fn(), destroy: vi.fn() };

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  $client: {
    getConnection: vi.fn((cb: (err: unknown, conn: unknown) => void) =>
      cb(null, mockConnection),
    ),
  },
};

vi.mock("drizzle-orm/mysql2", () => ({
  drizzle: vi.fn(() => dbMock),
}));

import * as db from "./db";

beforeAll(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
});

beforeEach(() => {
  dbMock.select.mockReset();
  dbMock.insert.mockReset();
  dbMock.update.mockReset();
  dbMock.delete.mockReset();
  mockConnection.release.mockReset();
  mockConnection.destroy.mockReset();
  dbMock.$client.getConnection.mockClear();
  dbMock.$client.getConnection.mockImplementation(
    (cb: (err: unknown, conn: unknown) => void) => cb(null, mockConnection),
  );
});

function selectReturns(result: unknown) {
  dbMock.select.mockReturnValue(makeChain(result));
}
function insertReturns(result: unknown = undefined) {
  dbMock.insert.mockReturnValue(makeChain(result));
}
function updateReturns() {
  dbMock.update.mockReturnValue(makeChain(undefined));
}
function deleteReturns() {
  dbMock.delete.mockReturnValue(makeChain(undefined));
}

describe("user reads", () => {
  it("getUserByOpenId returns the row when found", async () => {
    selectReturns([{ id: 1, openId: "google:1" }]);
    const user = await db.getUserByOpenId("google:1");
    expect(user).toMatchObject({ id: 1 });
  });

  it("getUserByOpenId returns undefined when not found", async () => {
    selectReturns([]);
    expect(await db.getUserByOpenId("nobody")).toBeUndefined();
  });

  it("listPlatformOperators returns every superadmin — the accounts the admin shell may act as", async () => {
    selectReturns([
      { id: 1, role: "superadmin", email: "owner@zolto.ch" },
      { id: 4, role: "superadmin", email: "second@zolto.ch" },
    ]);
    const operators = await db.listPlatformOperators();
    expect(operators.map((u) => u.email)).toEqual([
      "owner@zolto.ch",
      "second@zolto.ch",
    ]);
  });

  it("listPlatformOperators returns nothing on a platform with no owner, rather than throwing", async () => {
    selectReturns([]);
    expect(await db.listPlatformOperators()).toEqual([]);
  });

  it("getStoreUserByEmail returns the store-attached row when found", async () => {
    selectReturns([{ id: 5, tenantId: 7, openId: "google:sub-1" }]);
    expect(await db.getStoreUserByEmail("owner@a.example")).toEqual({
      id: 5,
      tenantId: 7,
      pendingClaim: false,
    });
  });

  it("getStoreUserByEmail flags a still-unclaimed pending-admin row", async () => {
    selectReturns([{ id: 5, tenantId: 7, openId: "pending:tok-abc" }]);
    expect(await db.getStoreUserByEmail("owner@a.example")).toEqual({
      id: 5,
      tenantId: 7,
      pendingClaim: true,
    });
  });

  it("getStoreUserByEmail returns undefined when the email is unused", async () => {
    selectReturns([]);
    expect(await db.getStoreUserByEmail("free@a.example")).toBeUndefined();
  });

  it("getPendingTenantAdminByEmail returns the unclaimed row when found", async () => {
    selectReturns([{ id: 9, tenantId: 42 }]);
    expect(await db.getPendingTenantAdminByEmail("owner@a.example")).toEqual({
      id: 9,
      tenantId: 42,
    });
  });

  it("getPendingTenantAdminByEmail returns undefined when nothing is waiting", async () => {
    selectReturns([]);
    expect(
      await db.getPendingTenantAdminByEmail("free@a.example"),
    ).toBeUndefined();
  });
});

describe("product reads", () => {
  it("getVisibleProducts returns the visible list", async () => {
    selectReturns([{ id: 1 }, { id: 2 }]);
    expect(await db.getVisibleProducts(7)).toHaveLength(2);
  });

  it("getAllProducts returns everything for the tenant", async () => {
    selectReturns([{ id: 1 }]);
    expect(await db.getAllProducts(7)).toHaveLength(1);
  });

  it("getProductById returns the row or undefined", async () => {
    selectReturns([{ id: 5 }]);
    expect(await db.getProductById(7, 5)).toMatchObject({ id: 5 });
    selectReturns([]);
    expect(await db.getProductById(7, 5)).toBeUndefined();
  });

  it("getVisibleProductById returns the row or undefined", async () => {
    selectReturns([{ id: 5 }]);
    expect(await db.getVisibleProductById(7, 5)).toMatchObject({ id: 5 });
    selectReturns([]);
    expect(await db.getVisibleProductById(7, 5)).toBeUndefined();
  });

  it("getProductByDiscordMessageId returns the row or undefined", async () => {
    selectReturns([{ id: 5 }]);
    expect(await db.getProductByDiscordMessageId(7, "m1")).toMatchObject({
      id: 5,
    });
    selectReturns([]);
    expect(await db.getProductByDiscordMessageId(7, "m1")).toBeUndefined();
  });

  it("getProductsByIds short-circuits on an empty id list", async () => {
    expect(await db.getProductsByIds(7, [])).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("getProductsByIds queries when ids are provided", async () => {
    selectReturns([{ id: 1 }, { id: 2 }]);
    expect(await db.getProductsByIds(7, [1, 2])).toHaveLength(2);
  });

  it("getProductsMissingTranslation returns the list", async () => {
    selectReturns([{ id: 1 }]);
    expect(await db.getProductsMissingTranslation(7)).toHaveLength(1);
  });

  it("getAvailableProductsForMatching returns in-stock candidates", async () => {
    selectReturns([{ id: 1 }]);
    expect(await db.getAvailableProductsForMatching(7)).toHaveLength(1);
  });
});

describe("product writes", () => {
  it("createProduct inserts with the tenant applied", async () => {
    insertReturns({ insertId: 1 });
    await db.createProduct({ tenantId: 7, name: "x" } as never);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("setProductVisibility updates", async () => {
    updateReturns();
    await db.setProductVisibility(7, 1, false);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("setProductSold updates", async () => {
    updateReturns();
    await db.setProductSold(7, 1, true);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("updateProduct updates", async () => {
    updateReturns();
    await db.updateProduct(7, 1, { name: "new" });
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("setProductQuantity updates", async () => {
    updateReturns();
    await db.setProductQuantity(7, 1, 0);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("deleteProduct deletes", async () => {
    deleteReturns();
    await db.deleteProduct(7, 1);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });
});

describe("product images", () => {
  it("getProductImages returns the ordered list", async () => {
    selectReturns([{ id: 1 }]);
    expect(await db.getProductImages(7, 5)).toHaveLength(1);
  });

  it("addProductImage inserts", async () => {
    insertReturns(undefined);
    await db.addProductImage({ tenantId: 7, productId: 5 } as never);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  // Deleting an image now reads its storage key first, so the tenant's plan
  // allowance can be released too — otherwise a merchant who cleared their
  // catalogue would stay "full" forever and eventually be unable to upload.
  it("deleteProductImage deletes the image and releases its quota", async () => {
    selectReturns([{ imageKey: "product-images/3/a_1234.jpg" }]);
    deleteReturns();
    await db.deleteProductImage(7, 3);
    // One delete for the image row, one for its storage-ledger row.
    expect(dbMock.delete).toHaveBeenCalledTimes(2);
  });

  it("deleteAllProductImages releases the quota for every image", async () => {
    selectReturns([
      { imageKey: "product-images/5/a_1.jpg" },
      { imageKey: "product-images/5/b_2.jpg" },
    ]);
    deleteReturns();
    await db.deleteAllProductImages(7, 5);
    // The images row plus one ledger row per image freed.
    expect(dbMock.delete).toHaveBeenCalledTimes(3);
  });

  it("still deletes the image when it has no storage-ledger row", async () => {
    // Objects written before migration 0026 were never metered, so there is
    // nothing to release. The image must still go.
    selectReturns([]);
    deleteReturns();
    await db.deleteProductImage(7, 3);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });
});

describe("instagram posts", () => {
  it("getInstagramPosts returns the ordered grid", async () => {
    selectReturns([{ id: 1 }]);
    expect(await db.getInstagramPosts(7)).toHaveLength(1);
  });

  it("addInstagramPost inserts", async () => {
    insertReturns(undefined);
    await db.addInstagramPost(7, "https://insta/p", 0);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("deleteInstagramPost deletes", async () => {
    deleteReturns();
    await db.deleteInstagramPost(7, 1);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });

  it("reorderInstagramPost updates the sort order", async () => {
    updateReturns();
    await db.reorderInstagramPost(7, 1, 3);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });
});

describe("orders & logs", () => {
  it("getPaidOrders returns paid orders", async () => {
    selectReturns([{ id: 1, status: "paid" }]);
    expect(await db.getPaidOrders(7)).toHaveLength(1);
  });

  it("getBulkUploadLogs returns recent logs", async () => {
    selectReturns([{ id: 1 }]);
    expect(await db.getBulkUploadLogs(7)).toHaveLength(1);
  });
});

describe("tenant reads", () => {
  it("getTenantByDiscordChannelId unwraps the joined tenant", async () => {
    selectReturns([{ tenant: { id: 7, name: "Aurora" } }]);
    expect(await db.getTenantByDiscordChannelId("chan")).toMatchObject({
      id: 7,
    });
    selectReturns([]);
    expect(await db.getTenantByDiscordChannelId("chan")).toBeUndefined();
  });

  it("getTenantBySlackChannelId unwraps the joined tenant", async () => {
    selectReturns([{ tenant: { id: 7 } }]);
    expect(await db.getTenantBySlackChannelId("chan")).toMatchObject({ id: 7 });
  });

  it("getTenantSettings returns settings or undefined", async () => {
    selectReturns([{ tenantId: 7 }]);
    expect(await db.getTenantSettings(7)).toMatchObject({ tenantId: 7 });
    selectReturns([]);
    expect(await db.getTenantSettings(7)).toBeUndefined();
  });

  it("getTenantById returns the tenant or undefined", async () => {
    selectReturns([{ id: 7 }]);
    expect(await db.getTenantById(7)).toMatchObject({ id: 7 });
    selectReturns([]);
    expect(await db.getTenantById(7)).toBeUndefined();
  });

  it("getTenantByPosApiKey resolves by key", async () => {
    selectReturns([{ id: 7 }]);
    expect(await db.getTenantByPosApiKey("key")).toMatchObject({ id: 7 });
    selectReturns([]);
    expect(await db.getTenantByPosApiKey("key")).toBeUndefined();
  });

  it("getTenantBySlug resolves by slug", async () => {
    selectReturns([{ id: 7, slug: "aurora" }]);
    expect(await db.getTenantBySlug("aurora")).toMatchObject({
      slug: "aurora",
    });
  });

  it("getTenantByReferralCode resolves by code", async () => {
    selectReturns([{ id: 7 }]);
    expect(await db.getTenantByReferralCode("REF")).toMatchObject({ id: 7 });
  });

  it("getTenantByCustomDomain unwraps the joined tenant", async () => {
    selectReturns([{ tenant: { id: 7, slug: "aurora" } }]);
    expect(await db.getTenantByCustomDomain("shop.example.com")).toMatchObject({
      slug: "aurora",
    });
    selectReturns([]);
    expect(
      await db.getTenantByCustomDomain("shop.example.com"),
    ).toBeUndefined();
  });
});

describe("tenant writes", () => {
  it("createTenant returns the new id", async () => {
    insertReturns([{ id: 42 }]);
    expect(await db.createTenant({ slug: "x" } as never)).toBe(42);
  });

  it("createTenantSettings inserts", async () => {
    insertReturns(undefined);
    await db.createTenantSettings({ tenantId: 7 } as never);
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("setTenantStripeCustomer updates", async () => {
    updateReturns();
    await db.setTenantStripeCustomer(7, "cus_1");
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("setTenantStripeConnectAccount updates", async () => {
    updateReturns();
    await db.setTenantStripeConnectAccount(7, "acct_1");
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("setTenantReferrer updates", async () => {
    updateReturns();
    await db.setTenantReferrer(7, 3);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("createPendingTenantAdmin inserts a pending admin", async () => {
    insertReturns(undefined);
    await db.createPendingTenantAdmin(7, "a@b.c", "token");
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("assignUserToTenantAsAdmin updates the user", async () => {
    updateReturns();
    await db.assignUserToTenantAsAdmin("google:1", 7);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
  });

  it("deleteUserById deletes the user", async () => {
    deleteReturns();
    await db.deleteUserById(1);
    expect(dbMock.delete).toHaveBeenCalledTimes(1);
  });
});

describe("upsertUser", () => {
  it("persists the lastSignedIn timestamp when provided", async () => {
    insertReturns(undefined);
    const when = new Date("2025-01-01T00:00:00Z");
    await db.upsertUser({ openId: "google:1", lastSignedIn: when });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });

  it("throws when openId is missing", async () => {
    await expect(db.upsertUser({ openId: "" })).rejects.toThrow(/openId/i);
  });
});

describe("the db proxy", () => {
  it("forwards property access to the initialised client", async () => {
    // A prior query initialises _db, so the proxy resolves to the mock client.
    selectReturns([{ id: 1 }]);
    await db.getAllProducts(7);
    expect(db.db.select).toBe(dbMock.select);
  });
});

describe("database unavailable", () => {
  it("read helpers fall back and writes throw when DATABASE_URL is unset", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const fresh = await import("./db");

    // Reads degrade to the fallback value.
    expect(await fresh.getAllProducts(7)).toEqual([]);
    expect(await fresh.getTenantById(7)).toBeUndefined();
    // Writes refuse to silently no-op.
    await expect(fresh.deleteProduct(7, 1)).rejects.toThrow(/not available/i);
    // upsertUser degrades to a no-op rather than throwing.
    await expect(
      fresh.upsertUser({ openId: "google:1" }),
    ).resolves.toBeUndefined();
    // The proxy throws before any client is initialised.
    expect(() => fresh.db.select).toThrow(/not initialized/i);

    process.env.DATABASE_URL = saved;
  });

  it("returns null when drizzle fails to connect", async () => {
    const saved = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "mysql://bad";
    vi.resetModules();
    const drizzleModule = await import("drizzle-orm/mysql2");
    (
      drizzleModule.drizzle as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(() => {
      throw new Error("connection refused");
    });
    const fresh = await import("./db");
    // getDb swallows the connection error and reports no database.
    expect(await fresh.getDb()).toBeNull();
    process.env.DATABASE_URL = saved;
  });

  it("grants the configured owner the admin role on upsert", async () => {
    const savedUrl = process.env.DATABASE_URL;
    const savedOwner = process.env.OWNER_OPEN_ID;
    process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
    process.env.OWNER_OPEN_ID = "google:owner";
    vi.resetModules();
    const fresh = await import("./db");
    const captured: Record<string, unknown> = {};
    const chain = makeChain(undefined) as Record<string, unknown>;
    chain.values = (v: Record<string, unknown>) => {
      Object.assign(captured, v);
      return chain;
    };
    dbMock.insert.mockReturnValue(chain);

    await fresh.upsertUser({ openId: "google:owner" });
    expect(captured.role).toBe("admin");

    process.env.DATABASE_URL = savedUrl;
    if (savedOwner === undefined) delete process.env.OWNER_OPEN_ID;
    else process.env.OWNER_OPEN_ID = savedOwner;
  });
});
