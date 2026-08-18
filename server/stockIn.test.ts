/**
 * Tests for the inbound Stock In lane.
 *
 * The three that carry the design:
 *
 *  - `parseDelta` refuses a fraction rather than rounding it. `quantity` counts
 *    physical objects; guessing is not available.
 *  - `applyStockIn` refuses a hash that no longer matches the tab, so an
 *    approval can only write the rows that were looked at…
 *  - …but the hash covers the SHEET only, so a sale landing between review and
 *    approval does NOT void it. That asymmetry is the whole reason quantities
 *    are deltas, and a test that got it backwards would quietly undo it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  applyStockInChanges: vi.fn(),
  getAllProducts: vi.fn(),
  getSheetMirror: vi.fn(),
  insertAuditLog: vi.fn(),
}));
vi.mock("./db", () => dbMock);

const sheetsMock = vi.hoisted(() => ({
  a1: (tab: string, range: string) => `'${tab}'!${range}`,
  readValues: vi.fn(),
  writeValues: vi.fn(),
}));
vi.mock("./googleSheets", () => sheetsMock);

const mirrorMock = vi.hoisted(() => ({
  STOCK_IN_TAB: "Stock In",
  STOCK_IN_FIRST_DATA_ROW: 3,
  syncSheetMirror: vi.fn(),
}));
vi.mock("./sheetMirror", () => mirrorMock);

import {
  MAX_ABS_DELTA,
  StockInConflictError,
  applyStockIn,
  diffStockInRows,
  parseDelta,
  parsePrice,
  previewStockIn,
  stockInHash,
} from "./stockIn";

const TENANT = 7;

const CATALOGUE = [
  { id: 1, name: "Silver ring", quantity: 3, price: "45.00" },
  { id: 2, name: "Gold stud", quantity: 0, price: "120.00" },
  { id: 3, name: "Bangle", quantity: 10, price: "80.00" },
];

function mirrorRow(over: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    spreadsheetId: "sheet-1",
    stockInEnabled: true,
    sharedWith: "shop@example.com",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getAllProducts.mockResolvedValue(CATALOGUE);
  dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
  dbMock.applyStockInChanges.mockResolvedValue([]);
  sheetsMock.readValues.mockResolvedValue([]);
  mirrorMock.syncSheetMirror.mockResolvedValue({
    status: "synced",
    salesRows: 0,
    inventoryRows: 0,
    stockInPending: false,
  });
});

describe("parseDelta", () => {
  it("accepts a signed or unsigned whole number", () => {
    expect(parseDelta("2")).toBe(2);
    expect(parseDelta("+2")).toBe(2);
    expect(parseDelta("-1")).toBe(-1);
    expect(parseDelta("  3  ")).toBe(3);
    expect(parseDelta("0")).toBe(0);
  });

  /**
   * Not rounded, refused. `quantity` is a count of physical objects; turning
   * "1.5" into 1 or 2 is a guess about stock we have no basis for.
   */
  it("refuses a fraction rather than rounding it", () => {
    expect(parseDelta("1.5")).toBeNull();
    expect(parseDelta("2,5")).toBeNull();
  });

  it("refuses text and blanks", () => {
    expect(parseDelta("two")).toBeNull();
    expect(parseDelta("")).toBeNull();
    expect(parseDelta("5 boxes")).toBeNull();
  });

  it("refuses a delta past the typo ceiling", () => {
    expect(parseDelta(String(MAX_ABS_DELTA))).toBe(MAX_ABS_DELTA);
    expect(parseDelta(String(MAX_ABS_DELTA + 1))).toBeNull();
    expect(parseDelta(String(-MAX_ABS_DELTA - 1))).toBeNull();
  });
});

describe("parsePrice", () => {
  it("accepts a plain decimal", () => {
    expect(parsePrice("39.90")).toBe("39.90");
    expect(parsePrice("40")).toBe("40.00");
  });

  it("accepts how people actually type money into a spreadsheet", () => {
    expect(parsePrice("CHF 39.90")).toBe("39.90");
    expect(parsePrice("39,90")).toBe("39.90");
    // The Swiss group separator.
    expect(parsePrice("1'234.50")).toBe("1234.50");
  });

  it("reads a comma as thousands when a dot is also present", () => {
    // The only reading under which "1,234.50" means what its writer meant.
    expect(parsePrice("1,234.50")).toBe("1234.50");
  });

  it("refuses a zero, a negative, and more than two decimals", () => {
    // A zero cell is far more often a stray character than a giveaway.
    expect(parsePrice("0")).toBeNull();
    expect(parsePrice("0.00")).toBeNull();
    expect(parsePrice("-5.00")).toBeNull();
    expect(parsePrice("1.234")).toBeNull();
  });

  it("refuses text", () => {
    expect(parsePrice("ask me")).toBeNull();
    expect(parsePrice("")).toBeNull();
  });
});

