/**
 * Tests for the spreadsheet mirror.
 *
 * `./db` and `./googleSheets` are both mocked: the point of these assertions is
 * the *shape* of what gets published and the order the Google calls happen in,
 * neither of which needs a database or a network.
 *
 * Three of them guard properties that would fail silently in production and look
 * fine in a screenshot: clear-before-write (stale rows left below fresh ones),
 * money as numbers (a sheet that will not SUM), and never overwriting a
 * merchant's half-typed restock.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  getAllProducts: vi.fn(),
  getSheetMirror: vi.fn(),
  listSheetMirrors: vi.fn(),
  setSheetMirrorStockIn: vi.fn(),
  setSheetMirrorSyncResult: vi.fn(),
  upsertSheetMirror: vi.fn(),
  deleteSheetMirror: vi.fn(),
  getPaidOrders: vi.fn(),
  getPosSalesWithItems: vi.fn(),
  getProductsByIds: vi.fn(),
}));
vi.mock("./db", () => dbMock);

const sheetsMock = vi.hoisted(() => ({
  a1: (tab: string, range: string) => `'${tab}'!${range}`,
  batchUpdateSpreadsheet: vi.fn(),
  clearRanges: vi.fn(),
  createSpreadsheet: vi.fn(),
  unshareSpreadsheet: vi.fn(),
  getSpreadsheetMeta: vi.fn(),
  isSheetsConfigured: vi.fn(() => true),
  readValues: vi.fn(),
  shareSpreadsheet: vi.fn(),
  writeValues: vi.fn(),
}));
vi.mock("./googleSheets", () => sheetsMock);

import {
  INVENTORY_HEADER,
  INVENTORY_TAB,
  SALES_HEADER,
  SALES_TAB,
  STOCK_IN_FIRST_DATA_ROW,
  STOCK_IN_HEADER,
  STOCK_IN_HINT,
  STOCK_IN_TAB,
  applyMirrorProtection,
  buildMirrorTabs,
  connectSheetMirror,
  disconnectSheetMirror,
  runSheetMirrorSweep,
  setStockInEnabled,
  stockInHasPendingInput,
  syncSheetMirror,
} from "./sheetMirror";

const TENANT = 7;

function product(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    tenantId: TENANT,
    name: "Silver ring",
    category: "rings",
    price: "45.00",
    quantity: 3,
    sold: false,
    visible: true,
    updatedAt: new Date("2026-08-01T09:30:00Z"),
    ...over,
  };
}

function posSale(over: Partial<Record<string, unknown>> = {}) {
  return {
    order: {
      id: 1,
      invoiceNumber: "KPOS-0001",
      createdAt: new Date("2026-08-10T14:05:00Z"),
      paymentMethod: "cash",
      totalRappen: 6500,
      customerName: "Aya",
      customerEmail: null,
      ...over,
    },
    items: [{ productId: 1, name: "Silver ring", priceRappen: 6500 }],
  };
}

function mirrorRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    tenantId: TENANT,
    spreadsheetId: "sheet-1",
    spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-1/edit",
    sharedWith: "shop@example.com",
    stockInEnabled: false,
    lastSyncedAt: null,
    lastSyncError: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sheetsMock.isSheetsConfigured.mockReturnValue(true);
  dbMock.getAllProducts.mockResolvedValue([]);
  dbMock.getPaidOrders.mockResolvedValue([]);
  dbMock.getPosSalesWithItems.mockResolvedValue([]);
  dbMock.getProductsByIds.mockResolvedValue([]);
  dbMock.listSheetMirrors.mockResolvedValue([]);
  sheetsMock.readValues.mockResolvedValue([]);
  sheetsMock.getSpreadsheetMeta.mockResolvedValue({
    sheetIds: { [SALES_TAB]: 0, [INVENTORY_TAB]: 1, [STOCK_IN_TAB]: 2 },
    protectedRangeIds: [],
  });
});

describe("buildMirrorTabs", () => {
  it("publishes one sales row per line item, with the reference repeated", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([
      {
        order: posSale().order,
        items: [
          { productId: 1, name: "Silver ring", priceRappen: 4000 },
          { productId: 2, name: "Gold stud", priceRappen: 2500 },
        ],
      },
    ]);

    const { sales } = await buildMirrorTabs(TENANT);
    expect(sales).toHaveLength(2);
    expect(sales[0][0]).toBe("KPOS-0001");
    expect(sales[1][0]).toBe("KPOS-0001");
    expect(sales[0][5]).toBe("Silver ring");
    expect(sales[1][5]).toBe("Gold stud");
    expect(SALES_HEADER).toHaveLength(sales[0].length);
  });

  it("writes money as numbers, not formatted strings, so the tab can SUM", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([posSale()]);
    const { sales } = await buildMirrorTabs(TENANT);
    // item_amount and transaction_total
    expect(sales[0][6]).toBe(65);
    expect(sales[0][7]).toBe(65);
    expect(typeof sales[0][6]).toBe("number");
  });

  it("leaves an unknown line amount blank rather than publishing 0.00", async () => {
    // An online order records what was bought but not what each line cost, so
    // salesLedger reports amountMinor 0 for its items. Writing 0 would make the
    // column SUM to a number that is not the store's takings.
    dbMock.getPaidOrders.mockResolvedValue([
      {
        id: 5,
        createdAt: new Date("2026-08-11T10:00:00Z"),
        paymentMethod: "card",
        currency: "chf",
        amountTotal: 9000,
        customerName: null,
        customerEmail: "buyer@example.com",
        productIds: "1",
      },
    ]);
    dbMock.getProductsByIds.mockResolvedValue([product()]);

    const { sales } = await buildMirrorTabs(TENANT);
    expect(sales[0][6]).toBe("");
    expect(sales[0][7]).toBe(90);
  });

  it("keeps a sale with no line items as a single row", async () => {
    dbMock.getPosSalesWithItems.mockResolvedValue([
      { order: posSale().order, items: [] },
    ]);
    const { sales } = await buildMirrorTabs(TENANT);
    expect(sales).toHaveLength(1);
    expect(sales[0][5]).toBe("");
    expect(sales[0][7]).toBe(65);
  });

  it("puts gwinn_id first in inventory and orders rows by id", async () => {
    dbMock.getAllProducts.mockResolvedValue([
      product({ id: 9, name: "Later" }),
      product({ id: 2, name: "Earlier" }),
    ]);
    const { inventory, stockIn } = await buildMirrorTabs(TENANT);
    expect(INVENTORY_HEADER[0]).toBe("gwinn_id");
    expect(inventory.map((r) => r[0])).toEqual([2, 9]);
    // Stock In lists the same items in the same order, so the two tabs read
    // against each other.
    expect(stockIn).toEqual([
      [2, "Earlier"],
      [9, "Later"],
    ]);
  });

  it("publishes price as a number and the flags as yes/no", async () => {
    dbMock.getAllProducts.mockResolvedValue([
      product({ price: "45.50", quantity: 0, sold: true, visible: false }),
    ]);
    const { inventory } = await buildMirrorTabs(TENANT);
    expect(inventory[0][3]).toBe(45.5);
    expect(inventory[0][4]).toBe(0);
    expect(inventory[0][5]).toBe("yes");
    expect(inventory[0][6]).toBe("no");
    expect(inventory[0][7]).toBe("2026-08-01 09:30");
  });
});

describe("stockInHasPendingInput", () => {
  it("is false for rows holding only the reference columns we wrote", () => {
    expect(stockInHasPendingInput([["1", "Silver ring"]])).toBe(false);
    expect(stockInHasPendingInput([["1", "Silver ring", "", "", ""]])).toBe(
      false,
    );
    expect(stockInHasPendingInput([])).toBe(false);
  });

  it("is true once the merchant has typed in any of their own columns", () => {
    expect(stockInHasPendingInput([["1", "Ring", "2"]])).toBe(true);
    expect(stockInHasPendingInput([["1", "Ring", "", "39.00"]])).toBe(true);
    expect(
      stockInHasPendingInput([["1", "Ring", "", "", "found in drawer"]]),
    ).toBe(true);
  });

  it("treats whitespace as empty, so a stray space is not pending work", () => {
    expect(stockInHasPendingInput([["1", "Ring", "  ", " "]])).toBe(false);
  });
});

describe("syncSheetMirror", () => {
  it("skips a store with no mirror, and records nothing", async () => {
    dbMock.getSheetMirror.mockResolvedValue(null);
    const result = await syncSheetMirror(TENANT);
    expect(result.status).toBe("skipped");
    expect(sheetsMock.writeValues).not.toHaveBeenCalled();
    expect(dbMock.setSheetMirrorSyncResult).not.toHaveBeenCalled();
  });

  it("skips when the platform has no Google credentials", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    sheetsMock.isSheetsConfigured.mockReturnValue(false);
    expect((await syncSheetMirror(TENANT)).status).toBe("skipped");
    expect(sheetsMock.writeValues).not.toHaveBeenCalled();
  });

  it("clears before it writes, so a shrinking ledger leaves no stale rows", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    const order: string[] = [];
    sheetsMock.clearRanges.mockImplementation(async () => {
      order.push("clear");
    });
    sheetsMock.writeValues.mockImplementation(async () => {
      order.push("write");
    });

    await syncSheetMirror(TENANT);
    expect(order).toEqual(["clear", "write"]);
    expect(sheetsMock.clearRanges).toHaveBeenCalledWith("sheet-1", [
      "'Sales'!A:I",
      "'Inventory'!A:H",
      "'Stock In'!A:E",
    ]);
  });

  it("writes each tab's header above its rows", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    dbMock.getAllProducts.mockResolvedValue([product()]);
    dbMock.getPosSalesWithItems.mockResolvedValue([posSale()]);

    await syncSheetMirror(TENANT);
    const [, data] = sheetsMock.writeValues.mock.calls[0];
    expect(data[0].range).toBe("'Sales'!A1");
    expect(data[0].values[0]).toEqual(SALES_HEADER);
    expect(data[1].range).toBe("'Inventory'!A1");
    expect(data[1].values[0]).toEqual(INVENTORY_HEADER);
    expect(data[2].range).toBe("'Stock In'!A1");
    expect(data[2].values[0]).toEqual(STOCK_IN_HEADER);
    // The instruction row is part of what we publish — it is where the merchant
    // reads that qty_delta is a change rather than a total.
    expect(data[2].values[1]).toEqual(STOCK_IN_HINT);
  });

  it("does not read Stock In at all when lane 2 is off", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ stockInEnabled: false }),
    );
    await syncSheetMirror(TENANT);
    expect(sheetsMock.readValues).not.toHaveBeenCalled();
  });

  it("leaves a half-typed restock alone rather than overwriting the merchant's work", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ stockInEnabled: true }),
    );
    sheetsMock.readValues.mockResolvedValue([["1", "Silver ring", "5"]]);

    const result = await syncSheetMirror(TENANT);
    expect(result.stockInPending).toBe(true);

    expect(sheetsMock.readValues).toHaveBeenCalledWith(
      "sheet-1",
      `'Stock In'!A${STOCK_IN_FIRST_DATA_ROW}:E`,
    );
    // Neither cleared nor rewritten.
    expect(sheetsMock.clearRanges).toHaveBeenCalledWith("sheet-1", [
      "'Sales'!A:I",
      "'Inventory'!A:H",
    ]);
    const [, data] = sheetsMock.writeValues.mock.calls[0];
    expect(data.map((d: { range: string }) => d.range)).toEqual([
      "'Sales'!A1",
      "'Inventory'!A1",
    ]);
  });

  it("refreshes Stock In when lane 2 is on but nothing is pending", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ stockInEnabled: true }),
    );
    sheetsMock.readValues.mockResolvedValue([["1", "Silver ring", "", "", ""]]);
    const result = await syncSheetMirror(TENANT);
    expect(result.stockInPending).toBe(false);
    const [, data] = sheetsMock.writeValues.mock.calls[0];
    expect(data).toHaveLength(3);
  });

  it("clears a previous failure on a clean push", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ lastSyncError: "boom" }),
    );
    await syncSheetMirror(TENANT);
    expect(dbMock.setSheetMirrorSyncResult).toHaveBeenCalledWith(TENANT, null);
  });

  it("records why a push failed, then rethrows", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    sheetsMock.writeValues.mockRejectedValue(
      new Error("File not found: sheet-1"),
    );

    await expect(syncSheetMirror(TENANT)).rejects.toThrow("File not found");
    expect(dbMock.setSheetMirrorSyncResult).toHaveBeenCalledWith(
      TENANT,
      "File not found: sheet-1",
    );
  });
});

describe("applyMirrorProtection", () => {
  it("deletes the protections it finds before adding fresh ones", async () => {
    sheetsMock.getSpreadsheetMeta.mockResolvedValue({
      sheetIds: { [SALES_TAB]: 0, [INVENTORY_TAB]: 1, [STOCK_IN_TAB]: 2 },
      protectedRangeIds: [3, 4],
    });

    await applyMirrorProtection("sheet-1", { stockInEnabled: false });
    const [, requests] = sheetsMock.batchUpdateSpreadsheet.mock.calls[0];
    expect(requests.slice(0, 2)).toEqual([
      { deleteProtectedRange: { protectedRangeId: 3 } },
      { deleteProtectedRange: { protectedRangeId: 4 } },
    ]);
  });

  it("protects Sales and Inventory, and freezes their headers", async () => {
    await applyMirrorProtection("sheet-1", { stockInEnabled: false });
    const [, requests] = sheetsMock.batchUpdateSpreadsheet.mock.calls[0];

    const protectedSheetIds = requests
      .filter((r: Record<string, unknown>) => "addProtectedRange" in r)
      .map(
        (r: {
          addProtectedRange: { protectedRange: { range: { sheetId: number } } };
        }) => r.addProtectedRange.protectedRange.range.sheetId,
      );
    expect(protectedSheetIds).toContain(0);
    expect(protectedSheetIds).toContain(1);

    const frozen = requests.filter(
      (r: Record<string, unknown>) => "updateSheetProperties" in r,
    );
    expect(frozen).toHaveLength(3);
  });

  it("locks the whole Stock In tab while lane 2 is off", async () => {
    await applyMirrorProtection("sheet-1", { stockInEnabled: false });
    const [, requests] = sheetsMock.batchUpdateSpreadsheet.mock.calls[0];
    const stockIn = requests.find(
      (r: Record<string, unknown>) =>
        "addProtectedRange" in r &&
        (
          r as {
            addProtectedRange: {
              protectedRange: { range: { sheetId: number } };
            };
          }
        ).addProtectedRange.protectedRange.range.sheetId === 2,
    );
    expect(stockIn.addProtectedRange.protectedRange.range).toEqual({
      sheetId: 2,
    });
  });

  it("protects only the id/name columns of Stock In once lane 2 is on", async () => {
    await applyMirrorProtection("sheet-1", { stockInEnabled: true });
    const [, requests] = sheetsMock.batchUpdateSpreadsheet.mock.calls[0];
    const stockIn = requests.find(
      (r: Record<string, unknown>) =>
        "addProtectedRange" in r &&
        (
          r as {
            addProtectedRange: {
              protectedRange: { range: { sheetId: number } };
            };
          }
        ).addProtectedRange.protectedRange.range.sheetId === 2,
    );
    // The merchant can type in qty_delta/new_price/note but cannot retype an id
    // and misdirect a restock at another product.
    expect(stockIn.addProtectedRange.protectedRange.range).toEqual({
      sheetId: 2,
      startColumnIndex: 0,
      endColumnIndex: 2,
    });
  });

  it("never leaves a protection open to everyone", async () => {
    await applyMirrorProtection("sheet-1", { stockInEnabled: true });
    const [, requests] = sheetsMock.batchUpdateSpreadsheet.mock.calls[0];
    for (const r of requests) {
      if (!("addProtectedRange" in r)) continue;
      // warningOnly protection is advisory — Sheets lets the edit through with
      // a dialog, which is not protection at all.
      expect(r.addProtectedRange.protectedRange.warningOnly).toBe(false);
      expect(r.addProtectedRange.protectedRange.editors).toBeUndefined();
    }
  });
});

describe("connectSheetMirror", () => {
  beforeEach(() => {
    sheetsMock.createSpreadsheet.mockResolvedValue({
      spreadsheetId: "sheet-new",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-new/edit",
      sheetIds: { [SALES_TAB]: 0, [INVENTORY_TAB]: 1, [STOCK_IN_TAB]: 2 },
    });
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ spreadsheetId: "sheet-new" }),
    );
  });

  it("creates all three tabs up front so enabling lane 2 is only a permission change", async () => {
    await connectSheetMirror(TENANT, {
      storeName: "Acme",
      shareWith: "shop@example.com",
      stockInEnabled: false,
    });
    const [title, tabs] = sheetsMock.createSpreadsheet.mock.calls[0];
    expect(title).toContain("Acme");
    expect(tabs).toEqual([SALES_TAB, INVENTORY_TAB, STOCK_IN_TAB]);
  });

  it("shares read-only when lane 2 is off", async () => {
    await connectSheetMirror(TENANT, {
      storeName: "Acme",
      shareWith: "shop@example.com",
      stockInEnabled: false,
    });
    expect(sheetsMock.shareSpreadsheet).toHaveBeenCalledWith(
      "sheet-new",
      "shop@example.com",
      "reader",
    );
  });

  it("protects the file BEFORE widening the share to writer", async () => {
    const order: string[] = [];
    sheetsMock.batchUpdateSpreadsheet.mockImplementation(async () => {
      order.push("protect");
    });
    sheetsMock.shareSpreadsheet.mockImplementation(async () => {
      order.push("share");
    });

    await connectSheetMirror(TENANT, {
      storeName: "Acme",
      shareWith: "shop@example.com",
      stockInEnabled: true,
    });

    // Reversed, the spreadsheet would spend a moment as an editable copy of the
    // store's books.
    expect(order).toEqual(["protect", "share"]);
    expect(sheetsMock.shareSpreadsheet).toHaveBeenCalledWith(
      "sheet-new",
      "shop@example.com",
      "writer",
    );
  });

  it("records the mirror and fills it before returning the link", async () => {
    await connectSheetMirror(TENANT, {
      storeName: "Acme",
      shareWith: "shop@example.com",
      stockInEnabled: false,
    });
    expect(dbMock.upsertSheetMirror).toHaveBeenCalledWith({
      tenantId: TENANT,
      spreadsheetId: "sheet-new",
      spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-new/edit",
      sharedWith: "shop@example.com",
      stockInEnabled: false,
    });
    expect(sheetsMock.writeValues).toHaveBeenCalled();
  });

  it("still returns the link when the first fill fails", async () => {
    // The mirror is connected with its failure recorded; the sweep retries.
    sheetsMock.writeValues.mockRejectedValue(new Error("quota"));
    await expect(
      connectSheetMirror(TENANT, {
        storeName: "Acme",
        shareWith: "shop@example.com",
        stockInEnabled: false,
      }),
    ).resolves.toMatchObject({ spreadsheetId: "sheet-new" });
    expect(dbMock.setSheetMirrorSyncResult).toHaveBeenCalledWith(
      TENANT,
      "quota",
    );
  });
});

describe("setStockInEnabled", () => {
  it("re-protects before widening the grant, then records the flag", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    const order: string[] = [];
    sheetsMock.batchUpdateSpreadsheet.mockImplementation(async () => {
      order.push("protect");
    });
    sheetsMock.shareSpreadsheet.mockImplementation(async () => {
      order.push("share");
    });

    await setStockInEnabled(TENANT, true);
    expect(order).toEqual(["protect", "share"]);
    expect(sheetsMock.shareSpreadsheet).toHaveBeenCalledWith(
      "sheet-1",
      "shop@example.com",
      "writer",
    );
    expect(dbMock.setSheetMirrorStockIn).toHaveBeenCalledWith(TENANT, true);
  });

  it("narrows the grant back to reader when switched off", async () => {
    dbMock.getSheetMirror.mockResolvedValue(
      mirrorRow({ stockInEnabled: true }),
    );
    await setStockInEnabled(TENANT, false);
    expect(sheetsMock.shareSpreadsheet).toHaveBeenCalledWith(
      "sheet-1",
      "shop@example.com",
      "reader",
    );
    expect(dbMock.setSheetMirrorStockIn).toHaveBeenCalledWith(TENANT, false);
  });

  it("does nothing for a store with no mirror", async () => {
    dbMock.getSheetMirror.mockResolvedValue(null);
    await setStockInEnabled(TENANT, true);
    expect(sheetsMock.shareSpreadsheet).not.toHaveBeenCalled();
    expect(dbMock.setSheetMirrorStockIn).not.toHaveBeenCalled();
  });
});

describe("disconnectSheetMirror", () => {
  it("unshares the spreadsheet, then forgets it", async () => {
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    await disconnectSheetMirror(TENANT);
    expect(sheetsMock.unshareSpreadsheet).toHaveBeenCalledWith(
      "sheet-1",
      "shop@example.com",
    );
    expect(dbMock.deleteSheetMirror).toHaveBeenCalledWith(TENANT);
  });

  it("forgets the mirror even when Drive refuses the unshare", async () => {
    // The merchant asked to be disconnected; a Drive failure must not leave
    // them connected to a file we can no longer manage.
    dbMock.getSheetMirror.mockResolvedValue(mirrorRow());
    sheetsMock.unshareSpreadsheet.mockRejectedValue(new Error("403"));
    await expect(disconnectSheetMirror(TENANT)).resolves.toBeUndefined();
    expect(dbMock.deleteSheetMirror).toHaveBeenCalledWith(TENANT);
  });

  it("is a no-op for a store with no mirror", async () => {
    dbMock.getSheetMirror.mockResolvedValue(null);
    await disconnectSheetMirror(TENANT);
    expect(sheetsMock.unshareSpreadsheet).not.toHaveBeenCalled();
    expect(dbMock.deleteSheetMirror).not.toHaveBeenCalled();
  });
});

describe("runSheetMirrorSweep", () => {
  it("does nothing when the platform has no Google credentials", async () => {
    sheetsMock.isSheetsConfigured.mockReturnValue(false);
    expect(await runSheetMirrorSweep()).toEqual({
      attempted: 0,
      synced: 0,
      failed: 0,
    });
    expect(dbMock.listSheetMirrors).not.toHaveBeenCalled();
  });

  it("carries on past a store whose push fails", async () => {
    dbMock.listSheetMirrors.mockResolvedValue([
      mirrorRow({ tenantId: 1 }),
      mirrorRow({ tenantId: 2 }),
      mirrorRow({ tenantId: 3 }),
    ]);
    dbMock.getSheetMirror.mockImplementation(async (tenantId: number) =>
      mirrorRow({ tenantId }),
    );
    sheetsMock.writeValues.mockImplementation(async () => {
      if (dbMock.getSheetMirror.mock.calls.at(-1)?.[0] === 2) {
        throw new Error("File not found");
      }
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await runSheetMirrorSweep()).toEqual({
      attempted: 3,
      synced: 2,
      failed: 1,
    });
  });
});
