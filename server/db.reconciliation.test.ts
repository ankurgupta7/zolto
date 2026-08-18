import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";

function makeChain(result: unknown) {
  const calls: Record<string, unknown[][]> = {};
  const chain: any = { __calls: calls };
  const methods = [
    "from",
    "innerJoin",
    "where",
    "limit",
    "orderBy",
    "set",
    "values",
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

function makeTxMock() {
  const tx = {
    insert: vi.fn(),
    update: vi.fn(),
  };
  return tx;
}

// withTimeout() checks out a dedicated connection per call so it can
// destroy() it if the call times out — see server/db.ts. The mock
// connection just needs release()/destroy() so that code path doesn't throw.
const mockConnection = { release: vi.fn(), destroy: vi.fn() };

const dbMock = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
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
  createStripeReconciliation,
  getAvailableProductsForMatching,
  getKnownOrderPaymentIntentIds,
  getKnownPosPaymentIntentIds,
  getKnownReconciliationPaymentIntentIds,
  getPendingPosAttributions,
  getPendingStripeReconciliations,
  getPosAttributionById,
  getStripeReconciliationById,
  getStripeReconciliationByToken,
  rejectStripeReconciliation,
  resolveStripeReconciliationConfirmed,
} from "./db";

beforeAll(() => {
  process.env.DATABASE_URL = "mysql://test:test@localhost:3306/test";
});

beforeEach(() => {
  dbMock.select.mockReset();
  dbMock.insert.mockReset();
  dbMock.update.mockReset();
  dbMock.delete.mockReset();
  dbMock.transaction.mockReset();
  mockConnection.release.mockReset();
  mockConnection.destroy.mockReset();
  dbMock.$client.getConnection.mockClear();
  dbMock.$client.getConnection.mockImplementation(
    (cb: (err: unknown, conn: unknown) => void) => cb(null, mockConnection),
  );
});

describe("getAvailableProductsForMatching", () => {
  it("returns the products from the query", async () => {
    const products = [{ id: 1, price: "100.00" }];
    dbMock.select.mockReturnValue(makeChain(products));
    const result = await getAvailableProductsForMatching();
    expect(result).toEqual(products);
  });
});

describe("getKnownOrderPaymentIntentIds", () => {
  it("returns a set of non-null payment intent ids", async () => {
    dbMock.select.mockReturnValue(makeChain([{ id: "pi_1" }, { id: "pi_2" }]));
    const result = await getKnownOrderPaymentIntentIds();
    expect(result).toEqual(new Set(["pi_1", "pi_2"]));
  });
});

describe("getKnownPosPaymentIntentIds", () => {
  it("returns a set of pos order payment intent ids", async () => {
    dbMock.select.mockReturnValue(makeChain([{ id: "pi_pos_1" }]));
    const result = await getKnownPosPaymentIntentIds();
    expect(result).toEqual(new Set(["pi_pos_1"]));
  });
});

describe("getKnownReconciliationPaymentIntentIds", () => {
  it("returns a set of already-recorded reconciliation payment intent ids", async () => {
    dbMock.select.mockReturnValue(makeChain([{ id: "pi_r_1" }]));
    const result = await getKnownReconciliationPaymentIntentIds();
    expect(result).toEqual(new Set(["pi_r_1"]));
  });
});

describe("getPendingStripeReconciliations", () => {
  it("returns the rows still awaiting a decision, newest payment first", async () => {
    const row = { id: 1, stripePaymentIntentId: "pi_1" };
    const chain = makeChain([row]);
    dbMock.select.mockReturnValue(chain);

    const result = await getPendingStripeReconciliations(42, 10);

    expect(result).toEqual([row]);
    // Scoped to the tenant AND filtered to pending_review — a confirmed or
    // rejected payment must never come back round for a second decision, and
    // one store's backlog must never surface in another's console.
    expect(chain.__calls.where).toHaveLength(1);
    expect(chain.__calls.orderBy).toHaveLength(1);
    expect(chain.__calls.limit[0]).toEqual([10]);
  });

  it("falls back to an empty list when the database is unavailable", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("no db");
    });
    expect(await getPendingStripeReconciliations(42)).toEqual([]);
  });
});