describe("diffStockInRows", () => {
  it("ignores rows with no merchant input at all", () => {
    const rows = diffStockInRows(
      [
        ["1", "Silver ring"],
        ["2", "Gold stud", "", "", ""],
      ],
      CATALOGUE,
    );
    expect(rows).toEqual([]);
  });

  it("numbers rows from the tab's first data row, not from zero", () => {
    const rows = diffStockInRows(
      [
        ["1", "Silver ring", "2"],
        ["2", "Gold stud", "1"],
      ],
      CATALOGUE,
    );
    expect(rows.map((r) => r.rowNumber)).toEqual([3, 4]);
  });

  it("applies the delta to the CURRENT quantity", () => {
    const [row] = diffStockInRows([["1", "Silver ring", "+2"]], CATALOGUE);
    expect(row.status).toBe("ok");
    expect(row.quantityBefore).toBe(3);
    expect(row.quantityAfter).toBe(5);
    expect(row.quantityDelta).toBe(2);
  });

  it("floors a negative delta at zero rather than going negative", () => {
    const [row] = diffStockInRows([["1", "Silver ring", "-10"]], CATALOGUE);
    expect(row.quantityAfter).toBe(0);
  });

  it("restocks a sold-out item", () => {
    const [row] = diffStockInRows([["2", "Gold stud", "+4"]], CATALOGUE);
    expect(row.quantityBefore).toBe(0);
    expect(row.quantityAfter).toBe(4);
    expect(row.status).toBe("ok");
  });

  /**
   * The sheet's `item` column is a stale reference we wrote on an earlier
   * refresh. Reporting it would let a rename in the sheet disguise which product
   * is about to change.
   */
  it("reports the DATABASE's name, not the sheet's", () => {
    const [row] = diffStockInRows(
      [["1", "Something the merchant retyped", "1"]],
      CATALOGUE,
    );
    expect(row.itemName).toBe("Silver ring");
  });

  it("sets aside an id that does not exist in this store", () => {
    const [row] = diffStockInRows([["999", "Ghost", "1"]], CATALOGUE);
    expect(row.status).toBe("unknown_product");
    expect(row.productId).toBe(999);
    expect(row.message).toContain("999");
  });

  it("sets aside a row whose id cell is not a number", () => {
    const [row] = diffStockInRows([["", "typed a name only", "1"]], CATALOGUE);
    expect(row.status).toBe("unknown_product");
    expect(row.productId).toBeNull();
  });

  it("sets aside an unparseable delta, keeping the row for correction", () => {
    const [row] = diffStockInRows([["1", "Silver ring", "a few"]], CATALOGUE);
    expect(row.status).toBe("invalid_delta");
    expect(row.message).toContain("a few");
    expect(row.quantityBefore).toBe(3);
  });

  it("sets aside an unparseable price", () => {
    const [row] = diffStockInRows(
      [["1", "Silver ring", "", "call us"]],
      CATALOGUE,
    );
    expect(row.status).toBe("invalid_price");
  });

  it("accepts a price-only row with no quantity change", () => {
    const [row] = diffStockInRows(
      [["1", "Silver ring", "", "39.90"]],
      CATALOGUE,
    );
    expect(row.status).toBe("ok");
    expect(row.quantityDelta).toBe(0);
    expect(row.quantityAfter).toBe(3);
    expect(row.newPrice).toBe("39.90");
    expect(row.priceBefore).toBe("45.00");
  });

  it("reports a row that changes nothing rather than dropping it", () => {
    // Delta 0 and the price it already has: the merchant typed something, so
    // "already the case" beats silence.
    const [row] = diffStockInRows(
      [["1", "Silver ring", "0", "45.00", "checked"]],
      CATALOGUE,
    );
    expect(row.status).toBe("no_change");
    expect(row.note).toBe("checked");
  });

  it("keeps the merchant's note on an applicable row", () => {
    const [row] = diffStockInRows(
      [["3", "Bangle", "-2", "", "two damaged in transit"]],
      CATALOGUE,
    );
    expect(row.status).toBe("ok");
    expect(row.note).toBe("two damaged in transit");
  });

  it("tolerates a short row array from a sparse sheet", () => {
    const rows = diffStockInRows([["1", "Silver ring", "1"], []], CATALOGUE);
    expect(rows).toHaveLength(1);
  });
});

