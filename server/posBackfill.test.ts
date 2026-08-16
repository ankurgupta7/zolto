import { describe, expect, it, vi, beforeEach } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    getAllProducts: vi.fn(),
    getPaidPosOrdersMissingLineItems: vi.fn(),
    getTenantById: vi.fn(),
    insertPosOrderItems: vi.fn(),
    setPosOrderInvoiceNumber: vi.fn(),
  },
}));

const TENANT_ID = 7;

vi.mock("./db", () => dbMock);
vi.mock("./stripe", () => ({ getStripe: vi.fn().mockReturnValue(null) }));

import { getStripe } from "./stripe";

import {
  backfillPosLineItems,
  matchNamesToProducts,
  parsePosSaleDescription,
  reconstructLineItems,
} from "./posBackfill";
import { buildPosSaleDescription } from "./pos";

const CATALOGUE = [
  { id: 1, name: "Pearl Ring", price: "100.00" },
  { id: 2, name: "Silver Cuff", price: "50.00" },
  { id: 3, name: "Ring, oxidised", price: "80.00" },
];

// ─── Parsing ─────────────────────────────────────────────────────────────────

describe("parsePosSaleDescription", () => {
  it("reads back the names a sale description lists", () => {
    expect(
      parsePosSaleDescription("POS sale: Pearl Ring, Silver Cuff"),
    ).toEqual({
      names: [
        { name: "Pearl Ring", quantity: 1 },
        { name: "Silver Cuff", quantity: 1 },
      ],
      omittedCount: 0,
      truncated: false,
    });
  });

  it("expands the ×N multiplier the description collapses duplicates into", () => {
    const parsed = parsePosSaleDescription("POS sale: Pearl Ring ×3");
    expect(parsed?.names).toEqual([{ name: "Pearl Ring", quantity: 3 }]);
  });

  it("records how many items the description had no room to name", () => {
    const parsed = parsePosSaleDescription("POS sale: Pearl Ring +4 more");
    expect(parsed?.names).toEqual([{ name: "Pearl Ring", quantity: 1 }]);
    expect(parsed?.omittedCount).toBe(4);
  });

  it("flags a name that was hard-truncated to fit", () => {
    expect(
      parsePosSaleDescription("POS sale: Averylongname… +1 more")?.truncated,
    ).toBe(true);
  });

  it("accepts the bare prefix a nameless basket produces", () => {
    expect(parsePosSaleDescription("POS sale")).toEqual({
      names: [],
      omittedCount: 0,
      truncated: false,
    });
  });

  // A merchant's own note on a payment must never be read as a basket.
  it("refuses a description this app did not write", () => {
    expect(parsePosSaleDescription("Invoice 42")).toBeNull();
    expect(parsePosSaleDescription("POS sales figures")).toBeNull();
    expect(parsePosSaleDescription(null)).toBeNull();
    expect(parsePosSaleDescription(undefined)).toBeNull();
  });

  // Parsing splits on ", " and stops there: a name containing a comma of its
  // own arrives as two segments, and only the catalogue can put it back
  // together (see matchNamesToProducts). Pinned so the division of labour is
  // deliberate rather than an accident nobody noticed.
  it("leaves a comma'd name split for the matcher to rejoin", () => {
    expect(parsePosSaleDescription("POS sale: Ring, oxidised")?.names).toEqual([
      { name: "Ring", quantity: 1 },
      { name: "oxidised", quantity: 1 },
    ]);
  });

  it("round-trips a basket long enough to be truncated, and says it was", () => {
    const many = Array.from({ length: 40 }, (_, i) => `Long piece name ${i}`);
    const parsed = parsePosSaleDescription(buildPosSaleDescription(many));
    expect(parsed).not.toBeNull();
    expect(parsed!.omittedCount).toBeGreaterThan(0);
    expect(parsed!.names.length).toBeLessThan(many.length);
  });
});

// ─── Matching ────────────────────────────────────────────────────────────────

