/**
 * Stock In — the one inbound path from a merchant's spreadsheet.
 *
 * The sheet is a PROPOSAL queue, never a source of truth. A merchant types
 * changes into the Stock In tab; this module reads them, validates each row
 * against the live catalogue, and presents a diff. Nothing is written until an
 * admin approves that diff, and the write itself is a transaction in MySQL
 * (`applyStockInChanges`).
 *
 * ## The two properties that make this safe
 *
 * **1. Quantities are deltas.** `qty_delta` is a *change* ("+2 received"), never
 * a total. The merchant's tab was last looked at some minutes or hours ago, and
 * the till may have sold the piece since. An absolute quantity would silently
 * undo that sale — and for the one-of-a-kind pieces this catalogue is full of,
 * would resurrect an item already in a customer's bag. A delta composes with
 * whatever happened in between; the sheet's own instruction row says so, and
 * `parseDelta` rejects anything that is not a signed integer rather than
 * guessing.
 *
 * **2. Approval is bound to the sheet's content, not to a point in time.**
 * `preview` returns a hash of the rows it diffed, and `apply` re-reads the tab
 * and recomputes it: if the merchant typed anything else in the meantime, the
 * approval no longer describes what would be written, and it is refused.
 *
 * Note precisely what that hash covers — the sheet-derived values only, never
 * the database's current quantities. A concurrent sale MUST NOT invalidate an
 * approval: tolerating exactly that is the whole point of deltas, and hashing
 * `quantityBefore` would turn every busy afternoon into a stale-approval loop.
 */

import crypto from "node:crypto";
import { a1, readValues, writeValues } from "./googleSheets";
import {
  type StockInChange,
  type StockInApplied,
  applyStockInChanges,
  getAllProducts,
  getSheetMirror,
  insertAuditLog,
} from "./db";
import {
  STOCK_IN_FIRST_DATA_ROW,
  STOCK_IN_TAB,
  syncSheetMirror,
} from "./sheetMirror";

/**
 * The largest change a single row may carry. Not a business rule — a typo net:
 * "200" typed into a cell meant for "2" is recoverable, "200000" reads as a
 * finger held on a key and is almost certainly not a real delivery.
 */
export const MAX_ABS_DELTA = 10_000;

/** products.price is decimal(10,2), so this is the column's own ceiling. */
const MAX_PRICE = 99_999_999.99;
const MIN_PRICE = 0.01;

export type StockInRowStatus =
  | "ok"
  | "no_change"
  | "unknown_product"
  | "invalid_delta"
  | "invalid_price";

export interface StockInRow {
  /** 1-indexed spreadsheet row, so an admin can point the merchant at it. */
  rowNumber: number;
  productId: number | null;
  /**
   * The item's name from the DATABASE, not from the sheet's own column. The
   * sheet's copy is a stale reference we wrote on some earlier refresh; showing
   * it in the approval UI would let a rename disguise which product is about to
   * change.
   */
  itemName: string;
  quantityDelta: number;
  quantityBefore: number | null;
  quantityAfter: number | null;
  /** Absolute new price as a decimal string, or null for "leave it alone". */
  newPrice: string | null;
  priceBefore: string | null;
  note: string;
  status: StockInRowStatus;
  /** Why a non-`ok` row was set aside, as raw text for the UI to render. */
  message?: string;
}

export interface StockInPreview {
  rows: StockInRow[];
  /** How many rows would actually be written. */
  applicable: number;
  /**
   * Fingerprint of the sheet content this preview describes. Pass it back to
   * `applyStockIn`; a mismatch means the tab moved and the approval is void.
   * Empty when there is nothing to apply.
   */
  hash: string;
}

/**
 * A signed integer, or null if the cell is not one.
 *
 * "+2", "2", "-1", " 3 " are all accepted; "two", "2.5" and "" are not. A
 * fractional delta is rejected rather than rounded: `quantity` is a count of
 * physical objects, and silently turning "1.5" into 1 or 2 is a guess about
 * stock we have no business making.
 */
export function parseDelta(raw: string): number | null {
  const text = raw.trim();
  if (!/^[+-]?\d+$/.test(text)) return null;
  const value = Number.parseInt(text, 10);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) > MAX_ABS_DELTA) return null;
  return value;
}