describe("stockInHash", () => {
  it("is empty when nothing is applicable", () => {
    expect(stockInHash(diffStockInRows([["999", "x", "1"]], CATALOGUE))).toBe(
      "",
    );
  });

  it("changes when the merchant edits a delta", () => {
    const a = stockInHash(diffStockInRows([["1", "r", "2"]], CATALOGUE));
    const b = stockInHash(diffStockInRows([["1", "r", "3"]], CATALOGUE));
    expect(a).not.toBe(b);
  });

  it("changes when a row is added", () => {
    const a = stockInHash(diffStockInRows([["1", "r", "2"]], CATALOGUE));
    const b = stockInHash(
      diffStockInRows(
        [
          ["1", "r", "2"],
          ["3", "b", "1"],
        ],
        CATALOGUE,
      ),
    );
    expect(a).not.toBe(b);
  });

  /**
   * The crucial asymmetry. Tolerating concurrent sales is what deltas are FOR;
   * hashing the current quantity would turn every busy afternoon into a
   * stale-approval loop.
   */
  it("does NOT change when the catalogue's quantity moves underneath it", () => {
    const before = stockInHash(diffStockInRows([["1", "r", "2"]], CATALOGUE));
    const afterASale = stockInHash(
      diffStockInRows(
        [["1", "r", "2"]],
        [{ id: 1, name: "Silver ring", quantity: 2, price: "45.00" }],
      ),
    );
    expect(afterASale).toBe(before);
  });

  it("does not change when only the merchant's note changes", () => {
    // The note is not written anywhere, so it cannot invalidate an approval.
    const a = stockInHash(
      diffStockInRows([["1", "r", "2", "", "a"]], CATALOGUE),
    );
    const b = stockInHash(
      diffStockInRows([["1", "r", "2", "", "b"]], CATALOGUE),
    );
    expect(a).toBe(b);
  });
});

describe("previewStockIn", () => {
  it("reads the tab from its first data row", async () => {
    await previewStockIn(TENANT);
    expect(sheetsMock.readValues).toHaveBeenCalledWith(
      "sheet-1",
      "'Stock In'!A3:E",
    );
  });

  it("counts only the applicable rows", async () => {
    sheetsMock.readValues.mockResolvedValue([
      ["1", "Silver ring", "2"],
      ["999", "Ghost", "1"],
      ["3", "Bangle", "0", "80.00"],
    ]);
    const preview = await previewStockIn(TENANT);
    expect(preview.rows).toHaveLength(3);
    expect(preview.applicable).toBe(1);
    expect(preview.hash).not.toBe("");
  });

  it("reads nothing when the store has no mirror", async () => {
    dbMock.getSheetMirror.mockResolvedValue(null);
    const preview = await previewStockIn(TENANT);
    expect(preview).toEqual({ rows: [], applicable: 0, hash: "" });
    expect(sheetsMock.readValues).not.toHaveBeenCalled();
  });

  it("reads nothing when the inbound lane is switched off", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ stockInEnabled: false }),
    );
    expect((await previewStockIn(TENANT)).rows).toEqual([]);
    expect(sheetsMock.readValues).not.toHaveBeenCalled();
  });
});