describe("matchNamesToProducts", () => {
  it("matches names to catalogue products", () => {
    const { matched, unmatched } = matchNamesToProducts(
      [
        { name: "Pearl Ring", quantity: 2 },
        { name: "Silver Cuff", quantity: 1 },
      ],
      CATALOGUE,
    );
    expect(matched.map((m) => [m.product.id, m.quantity])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(unmatched).toEqual([]);
  });

  it("ignores case and stray whitespace", () => {
    const { matched } = matchNamesToProducts(
      [{ name: "  pearl   ring ", quantity: 1 }],
      CATALOGUE,
    );
    expect(matched[0]?.product.id).toBe(1);
  });

  // The description joins names with ", " and a name may contain a comma, so
  // the catalogue — not the punctuation — has to decide where an item ends.
  it("rejoins a name that itself contains the separator", () => {
    const parsed = parsePosSaleDescription("POS sale: Ring, oxidised");
    const { matched, unmatched } = matchNamesToProducts(
      parsed!.names,
      CATALOGUE,
    );
    expect(matched.map((m) => m.product.id)).toEqual([3]);
    expect(unmatched).toEqual([]);
  });

  it("rejoins a comma'd name sitting beside other items", () => {
    const parsed = parsePosSaleDescription(
      "POS sale: Pearl Ring, Ring, oxidised, Silver Cuff",
    );
    const { matched, unmatched } = matchNamesToProducts(
      parsed!.names,
      CATALOGUE,
    );
    expect(matched.map((m) => m.product.id)).toEqual([1, 3, 2]);
    expect(unmatched).toEqual([]);
  });

  // The real contract of the pair: whatever buildPosSaleDescription emits for
  // a basket, parse + match must give that basket back.
  it("round-trips every basket buildPosSaleDescription can write", () => {
    const baskets: Array<[string[], number[]]> = [
      [["Pearl Ring"], [1]],
      [
        ["Pearl Ring", "Silver Cuff"],
        [1, 2],
      ],
      [
        ["Pearl Ring", "Pearl Ring", "Silver Cuff"],
        [1, 2],
      ],
      [["Ring, oxidised"], [3]],
      [
        ["Pearl Ring", "Ring, oxidised", "Silver Cuff"],
        [1, 3, 2],
      ],
    ];
    for (const [basket, expectedIds] of baskets) {
      const parsed = parsePosSaleDescription(buildPosSaleDescription(basket));
      const { matched, unmatched } = matchNamesToProducts(
        parsed!.names,
        CATALOGUE,
      );
      expect(
        matched.map((m) => m.product.id),
        basket.join(" | "),
      ).toEqual(expectedIds);
      expect(unmatched, basket.join(" | ")).toEqual([]);
      // Units recovered must equal units sold, multipliers included.
      expect(
        matched.reduce((n, m) => n + m.quantity, 0),
        basket.join(" | "),
      ).toBe(basket.length);
    }
  });

  it("reports a name the catalogue no longer has", () => {
    const { matched, unmatched } = matchNamesToProducts(
      [
        { name: "Pearl Ring", quantity: 1 },
        { name: "Deleted piece", quantity: 1 },
      ],
      CATALOGUE,
    );
    expect(matched.map((m) => m.product.id)).toEqual([1]);
    expect(unmatched).toEqual(["Deleted piece"]);
  });
});

// ─── Reconstruction ──────────────────────────────────────────────────────────

describe("reconstructLineItems", () => {
  const parse = (d: string) => parsePosSaleDescription(d);

  // A single item was charged the order total by definition — which is how a
  // bargained one-item sale still reconciles exactly.
  it("prices a single item at the order total, bargained or not", () => {
    const outcome = reconstructLineItems(
      parse("POS sale: Pearl Ring"),
      CATALOGUE,
      8500, // haggled down from the CHF 100.00 list price
    );
    expect(outcome).toEqual({
      status: "exact",
      lines: [{ productId: 1, name: null, priceRappen: 8500 }],
    });
  });

  it("prices several items from the catalogue when they sum to the total", () => {
    const outcome = reconstructLineItems(
      parse("POS sale: Pearl Ring, Silver Cuff"),
      CATALOGUE,
      15000,
    );
    expect(outcome).toEqual({
      status: "exact",
      lines: [
        { productId: 1, name: null, priceRappen: 10000 },
        { productId: 2, name: null, priceRappen: 5000 },
      ],
    });
  });

  it("expands ×N back into one line per unit sold", () => {
    const outcome = reconstructLineItems(
      parse("POS sale: Silver Cuff ×3"),
      CATALOGUE,
      15000,
    );
    expect(outcome.status).toBe("exact");
    expect(outcome.status === "exact" && outcome.lines).toHaveLength(3);
  });

  // The whole point of the exercise: names are recoverable, prices are not.
  it("refuses to price a bargained multi-item sale, but keeps the names", () => {
    const outcome = reconstructLineItems(
      parse("POS sale: Pearl Ring, Silver Cuff"),
      CATALOGUE,
      13000, // list prices total 150.00
    );
    expect(outcome.status).toBe("unpriced");
    expect(outcome.status === "unpriced" && outcome.names).toEqual([
      "Pearl Ring",
      "Silver Cuff",
    ]);
    expect(outcome.status === "unpriced" && outcome.reason).toContain(
      "probably bargained",
    );
  });

  it("refuses a basket the description had to shorten", () => {
    const outcome = reconstructLineItems(
      parse("POS sale: Pearl Ring +2 more"),
      CATALOGUE,
      10000,
    );
    expect(outcome.status).toBe("unpriced");
    expect(outcome.status === "unpriced" && outcome.reason).toContain(
      "omitted",
    );
  });

  it("refuses a basket naming something the catalogue no longer has", () => {
    const outcome = reconstructLineItems(
      parse("POS sale: Pearl Ring, Deleted piece"),
      CATALOGUE,
      15000,
    );
    expect(outcome.status).toBe("unpriced");
    expect(outcome.status === "unpriced" && outcome.reason).toContain(
      "Deleted piece",
    );
  });

  it("gives up on a description that is not ours or names nothing", () => {
    expect(reconstructLineItems(null, CATALOGUE, 100).status).toBe(
      "unresolved",
    );
    expect(reconstructLineItems(parse("POS sale"), CATALOGUE, 100).status).toBe(
      "unresolved",
    );
  });
});

// ─── The run ─────────────────────────────────────────────────────────────────

function order(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 9,
    invoiceNumber: null,
    stripePaymentIntentId: "pi_1",
    totalRappen: 10000,
    createdAt: new Date("2026-08-16T12:14:47Z"),
    ...over,
  };
}

