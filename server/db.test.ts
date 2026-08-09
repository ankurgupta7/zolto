import {
  describe,
  expect,
  it,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
} from "vitest";

function makeChain(result: unknown) {
  const calls: Record<string, unknown[][]> = {};
  const chain: any = {
    __calls: calls,
  };
  const methods = [
    "from",
    "where",
    "limit",
    "orderBy",
    "set",
    "values",
    "onDuplicateKeyUpdate",
  ];
  for (const m of methods) {
    chain[m] = (...args: unknown[]) => {
      (calls[m] ??= []).push(args);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
    Promise.resolve(result).then(resolve, reject);
  return chain;
}

// A chain whose `.then` never settles, simulating a stuck connection-pool
// acquisition or wedged query so we can verify the DB-op timeout kicks in.
function makeHangingChain() {
  const chain: any = {};
  const methods = [
    "from",
    "where",
    "limit",
    "orderBy",
    "set",
    "values",
    "onDuplicateKeyUpdate",
  ];
  for (const m of methods) {
    chain[m] = () => chain;
  }
  chain.then = () => {};
  return chain;
}

// withTimeout() checks out a dedicated connection per call so it can
// destroy() it if the call times out — see server/db.ts. The mock
// connection just needs release()/destroy() so that code path doesn't
// throw; individual tests can override getConnection's callback args.
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

import {
  upsertUser,
  getOrderBySessionId,
  createOrder,
  updateOrderBySessionId,
  markProductsSold,
  reserveProducts,
  releaseProductReservations,
  getTenantAdminContact,
  insertBulkUploadLog,
  createProduct,
  setTenantCompByOperator,
} from "./db";

const sampleOrder = {
  id: 1,
  stripeSessionId: "cs_test_1",
  stripePaymentIntentId: null,
  status: "pending" as const,
  customerEmail: null,
  customerName: null,
  amountTotal: 1000,
  currency: "chf",
  productIds: "1",
  paymentMethod: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

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

describe("upsertUser", () => {
  it("throws when openId is missing", async () => {
    await expect(upsertUser({ openId: "" })).rejects.toThrow(
      "openId is required",
    );
  });

  it("inserts with onDuplicateKeyUpdate using the provided fields", async () => {
    const insertChain = makeChain(undefined);
    dbMock.insert.mockReturnValue(insertChain);

    await upsertUser({
      openId: "google:1",
      name: "Jane",
      email: "jane@example.com",
      role: "admin",
    });

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    const [values] = insertChain.__calls.values[0];
    expect(values).toMatchObject({
      openId: "google:1",
      name: "Jane",
      email: "jane@example.com",
      role: "admin",
    });
    const [updateArg] = insertChain.__calls.onDuplicateKeyUpdate[0];
    expect(updateArg.set).toMatchObject({
      name: "Jane",
      email: "jane@example.com",
      role: "admin",
    });
  });

  it("omits the role field when not provided and openId is not the owner", async () => {
    const insertChain = makeChain(undefined);
    dbMock.insert.mockReturnValue(insertChain);

    await upsertUser({ openId: "google:2", name: "Bob" });

    const [values] = insertChain.__calls.values[0];
    expect(values).not.toHaveProperty("role");
    const [updateArg] = insertChain.__calls.onDuplicateKeyUpdate[0];
    expect(updateArg.set).not.toHaveProperty("role");
  });
});

describe("getOrderBySessionId", () => {
  it("returns undefined when no order matches", async () => {
    dbMock.select.mockReturnValue(makeChain([]));
    const result = await getOrderBySessionId("missing-session");
    expect(result).toBeUndefined();
  });

  it("returns the order when found", async () => {
    dbMock.select.mockReturnValue(makeChain([sampleOrder]));
    const result = await getOrderBySessionId("cs_test_1");
    expect(result).toEqual(sampleOrder);
  });
});

describe("createOrder", () => {
  it("inserts the order data", async () => {
    const insertChain = makeChain(undefined);
    dbMock.insert.mockReturnValue(insertChain);

    await createOrder({
      stripeSessionId: "cs_test_2",
      status: "pending",
      amountTotal: 5000,
      currency: "chf",
      productIds: "3,4",
    });

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(insertChain.__calls.values[0][0]).toMatchObject({
      stripeSessionId: "cs_test_2",
      amountTotal: 5000,
      productIds: "3,4",
    });
  });
});

describe("updateOrderBySessionId", () => {
  it("updates the matching order", async () => {
    const updateChain = makeChain(undefined);
    dbMock.update.mockReturnValue(updateChain);

    await updateOrderBySessionId("cs_test_1", { status: "paid" });

    expect(dbMock.update).toHaveBeenCalledTimes(1);
    expect(updateChain.__calls.set[0][0]).toEqual({ status: "paid" });
    expect(updateChain.__calls.where).toHaveLength(1);
  });
});

describe("markProductsSold", () => {
  it("does nothing for an empty id list", async () => {
    await markProductsSold(1, []);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("issues a single update touching quantity and sold for the given ids", async () => {
    const updateChain = makeChain(undefined);
    dbMock.update.mockReturnValue(updateChain);

    await markProductsSold(1, [1, 2, 3]);

    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const [setArg] = updateChain.__calls.set[0];
    expect(setArg).toHaveProperty("quantity");
    expect(setArg).toHaveProperty("sold");
    expect(updateChain.__calls.where).toHaveLength(1);
  });

  it("clears any checkout hold on the sold pieces", async () => {
    const updateChain = makeChain(undefined);
    dbMock.update.mockReturnValue(updateChain);

    await markProductsSold(1, [1]);

    const [setArg] = updateChain.__calls.set[0];
    expect(setArg).toMatchObject({ reservedUntil: null, reservedToken: null });
  });
});

describe("reserveProducts", () => {
  it("does nothing for an empty id list", async () => {
    const result = await reserveProducts(1, []);
    expect(result).toEqual([]);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("returns no failures when every id comes back claimed with our token", async () => {
    const updateChain = makeChain(undefined);
    dbMock.update.mockReturnValue(updateChain);
    // The follow-up SELECT reflects rows matching the token this call wrote —
    // simulate all three ids having been successfully claimed.
    dbMock.select.mockReturnValue(makeChain([{ id: 1 }, { id: 2 }, { id: 3 }]));

    const failed = await reserveProducts(1, [1, 2, 3]);

    expect(failed).toEqual([]);
    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const [setArg] = updateChain.__calls.set[0];
    expect(setArg).toHaveProperty("reservedUntil");
    expect(setArg).toHaveProperty("reservedToken");
  });

  it("reports ids that didn't come back with our token as failed", async () => {
    dbMock.update.mockReturnValue(makeChain(undefined));
    // Only id 1 matched our token in the follow-up read — id 2 is held by
    // someone else's still-live reservation (or already sold out).
    dbMock.select.mockReturnValue(makeChain([{ id: 1 }]));

    const failed = await reserveProducts(1, [1, 2]);

    expect(failed).toEqual([2]);
  });

  it("treats a missing database as a total failure to reserve", async () => {
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const fresh = await import("./db");

    const failed = await fresh.reserveProducts(1, [1, 2]);
    expect(failed).toEqual([1, 2]);

    process.env.DATABASE_URL = originalUrl;
  });
});

describe("releaseProductReservations", () => {
  it("does nothing for an empty id list", async () => {
    await releaseProductReservations(1, []);
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("clears reservedUntil/reservedToken for the given ids", async () => {
    const updateChain = makeChain(undefined);
    dbMock.update.mockReturnValue(updateChain);

    await releaseProductReservations(1, [1, 2]);

    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const [setArg] = updateChain.__calls.set[0];
    expect(setArg).toEqual({ reservedUntil: null, reservedToken: null });
  });
});

describe("getTenantAdminContact", () => {
  it("returns undefined when no admin row matches", async () => {
    dbMock.select.mockReturnValue(makeChain([]));
    const result = await getTenantAdminContact(1);
    expect(result).toBeUndefined();
  });

  it("returns the earliest admin's name and email", async () => {
    dbMock.select.mockReturnValue(
      makeChain([{ name: "Sheena Arora", email: "sheena@example.com" }]),
    );
    const result = await getTenantAdminContact(1);
    expect(result).toEqual({
      name: "Sheena Arora",
      email: "sheena@example.com",
    });
  });

  it("returns a null name for a still-pending (unclaimed) admin row", async () => {
    dbMock.select.mockReturnValue(
      makeChain([{ name: null, email: "sheena@example.com" }]),
    );
    const result = await getTenantAdminContact(1);
    expect(result).toEqual({ name: null, email: "sheena@example.com" });
  });
});

describe("getVisibleProducts", () => {
  it("returns an empty list when the database is unavailable", async () => {
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    // Force a fresh module without a cached db connection.
    vi.resetModules();
    const fresh = await import("./db");
    const result = await fresh.getVisibleProducts();
    expect(result).toEqual([]);

    process.env.DATABASE_URL = originalUrl;
  });
});

describe("insertBulkUploadLog", () => {
  it("inserts the log entry", async () => {
    const insertChain = makeChain(undefined);
    dbMock.insert.mockReturnValue(insertChain);

    await insertBulkUploadLog({
      operation: "create",
      ref: "msg-123",
      errorMessage: "",
    });

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(insertChain.__calls.values[0][0]).toMatchObject({
      operation: "create",
      ref: "msg-123",
    });
  });
});

describe("setTenantCompByOperator", () => {
  function withExistingTenant() {
    const updateChain = makeChain(undefined);
    dbMock.select.mockReturnValue(makeChain([{ id: 42 }]));
    dbMock.update.mockReturnValue(updateChain);
    return updateChain;
  }

  it("writes the grant, its reason, and who granted it", async () => {
    const updateChain = withExistingTenant();

    const ok = await setTenantCompByOperator({
      tenantId: 42,
      plan: "pro",
      feeWaived: true,
      note: "design partner",
      grantedByUserId: 9,
    });

    expect(ok).toBe(true);
    const [setArg] = updateChain.__calls.set[0];
    expect(setArg).toMatchObject({
      compPlan: "pro",
      compFeeWaived: true,
      compNote: "design partner",
      compGrantedBy: 9,
    });
    expect(setArg.compGrantedAt).toBeInstanceOf(Date);
  });

  // The whole reason comps live in their own columns: `plan` is Stripe's,
  // and a late subscription webhook writing it must not revoke the grant.
  it("never touches the store's own paid plan", async () => {
    const updateChain = withExistingTenant();
    await setTenantCompByOperator({
      tenantId: 42,
      plan: "pro",
      feeWaived: false,
    });
    const [setArg] = updateChain.__calls.set[0];
    expect(setArg).not.toHaveProperty("plan");
    expect(setArg).not.toHaveProperty("stripeSubscriptionId");
    expect(setArg).not.toHaveProperty("subscriptionStatus");
  });

  it("clears the provenance when the comp is revoked", async () => {
    const updateChain = withExistingTenant();
    await setTenantCompByOperator({
      tenantId: 42,
      plan: null,
      feeWaived: false,
      note: "ignored on revoke",
      grantedByUserId: 9,
    });
    expect(updateChain.__calls.set[0][0]).toEqual({
      compPlan: null,
      compFeeWaived: false,
      compNote: null,
      compGrantedAt: null,
      compGrantedBy: null,
    });
  });

  it("keeps the provenance when only the plan half is dropped", async () => {
    const updateChain = withExistingTenant();
    await setTenantCompByOperator({
      tenantId: 42,
      plan: null,
      feeWaived: true,
      note: "fee only",
    });
    const [setArg] = updateChain.__calls.set[0];
    expect(setArg.compNote).toBe("fee only");
    expect(setArg.compGrantedAt).toBeInstanceOf(Date);
  });

  it("stores a blank note as null rather than an empty string", async () => {
    const updateChain = withExistingTenant();
    await setTenantCompByOperator({
      tenantId: 42,
      plan: "pro",
      feeWaived: false,
      note: "   ",
    });
    expect(updateChain.__calls.set[0][0].compNote).toBeNull();
  });

  it("reports a store that does not exist, and writes nothing", async () => {
    dbMock.select.mockReturnValue(makeChain([]));
    const ok = await setTenantCompByOperator({
      tenantId: 999,
      plan: "pro",
      feeWaived: true,
    });
    expect(ok).toBe(false);
    expect(dbMock.update).not.toHaveBeenCalled();
  });
});

describe("DB operation timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects a write once it hangs past the timeout instead of blocking forever", async () => {
    dbMock.insert.mockReturnValue(makeHangingChain());

    const promise = createProduct({
      name: "Stuck Product",
      description: "A product whose insert never resolves",
      price: "10.00",
      category: "Rings",
      visible: true,
      source: "manual",
    } as Parameters<typeof createProduct>[0]);
    const assertion = expect(promise).rejects.toThrow(
      "Database operation timed out",
    );

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    // The whole point: a timed-out query destroys its connection instead of
    // leaving it (and whatever it was doing server-side) orphaned. (The
    // plan-capacity lookup that precedes the insert is a normal read on its
    // own connection, which is released — only the hung write is destroyed.)
    expect(mockConnection.destroy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default for a read that hangs past the timeout", async () => {
    dbMock.select.mockReturnValue(makeHangingChain());

    const promise = getOrderBySessionId("cs_test_stuck");
    const assertion = expect(promise).resolves.toBeUndefined();

    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;

    expect(mockConnection.destroy).toHaveBeenCalledTimes(1);
    expect(mockConnection.release).not.toHaveBeenCalled();
  });

  it("releases (not destroys) the connection when the query finishes in time", async () => {
    dbMock.select.mockReturnValue(makeChain([sampleOrder]));

    const result = await getOrderBySessionId("cs_test_1");

    expect(result).toEqual(sampleOrder);
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
    expect(mockConnection.destroy).not.toHaveBeenCalled();
  });
});