/**
 * A price cell as a decimal string, or null if it is not a usable price.
 *
 * Tolerant of how people actually type money into a spreadsheet: a currency
 * prefix ("CHF 39.90"), an apostrophe group separator (the Swiss "1'234.50"),
 * and a comma decimal separator ("39,90"). When BOTH a comma and a dot appear
 * the comma is read as a thousands separator, which is the only reading that
 * makes "1,234.50" mean what its writer meant.
 *
 * Deliberately strict about the outcome: two decimal places, at least one
 * Rappen. A zero price is far more often an empty cell that picked up a stray
 * character than a merchant giving stock away, and the admin panel is a better
 * place to set one than a bulk restock sheet.
 */
export function parsePrice(raw: string): string | null {
  let text = raw.trim();
  if (!text) return null;

  // Strip currency letters/symbols and whitespace, and the Swiss group quote.
  text = text.replace(/[A-Za-z\s'’]/g, "").replace(/[^\d.,+-]/g, "");
  if (text.includes(",") && text.includes(".")) {
    text = text.replace(/,/g, "");
  } else {
    text = text.replace(",", ".");
  }

  if (!/^\+?\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number.parseFloat(text);
  if (!Number.isFinite(value) || value < MIN_PRICE || value > MAX_PRICE) {
    return null;
  }
  return value.toFixed(2);
}

/** Does this sheet row carry any merchant input at all? */
function isBlank(row: string[]): boolean {
  return row.slice(2, 5).every((cell) => String(cell ?? "").trim() === "");
}

function cell(row: string[], index: number): string {
  return String(row[index] ?? "");
}

/**
 * Fingerprint the sheet-derived content of the rows that would be written.
 *
 * Sheet values only — see the module comment for why the database's current
 * quantities are deliberately excluded.
 */
export function stockInHash(rows: StockInRow[]): string {
  const applicable = rows.filter((r) => r.status === "ok");
  if (applicable.length === 0) return "";
  const canonical = applicable.map((r) => [
    r.rowNumber,
    r.productId,
    r.quantityDelta,
    r.newPrice,
  ]);
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

/**
 * Turn the raw tab grid into a validated diff against the live catalogue.
 *
 * Exported separately from `previewStockIn` so the parsing and classification
 * can be tested without Google or a database in the way.
 */
export function diffStockInRows(
  grid: string[][],
  products: { id: number; name: string; quantity: number; price: string }[],
): StockInRow[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows: StockInRow[] = [];

  grid.forEach((raw, index) => {
    const row = Array.isArray(raw) ? raw : [];
    if (isBlank(row)) return;

    const rowNumber = STOCK_IN_FIRST_DATA_ROW + index;
    const note = cell(row, 4).trim();
    const idText = cell(row, 0).trim();
    const deltaText = cell(row, 2).trim();
    const priceText = cell(row, 3).trim();

    const base: StockInRow = {
      rowNumber,
      productId: null,
      itemName: cell(row, 1).trim(),
      quantityDelta: 0,
      quantityBefore: null,
      quantityAfter: null,
      newPrice: null,
      priceBefore: null,
      note,
      status: "unknown_product",
    };

    const productId = /^\d+$/.test(idText) ? Number.parseInt(idText, 10) : null;
    const product = productId === null ? undefined : byId.get(productId);
    if (!product) {
      rows.push({
        ...base,
        productId,
        message: `No product with id ${idText || "(blank)"} in this store`,
      });
      return;
    }

    // Everything below reports the DATABASE's name, not the sheet's.
    const found: StockInRow = {
      ...base,
      productId: product.id,
      itemName: product.name,
      quantityBefore: product.quantity,
      priceBefore: product.price,
    };

    const delta = deltaText === "" ? 0 : parseDelta(deltaText);
    if (delta === null) {
      rows.push({
        ...found,
        status: "invalid_delta",
        message: `"${deltaText}" is not a whole number between -${MAX_ABS_DELTA} and +${MAX_ABS_DELTA}`,
      });
      return;
    }

    const newPrice = priceText === "" ? null : parsePrice(priceText);
    if (priceText !== "" && newPrice === null) {
      rows.push({
        ...found,
        quantityDelta: delta,
        status: "invalid_price",
        message: `"${priceText}" is not a price`,
      });
      return;
    }

    const quantityAfter = Math.max(0, product.quantity + delta);
    const priceChanges = newPrice !== null && newPrice !== product.price;
    const quantityChanges = quantityAfter !== product.quantity;

    rows.push({
      ...found,
      quantityDelta: delta,
      quantityAfter,
      newPrice,
      // A row whose numbers already match the catalogue is reported rather than
      // dropped: the merchant typed something, and "we ignored it" is a worse
      // answer than "that is already the case".
      status: quantityChanges || priceChanges ? "ok" : "no_change",
      ...(quantityChanges || priceChanges
        ? {}
        : { message: "Already matches the catalogue" }),
    });
  });

  return rows;
}

/** The raw Stock In grid for a store, or [] when it has no mirror. */
async function readStockInGrid(tenantId: number): Promise<{
  grid: string[][];
  spreadsheetId: string | null;
}> {
  const mirror = await getSheetMirror(tenantId);
  // No mirror and a mirror with the lane switched off are the same answer here:
  // in neither case can the tab hold anything, so there is nothing to read.
  if (!mirror?.stockInEnabled) {
    return { grid: [], spreadsheetId: null };
  }
  const grid = await readValues(
    mirror.spreadsheetId,
    a1(STOCK_IN_TAB, `A${STOCK_IN_FIRST_DATA_ROW}:E`),
  );
  return { grid, spreadsheetId: mirror.spreadsheetId };
}

export async function previewStockIn(
  tenantId: number,
): Promise<StockInPreview> {
  const [{ grid }, products] = await Promise.all([
    readStockInGrid(tenantId),
    getAllProducts(tenantId),
  ]);
  const rows = diffStockInRows(grid, products);
  return {
    rows,
    applicable: rows.filter((r) => r.status === "ok").length,
    hash: stockInHash(rows),
  };
}

export class StockInConflictError extends Error {
  constructor() {
    super(
      "The Stock In tab changed since this was reviewed. Reload the diff and approve again.",
    );
    this.name = "StockInConflictError";
  }
}

export interface StockInApplyResult {
  applied: StockInApplied[];
  /** Rows left in the tab for the merchant to fix, by status. */
  remaining: StockInRow[];
}

/**
 * Apply an approved diff.
 *
 * Re-reads and re-diffs first: `expectedHash` is checked against the tab as it
 * is NOW, so an approval can only ever write the rows it was given. Then the
 * database write, then the tab is tidied — in that order, because a tidy-up that
 * ran first would destroy the merchant's input if the write failed.
 *
 * Only applied rows are cleared. Rows we set aside (an id that does not exist, a
 * delta that is not a number) are left exactly as typed, because they are the
 * ones the merchant still has to correct — wiping them would hide the mistake
 * along with the evidence of it.
 */
export async function applyStockIn(
  tenantId: number,
  userId: number | null,
  expectedHash: string,
): Promise<StockInApplyResult> {
  const { grid, spreadsheetId } = await readStockInGrid(tenantId);
  const products = await getAllProducts(tenantId);
  const rows = diffStockInRows(grid, products);

  const hash = stockInHash(rows);
  if (!hash || hash !== expectedHash) throw new StockInConflictError();

  const changes: StockInChange[] = rows
    .filter((r) => r.status === "ok" && r.productId !== null)
    .map((r) => ({
      productId: r.productId as number,
      quantityDelta: r.quantityDelta,
      price: r.newPrice,
    }));

  const applied = await applyStockInChanges(tenantId, changes);

  await insertAuditLog({
    tenantId,
    userId,
    action: "sheets.stockIn.applied",
    resourceType: "sheet_mirror",
    metadata: { rows: applied },
  });

  const appliedRowNumbers = new Set(
    rows.filter((r) => r.status === "ok").map((r) => r.rowNumber),
  );

  if (spreadsheetId && appliedRowNumbers.size > 0) {
    // Rewrite the merchant's three columns in one range: blanks where a row was
    // applied, untouched text everywhere else.
    const values = grid.map((raw, index) => {
      const rowNumber = STOCK_IN_FIRST_DATA_ROW + index;
      if (appliedRowNumbers.has(rowNumber)) return ["", "", ""];
      const row = Array.isArray(raw) ? raw : [];
      return [cell(row, 2), cell(row, 3), cell(row, 4)];
    });
    await writeValues(spreadsheetId, [
      {
        range: a1(STOCK_IN_TAB, `C${STOCK_IN_FIRST_DATA_ROW}`),
        values,
      },
    ]);

    // Republish so the Inventory tab shows the numbers that were just written —
    // otherwise the merchant approves a restock and their sheet still says the
    // old quantity. Best-effort: the ledger is already correct either way.
    await syncSheetMirror(tenantId).catch(() => {});
  }

  return {
    applied,
    remaining: rows.filter((r) => r.status !== "ok"),
  };
}