const intent = (description: string | null) => ({ description }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getAllProducts.mockResolvedValue(CATALOGUE);
  dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([]);
  dbMock.insertPosOrderItems.mockResolvedValue(undefined);
  dbMock.setPosOrderInvoiceNumber.mockResolvedValue(undefined);
  dbMock.getTenantById.mockResolvedValue({ id: TENANT_ID });
});

describe("backfillPosLineItems", () => {
  it("previews without writing anything unless told otherwise", async () => {
    dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([order()]);

    const summary = await backfillPosLineItems(TENANT_ID, {
      retrievePaymentIntent: async () => intent("POS sale: Pearl Ring"),
    });

    expect(summary.dryRun).toBe(true);
    expect(summary.restored).toBe(1);
    expect(summary.lineItemsWritten).toBe(1);
    expect(summary.invoiceNumbersFilled).toBe(1);
    // Reported, not written.
    expect(dbMock.insertPosOrderItems).not.toHaveBeenCalled();
    expect(dbMock.setPosOrderInvoiceNumber).not.toHaveBeenCalled();
  });

  it("writes the reconstructed lines and the invoice number when applied", async () => {
    dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([order()]);

    const summary = await backfillPosLineItems(TENANT_ID, {
      dryRun: false,
      retrievePaymentIntent: async () => intent("POS sale: Pearl Ring"),
    });

    expect(summary.restored).toBe(1);
    expect(dbMock.insertPosOrderItems).toHaveBeenCalledWith(TENANT_ID, [
      { posOrderId: 9, productId: 1, name: null, priceRappen: 10000 },
    ]);
    expect(dbMock.setPosOrderInvoiceNumber).toHaveBeenCalledWith(
      TENANT_ID,
      9,
      "KPOS-9",
    );
  });

  it("leaves an existing invoice number alone", async () => {
    dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([
      order({ invoiceNumber: "KPOS-9" }),
    ]);

    const summary = await backfillPosLineItems(TENANT_ID, {
      dryRun: false,
      retrievePaymentIntent: async () => intent("POS sale: Pearl Ring"),
    });

    expect(summary.invoiceNumbersFilled).toBe(0);
    expect(dbMock.setPosOrderInvoiceNumber).not.toHaveBeenCalled();
  });

  // Cash never touched Stripe, so there is no description to read — the run
  // says so rather than quietly counting it as nothing to do.
  it("counts cash sales as unrecoverable and still gives them a reference", async () => {
    dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([
      order({ stripePaymentIntentId: null }),
    ]);
    const retrieve = vi.fn();

    const summary = await backfillPosLineItems(TENANT_ID, {
      dryRun: false,
      retrievePaymentIntent: retrieve,
    });

    expect(retrieve).not.toHaveBeenCalled();
    expect(summary.cashUnrecoverable).toBe(1);
    expect(summary.restored).toBe(0);
    expect(summary.skipped[0].reason).toContain("cash sale");
    expect(dbMock.setPosOrderInvoiceNumber).toHaveBeenCalledWith(
      TENANT_ID,
      9,
      "KPOS-9",
    );
  });

  it("reports the names of a sale it could not price, and writes nothing for it", async () => {
    dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([
      order({ totalRappen: 13000 }),
    ]);

    const summary = await backfillPosLineItems(TENANT_ID, {
      dryRun: false,
      retrievePaymentIntent: async () =>
        intent("POS sale: Pearl Ring, Silver Cuff"),
    });

    expect(summary.restored).toBe(0);
    expect(dbMock.insertPosOrderItems).not.toHaveBeenCalled();
    expect(summary.skipped[0]).toMatchObject({
      posOrderId: 9,
      totalChf: "130.00",
      names: ["Pearl Ring", "Silver Cuff"],
    });
  });

  it("survives a payment Stripe will not hand back", async () => {
    dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([order()]);

    const summary = await backfillPosLineItems(TENANT_ID, {
      retrievePaymentIntent: async () => null,
    });

    expect(summary.withStripePayment).toBe(1);
    expect(summary.restored).toBe(0);
    expect(summary.skipped).toHaveLength(1);
  });

  // A repair must never reach past the store that asked for it.
  it("reads and writes only the store it was asked to repair", async () => {
    dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([order()]);

    await backfillPosLineItems(TENANT_ID, {
      dryRun: false,
      retrievePaymentIntent: async () => intent("POS sale: Pearl Ring"),
    });

    expect(dbMock.getPaidPosOrdersMissingLineItems).toHaveBeenCalledWith(
      TENANT_ID,
      expect.any(Number),
    );
    expect(dbMock.getAllProducts).toHaveBeenCalledWith(TENANT_ID);
    expect(dbMock.insertPosOrderItems).toHaveBeenCalledWith(
      TENANT_ID,
      expect.anything(),
    );
  });

  it("summarises a mixed run", async () => {
    dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([
      order({ id: 1, stripePaymentIntentId: "pi_a", totalRappen: 10000 }),
      order({ id: 2, stripePaymentIntentId: "pi_b", totalRappen: 13000 }),
      order({ id: 3, stripePaymentIntentId: null, totalRappen: 5000 }),
    ]);
    const descriptions: Record<string, string> = {
      pi_a: "POS sale: Pearl Ring",
      pi_b: "POS sale: Pearl Ring, Silver Cuff",
    };

    const summary = await backfillPosLineItems(TENANT_ID, {
      dryRun: false,
      retrievePaymentIntent: async (id) => intent(descriptions[id] ?? null),
    });

    expect(summary).toMatchObject({
      scanned: 3,
      withStripePayment: 2,
      cashUnrecoverable: 1,
      restored: 1,
      lineItemsWritten: 1,
      invoiceNumbersFilled: 3,
      dryRun: false,
    });
    expect(summary.skipped.map((s) => s.posOrderId)).toEqual([2, 3]);
  });
});