describe("applyStockIn", () => {
  const GRID = [
    ["1", "Silver ring", "2"],
    ["999", "Ghost", "1"],
    ["3", "Bangle", "-2", "", "damaged"],
  ];

  async function hashFor(grid: string[][]): Promise<string> {
    sheetsMock.readValues.mockResolvedValue(grid);
    return (await previewStockIn(TENANT)).hash;
  }

  it("writes the reviewed rows as deltas, never as absolutes", async () => {
    const hash = await hashFor(GRID);
    await applyStockIn(TENANT, 42, hash);

    expect(dbMock.applyStockInChanges).toHaveBeenCalledWith(TENANT, [
      { productId: 1, quantityDelta: 2, price: null },
      { productId: 3, quantityDelta: -2, price: null },
    ]);
  });

  it("passes an absolute price through alongside the delta", async () => {
    const hash = await hashFor([["1", "Silver ring", "1", "39,90"]]);
    await applyStockIn(TENANT, 42, hash);
    expect(dbMock.applyStockInChanges).toHaveBeenCalledWith(TENANT, [
      { productId: 1, quantityDelta: 1, price: "39.90" },
    ]);
  });

  it("refuses a hash that no longer matches the tab", async () => {
    const stale = await hashFor([["1", "Silver ring", "2"]]);
    // The merchant kept typing after the admin loaded the diff.
    sheetsMock.readValues.mockResolvedValue([["1", "Silver ring", "20"]]);

    await expect(applyStockIn(TENANT, 42, stale)).rejects.toThrow(
      StockInConflictError,
    );
    expect(dbMock.applyStockInChanges).not.toHaveBeenCalled();
  });

  it("refuses an empty hash, so nothing can be applied unreviewed", async () => {
    sheetsMock.readValues.mockResolvedValue([["1", "Silver ring", "2"]]);
    await expect(applyStockIn(TENANT, 42, "")).rejects.toThrow(
      StockInConflictError,
    );
    expect(dbMock.applyStockInChanges).not.toHaveBeenCalled();
  });

  it("refuses when the tab has emptied out since the review", async () => {
    const hash = await hashFor([["1", "Silver ring", "2"]]);
    sheetsMock.readValues.mockResolvedValue([]);
    await expect(applyStockIn(TENANT, 42, hash)).rejects.toThrow(
      StockInConflictError,
    );
  });

  /** Deltas exist precisely so this case is fine. */
  it("still applies when a sale moved the quantity since the review", async () => {
    const hash = await hashFor([["1", "Silver ring", "2"]]);
    dbMock.getAllProducts.mockResolvedValue([
      { id: 1, name: "Silver ring", quantity: 2, price: "45.00" },
    ]);
    await applyStockIn(TENANT, 42, hash);
    expect(dbMock.applyStockInChanges).toHaveBeenCalledWith(TENANT, [
      { productId: 1, quantityDelta: 2, price: null },
    ]);
  });

  it("clears the applied rows but leaves the rejected one to be fixed", async () => {
    const hash = await hashFor(GRID);
    await applyStockIn(TENANT, 42, hash);

    const [, data] = sheetsMock.writeValues.mock.calls[0];
    expect(data[0].range).toBe("'Stock In'!C3");
    expect(data[0].values).toEqual([
      // Row 3 applied → cleared.
      ["", "", ""],
      // Row 4 rejected → left exactly as typed, mistake and all.
      ["1", "", ""],
      // Row 5 applied → cleared, note included.
      ["", "", ""],
    ]);
  });

  it("writes to the database BEFORE tidying the sheet", async () => {
    const order: string[] = [];
    dbMock.applyStockInChanges.mockImplementation(async () => {
      order.push("db");
      return [];
    });
    sheetsMock.writeValues.mockImplementation(async () => {
      order.push("sheet");
    });

    const hash = await hashFor([["1", "Silver ring", "2"]]);
    await applyStockIn(TENANT, 42, hash);
    // Reversed, a failed write would have destroyed the merchant's input.
    expect(order).toEqual(["db", "sheet"]);
  });

  it("republishes the mirror so Inventory shows the new numbers", async () => {
    const hash = await hashFor([["1", "Silver ring", "2"]]);
    await applyStockIn(TENANT, 42, hash);
    expect(mirrorMock.syncSheetMirror).toHaveBeenCalledWith(TENANT);
  });

  it("succeeds even if the republish fails", async () => {
    mirrorMock.syncSheetMirror.mockRejectedValue(new Error("quota"));
    const hash = await hashFor([["1", "Silver ring", "2"]]);
    await expect(applyStockIn(TENANT, 42, hash)).resolves.toMatchObject({
      applied: [],
    });
  });

  it("audit-logs the before/after of every row it wrote", async () => {
    dbMock.applyStockInChanges.mockResolvedValue([
      {
        productId: 1,
        quantityBefore: 3,
        quantityAfter: 5,
        priceBefore: "45.00",
        priceAfter: "45.00",
      },
    ]);
    const hash = await hashFor([["1", "Silver ring", "2"]]);
    await applyStockIn(TENANT, 42, hash);

    expect(dbMock.insertAuditLog).toHaveBeenCalledWith({
      tenantId: TENANT,
      userId: 42,
      action: "sheets.stockIn.applied",
      resourceType: "sheet_mirror",
      metadata: {
        rows: [
          {
            productId: 1,
            quantityBefore: 3,
            quantityAfter: 5,
            priceBefore: "45.00",
            priceAfter: "45.00",
          },
        ],
      },
    });
  });

  it("returns the rows still outstanding", async () => {
    const hash = await hashFor(GRID);
    const result = await applyStockIn(TENANT, 42, hash);
    expect(result.remaining).toHaveLength(1);
    expect(result.remaining[0].status).toBe("unknown_product");
  });
});