// The in-person sibling: same "still waiting on the merchant" query, joined
// back to the POS line so the review can be rebuilt with its date and label.
// The console addresses a row by id rather than by mailed token, so the tenant
// predicate on these reads is what replaces the token's secrecy. Ids are
// sequential and guessable.
describe("by-id lookups are tenant-scoped", () => {
  it("asks for the reconciliation by id AND tenant", async () => {
    const row = { id: 3, tenantId: 42 };
    const chain = makeChain([row]);
    dbMock.select.mockReturnValue(chain);

    expect(await getStripeReconciliationById(42, 3)).toEqual(row);
    // One combined predicate — an id-only lookup would answer for any store.
    expect(chain.__calls.where).toHaveLength(1);
    expect(chain.__calls.limit[0]).toEqual([1]);
  });

  it("returns undefined when the row belongs to another store", async () => {
    dbMock.select.mockReturnValue(makeChain([]));
    expect(await getStripeReconciliationById(42, 3)).toBeUndefined();
    expect(await getPosAttributionById(42, 5)).toBeUndefined();
  });

  it("asks for the attribution by id AND tenant", async () => {
    const row = { id: 5, tenantId: 42 };
    const chain = makeChain([row]);
    dbMock.select.mockReturnValue(chain);

    expect(await getPosAttributionById(42, 5)).toEqual(row);
    expect(chain.__calls.where).toHaveLength(1);
  });
});

describe("getPendingPosAttributions", () => {
  it("returns the queued attributions still awaiting a decision", async () => {
    const row = { posOrderItemId: 900, amountRappen: 4500 };
    const chain = makeChain([row]);
    dbMock.select.mockReturnValue(chain);

    const result = await getPendingPosAttributions(42, 10);

    expect(result).toEqual([row]);
    // Joined to the line, scoped to the tenant, filtered to pending_review —
    // a confirmed or rejected sale must never come back for a second decision.
    expect(chain.__calls.innerJoin).toHaveLength(1);
    expect(chain.__calls.where).toHaveLength(1);
    expect(chain.__calls.limit[0]).toEqual([10]);
  });

  it("falls back to an empty list when the database is unavailable", async () => {
    dbMock.select.mockImplementation(() => {
      throw new Error("no db");
    });
    expect(await getPendingPosAttributions(42)).toEqual([]);
  });
});

describe("createStripeReconciliation", () => {
  it("inserts the reconciliation row", async () => {
    const insertChain = makeChain(undefined);
    dbMock.insert.mockReturnValue(insertChain);

    await createStripeReconciliation({
      stripePaymentIntentId: "pi_1",
      amountRappen: 10000,
      currency: "chf",
      stripeCreatedAt: new Date(),
      candidateProductIds: "1,2",
      confirmationToken: "tok",
      status: "pending_review",
    });

    expect(dbMock.insert).toHaveBeenCalledTimes(1);
    expect(insertChain.__calls.values[0][0]).toMatchObject({
      stripePaymentIntentId: "pi_1",
      candidateProductIds: "1,2",
    });
  });
});

describe("getStripeReconciliationByToken", () => {
  it("returns undefined when no row matches", async () => {
    dbMock.select.mockReturnValue(makeChain([]));
    expect(await getStripeReconciliationByToken("missing")).toBeUndefined();
  });

  it("returns the row when found", async () => {
    const row = { id: 1, confirmationToken: "tok" };
    dbMock.select.mockReturnValue(makeChain([row]));
    expect(await getStripeReconciliationByToken("tok")).toEqual(row);
  });
});

describe("rejectStripeReconciliation", () => {
  it("marks the row rejected and resolved", async () => {
    const updateChain = makeChain(undefined);
    dbMock.update.mockReturnValue(updateChain);

    await rejectStripeReconciliation(5);

    expect(dbMock.update).toHaveBeenCalledTimes(1);
    const [setArg] = updateChain.__calls.set[0];
    expect(setArg.status).toBe("rejected");
    expect(setArg.resolvedAt).toBeInstanceOf(Date);
  });
});

describe("resolveStripeReconciliationConfirmed", () => {
  it("inserts the sale, decrements stock, and marks the reconciliation confirmed inside one transaction", async () => {
    const tx = makeTxMock();
    const insertPosOrderChain = makeChain({ insertId: 42 });
    const insertItemChain = makeChain(undefined);
    const updateProductChain = makeChain(undefined);
    const updateReconChain = makeChain(undefined);

    tx.insert
      .mockReturnValueOnce(insertPosOrderChain)
      .mockReturnValueOnce(insertItemChain);
    tx.update
      .mockReturnValueOnce(updateProductChain)
      .mockReturnValueOnce(updateReconChain);

    dbMock.transaction.mockImplementation(
      async (cb: (tx: unknown) => unknown) => cb(tx),
    );

    await resolveStripeReconciliationConfirmed(9, 3, 10000, "pi_1");

    expect(dbMock.transaction).toHaveBeenCalledTimes(1);
    expect(insertPosOrderChain.__calls.values[0][0]).toMatchObject({
      stripePaymentIntentId: "pi_1",
      status: "paid",
      totalRappen: 10000,
    });
    expect(insertItemChain.__calls.values[0][0]).toMatchObject({
      posOrderId: 42,
      productId: 3,
      priceRappen: 10000,
    });
    expect(updateReconChain.__calls.set[0][0]).toMatchObject({
      status: "confirmed",
      chosenProductId: 3,
    });
  });
});