/**
 * A store that connected its own Stripe account took its card payments THERE.
 * Retrieving those ids from the platform account finds nothing, which looks
 * exactly like "no description to recover from" — a silent, total no-op.
 */
describe("backfillPosLineItems — which Stripe account it reads", () => {
  function fakeStripe() {
    return {
      paymentIntents: {
        retrieve: vi
          .fn()
          .mockResolvedValue({ description: "POS sale: Pearl Ring" }),
      },
    };
  }

  beforeEach(() => {
    dbMock.getPaidPosOrdersMissingLineItems.mockResolvedValue([order()]);
  });

  it("reads from the store's connected account when it has one", async () => {
    const stripe = fakeStripe();
    vi.mocked(getStripe).mockReturnValue(stripe as never);
    dbMock.getTenantById.mockResolvedValue({
      id: TENANT_ID,
      stripeConnectedAccountId: "acct_theirs",
    });

    const summary = await backfillPosLineItems(TENANT_ID);

    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      "pi_1",
      undefined,
      { stripeAccount: "acct_theirs" },
    );
    expect(summary.restored).toBe(1);
  });

  it("reads from the platform account when the store has not connected one", async () => {
    const stripe = fakeStripe();
    vi.mocked(getStripe).mockReturnValue(stripe as never);
    dbMock.getTenantById.mockResolvedValue({
      id: TENANT_ID,
      stripeConnectedAccountId: null,
    });

    await backfillPosLineItems(TENANT_ID);

    expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      "pi_1",
      undefined,
      undefined,
    );
  });

  it("reports rather than throws when Stripe rejects the lookup", async () => {
    const stripe = fakeStripe();
    stripe.paymentIntents.retrieve.mockRejectedValue(new Error("no such pi"));
    vi.mocked(getStripe).mockReturnValue(stripe as never);

    const summary = await backfillPosLineItems(TENANT_ID);

    expect(summary.restored).toBe(0);
    expect(summary.skipped).toHaveLength(1);
  });

  it("does nothing at all when Stripe is not configured", async () => {
    vi.mocked(getStripe).mockReturnValue(null as never);

    const summary = await backfillPosLineItems(TENANT_ID);

    expect(summary.restored).toBe(0);
    expect(summary.withStripePayment).toBe(1);
  });
});
