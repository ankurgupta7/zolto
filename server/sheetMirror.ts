/**
 * The spreadsheet mirror — a store's sales and inventory, published to a Google
 * Sheet the merchant can filter, pivot, and hand to their accountant.
 *
 * ## Direction of truth
 *
 * One way, always: MySQL → sheet. Every tab is re-rendered from the ledger on
 * each push, so the spreadsheet cannot become a second, disagreeing copy. The
 * reasons the ledger stays in the database are worth restating where someone
 * might be tempted to invert it:
 *
 *   - `reserveProducts` (server/db.ts) is a compare-and-set: one `UPDATE … WHERE
 *     not sold AND no live reservation`, then a read-back of its own token. The
 *     Sheets API has no conditional write, so two concurrent checkouts would
 *     both read "available", both write "reserved", and a one-of-a-kind piece
 *     would sell twice.
 *   - a POS sale writes its order, its line items and a stock decrement in one
 *     transaction. `batchUpdate` is all-or-nothing within a file but gives no
 *     isolation, so it cannot prevent the lost update that oversells.
 *   - `orders.stripeSessionId` is UNIQUE, which is the whole of our webhook
 *     idempotency. A sheet would append the duplicate row.
 *
 * The one inbound path (Stock In, server/stockIn.ts) is a *proposal* queue: the
 * merchant types deltas, an admin approves a diff, and the database applies it.
 *
 * ## Tabs
 *
 * - **Sales** — one row per line item with the transaction reference repeated,
 *   matching the shape of the existing CSV export on /admin/sales (a
 *   one-row-per-sale layout drops the very thing a merchant opens it for).
 * - **Inventory** — one row per product, `zolto_id` first.
 * - **Stock In** — the only writable tab, and only when lane 2 is enabled.
 *
 * ## Why protected ranges rather than a read-only share
 *
 * Drive permissions are per FILE, not per tab. So a merchant who needs to type
 * into Stock In must hold a `writer` grant on the whole spreadsheet, and the
 * read-only-ness of Sales and Inventory is then enforced by protected ranges
 * instead. That protection is not decoration — without it, a writer grant hands
 * over an editable copy of the books, and an edit there is invisible to us
 * (we overwrite it on the next sync, so the merchant's change silently
 * disappears rather than erroring). `applyMirrorProtection` must be re-run
 * whenever the share role changes.
 */

import {
  a1,
  batchUpdateSpreadsheet,
  clearRanges,
  createSpreadsheet,
  unshareSpreadsheet,
  getSpreadsheetMeta,
  isSheetsConfigured,
  readValues,
  shareSpreadsheet,
  writeValues,
} from "./googleSheets";
import {
  deleteSheetMirror,
  getAllProducts,
  getSheetMirror,
  listSheetMirrors,
  setSheetMirrorStockIn,
  setSheetMirrorSyncResult,
  upsertSheetMirror,
} from "./db";
import { buildSalesLedger } from "./salesLedger";

export const SALES_TAB = "Sales";
export const INVENTORY_TAB = "Inventory";
export const STOCK_IN_TAB = "Stock In";
export const MIRROR_TABS = [SALES_TAB, INVENTORY_TAB, STOCK_IN_TAB];

/**
 * How many sales the mirror publishes. Deliberately the ledger's own ceiling
 * rather than "everything": the sheet is a working surface, not an archive, and
 * a merchant scrolling 40,000 rows is worse served than one seeing their recent
 * trading. `truncated` is reported into the tab's header so the number is never
 * silently a subset.
 */
export const SALES_MIRROR_LIMIT = 1000;

export const SALES_HEADER = [
  "reference",
  "channel",
  "date",
  "payment_method",
  "customer",
  "item",
  "item_amount",
  "transaction_total",
  "currency",
];

export const INVENTORY_HEADER = [
  "zolto_id",
  "name",
  "category",
  "price",
  "quantity",
  "sold",
  "visible",
  "updated",
];

/**
 * The Stock In tab's columns. `zolto_id` and `item` are written by us on each
 * refresh; the merchant fills the rest.
 *
 * `qty_delta` is a CHANGE, not a total, and that is the single most important
 * design decision in lane 2. The merchant's sheet was last read at some point
 * in the past, and the till may have sold the piece since. "+2 received"
 * composes with that sale; "= 2" silently undoes it, and can resurrect a
 * one-of-a-kind item already in a customer's bag. The header text says so, in
 * the sheet, where the person typing will read it.
 */
export const STOCK_IN_HEADER = [
  "zolto_id",
  "item",
  "qty_delta",
  "new_price",
  "note",
];

/** Row 2 of Stock In: instructions, in the one place a merchant will see them. */
export const STOCK_IN_HINT = [
  "(do not edit)",
  "(do not edit)",
  "+2 received / -1 damaged — a CHANGE, not a total",
  "leave blank to keep the current price",
  "optional — shown to the admin who approves this",
];

/** First data row of Stock In (1-indexed): header, hint, then rows. */
export const STOCK_IN_FIRST_DATA_ROW = 3;

const MINOR_PER_UNIT = 100;

/** Rappen → a number Sheets can SUM, rather than a pre-formatted string. */
function money(minor: number): number {
  return Math.round(minor) / MINOR_PER_UNIT;
}

/** ISO instant → "YYYY-MM-DD HH:MM", which sorts lexicographically. */
function stamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

export interface MirrorTabData {
  sales: (string | number)[][];
  inventory: (string | number)[][];
  /** zolto_id + item only; the merchant owns the remaining columns. */
  stockIn: (string | number)[][];
}

/**
 * Render every tab's rows for one store. Pure apart from its two reads, so the
 * layout is testable without touching Google.
 */
export async function buildMirrorTabs(
  tenantId: number,
): Promise<MirrorTabData> {
  const [ledger, products] = await Promise.all([
    buildSalesLedger(tenantId, {
      channel: "all",
      limit: SALES_MIRROR_LIMIT,
    }),
    getAllProducts(tenantId),
  ]);

  const sales: (string | number)[][] = [];
  for (const row of ledger.rows) {
    const base: (string | number)[] = [
      row.reference,
      row.channel,
      stamp(row.createdAt),
      row.paymentMethod ?? "",
      row.customerName ?? row.customerEmail ?? "",
    ];
    if (row.items.length === 0) {
      sales.push([
        ...base,
        "",
        "",
        money(row.amountMinor),
        row.currency.toUpperCase(),
      ]);
      continue;
    }
    for (const item of row.items) {
      sales.push([
        ...base,
        item.name,
        // An online order records what was bought but not what each line cost,
        // so a zero line amount is "not known" and stays blank rather than
        // publishing a 0.00 that would wrongly SUM.
        item.amountMinor ? money(item.amountMinor) : "",
        money(row.amountMinor),
        row.currency.toUpperCase(),
      ]);
    }
  }

  // Oldest id first, so the tab is stable between refreshes: a merchant who
  // sorted or filtered their view keeps looking at the same rows.
  const ordered = [...products].sort((a, b) => a.id - b.id);

  const inventory = ordered.map((p) => [
    p.id,
    p.name,
    p.category,
    Number(p.price),
    p.quantity,
    p.sold ? "yes" : "no",
    p.visible ? "yes" : "no",
    stamp(p.updatedAt.toISOString()),
  ]);

  const stockIn = ordered.map((p) => [p.id, p.name]);

  return { sales, inventory, stockIn };
}

/**
 * Does the Stock In tab hold merchant input that has not been applied yet?
 *
 * Read before refreshing that tab: overwriting a half-typed restock — the
 * merchant's actual work — to keep a name column tidy is a bad trade, so the
 * sync leaves the tab alone whenever anything is pending.
 */
export function stockInHasPendingInput(rows: string[][]): boolean {
  return rows.some((row) =>
    // Columns 2..4 (qty_delta, new_price, note) are the merchant's.
    row.slice(2, 5).some((cell) => String(cell ?? "").trim() !== ""),
  );
}

/**
 * Structural setup, re-runnable: freeze the header rows, and protect every tab
 * the merchant must not edit.
 *
 * Existing protections are removed first — Sheets would otherwise stack a fresh
 * duplicate on every call until the file hits its limit.
 *
 * `editors` is deliberately omitted from each `addProtectedRange`: with no
 * editor list, Sheets restricts the range to the file's owner, which is the
 * platform service account. Naming editors explicitly would mean maintaining
 * that list forever, and getting it wrong fails open.
 */
export async function applyMirrorProtection(
  spreadsheetId: string,
  options: { stockInEnabled: boolean },
): Promise<void> {
  const { sheetIds, protectedRangeIds } =
    await getSpreadsheetMeta(spreadsheetId);

  const requests: unknown[] = protectedRangeIds.map((id) => ({
    deleteProtectedRange: { protectedRangeId: id },
  }));

  for (const [tab, frozenRows] of [
    [SALES_TAB, 1],
    [INVENTORY_TAB, 1],
    // Stock In freezes its header AND its instruction row, so the "this is a
    // change, not a total" line stays on screen while the merchant scrolls.
    [STOCK_IN_TAB, 2],
  ] as const) {
    const sheetId = sheetIds[tab];
    if (sheetId === undefined) continue;
    requests.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: frozenRows } },
        fields: "gridProperties.frozenRowCount",
      },
    });
  }

  // Sales and Inventory are derived: an edit there is overwritten by the next
  // sync, so the protection is what turns "your change vanished" into "you
  // cannot make that change".
  for (const tab of [SALES_TAB, INVENTORY_TAB]) {
    const sheetId = sheetIds[tab];
    if (sheetId === undefined) continue;
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: { sheetId },
          description: "Published by Zolto — edit in the admin panel instead",
          warningOnly: false,
        },
      },
    });
  }

  // Stock In: the two columns we own stay protected even when lane 2 is on, so
  // a merchant cannot retype an id and misdirect a restock. With lane 2 off the
  // whole tab is locked, because they hold no writer grant to use it with.
  const stockInSheetId = sheetIds[STOCK_IN_TAB];
  if (stockInSheetId !== undefined) {
    requests.push({
      addProtectedRange: {
        protectedRange: {
          range: options.stockInEnabled
            ? {
                sheetId: stockInSheetId,
                startColumnIndex: 0,
                endColumnIndex: 2,
              }
            : { sheetId: stockInSheetId },
          description: options.stockInEnabled
            ? "Item reference — type in qty_delta / new_price / note instead"
            : "Stock In is switched off for this store",
          warningOnly: false,
        },
      },
    });
  }

  await batchUpdateSpreadsheet(spreadsheetId, requests);
}

export interface SyncResult {
  status: "synced" | "skipped";
  salesRows: number;
  inventoryRows: number;
  /** True when Stock In was left untouched because it holds pending input. */
  stockInPending: boolean;
}

/**
 * Push one store's ledger into its mirror.
 *
 * CLEAR then WRITE, in that order and never merged: writing 8 rows over a range
 * that held 40 leaves 32 rows of last week's sales sitting below the new ones,
 * looking every bit as current.
 *
 * Failures are recorded on the mirror row rather than thrown, because the usual
 * causes are the merchant's to fix (they deleted the file, or removed their own
 * access) and they never read server logs. The caller decides whether a failure
 * is worth surfacing louder than that.
 */
export async function syncSheetMirror(tenantId: number): Promise<SyncResult> {
  const mirror = await getSheetMirror(tenantId);
  if (!mirror || !isSheetsConfigured()) {
    return {
      status: "skipped",
      salesRows: 0,
      inventoryRows: 0,
      stockInPending: false,
    };
  }

  try {
    const tabs = await buildMirrorTabs(tenantId);

    // Only read Stock In when it could contain something: with lane 2 off the
    // merchant has no writer grant, so nothing can be pending there.
    let stockInPending = false;
    if (mirror.stockInEnabled) {
      const existing = await readValues(
        mirror.spreadsheetId,
        a1(STOCK_IN_TAB, `A${STOCK_IN_FIRST_DATA_ROW}:E`),
      );
      stockInPending = stockInHasPendingInput(existing);
    }

    const ranges = [
      a1(SALES_TAB, "A:I"),
      a1(INVENTORY_TAB, "A:H"),
      ...(stockInPending ? [] : [a1(STOCK_IN_TAB, "A:E")]),
    ];
    await clearRanges(mirror.spreadsheetId, ranges);

    await writeValues(mirror.spreadsheetId, [
      {
        range: a1(SALES_TAB, "A1"),
        values: [SALES_HEADER, ...tabs.sales],
      },
      {
        range: a1(INVENTORY_TAB, "A1"),
        values: [INVENTORY_HEADER, ...tabs.inventory],
      },
      ...(stockInPending
        ? []
        : [
            {
              range: a1(STOCK_IN_TAB, "A1"),
              values: [STOCK_IN_HEADER, STOCK_IN_HINT, ...tabs.stockIn],
            },
          ]),
    ]);

    await setSheetMirrorSyncResult(tenantId, null);
    return {
      status: "synced",
      salesRows: tabs.sales.length,
      inventoryRows: tabs.inventory.length,
      stockInPending,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setSheetMirrorSyncResult(tenantId, message);
    throw err;
  }
}

/**
 * Create a store's mirror, share it, and fill it.
 *
 * The spreadsheet is created by (and stays owned by) the platform service
 * account, then shared with the merchant. That ownership split is the security
 * model: the merchant cannot revoke our access, cannot delete the file out from
 * under the sync, and holds exactly the role lane 2 requires and no more.
 */
export async function connectSheetMirror(
  tenantId: number,
  options: { storeName: string; shareWith: string; stockInEnabled: boolean },
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const created = await createSpreadsheet(
    `${options.storeName} — Zolto sales & inventory`,
    // All three tabs exist from the start, so enabling lane 2 later is a
    // permission change rather than a restructuring of a live file.
    MIRROR_TABS,
  );

  await applyMirrorProtection(created.spreadsheetId, {
    stockInEnabled: options.stockInEnabled,
  });
  await shareSpreadsheet(
    created.spreadsheetId,
    options.shareWith,
    options.stockInEnabled ? "writer" : "reader",
  );

  await upsertSheetMirror({
    tenantId,
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
    sharedWith: options.shareWith,
    stockInEnabled: options.stockInEnabled,
  });

  // A mirror that opens empty reads as broken, so fill it before handing the
  // merchant the link. A failure here leaves a connected-but-unsynced mirror
  // with its reason recorded, which the admin page shows and the next sweep
  // retries — better than unwinding a spreadsheet the merchant may already be
  // looking at.
  await syncSheetMirror(tenantId).catch(() => {});

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
  };
}

/**
 * Turn the inbound lane on or off.
 *
 * Order matters: protection is re-applied BEFORE the share is widened, so the
 * spreadsheet is never briefly a writable copy of the books. On the way back
 * down the grant is narrowed to `reader` and the whole Stock In tab re-locked.
 */
export async function setStockInEnabled(
  tenantId: number,
  enabled: boolean,
): Promise<void> {
  const mirror = await getSheetMirror(tenantId);
  if (!mirror) return;

  await applyMirrorProtection(mirror.spreadsheetId, {
    stockInEnabled: enabled,
  });
  await shareSpreadsheet(
    mirror.spreadsheetId,
    mirror.sharedWith,
    enabled ? "writer" : "reader",
  );
  await setSheetMirrorStockIn(tenantId, enabled);
  if (enabled) await syncSheetMirror(tenantId).catch(() => {});
}

/**
 * Disconnect: withdraw the merchant's access, stop syncing, forget the mirror.
 *
 * The spreadsheet is NOT deleted. Zolto owns it, which means deleting would
 * destroy a store's sales history on their behalf from one button press — and a
 * platform that can do that to data the merchant thinks of as theirs is exactly
 * the "captured" feeling this feature is supposed to avoid. Revoking the share
 * ends the exposure without ending the data: support can restore access, and a
 * later reconnect has something to point at.
 *
 * The trade-off is that the merchant loses their view of it here, so the admin
 * page tells them to download a copy first — Drive gives viewers File → Download
 * and File → Make a copy, so taking one is always available right up to the
 * moment they press this.
 *
 * A Drive failure does not block the local disconnect: the merchant asked to be
 * disconnected, and syncing must stop even if the unshare call does not land.
 */
export async function disconnectSheetMirror(tenantId: number): Promise<void> {
  const mirror = await getSheetMirror(tenantId);
  if (!mirror) return;
  try {
    await unshareSpreadsheet(mirror.spreadsheetId, mirror.sharedWith);
  } catch (err) {
    console.error(
      `[SheetMirror] Could not unshare spreadsheet ${mirror.spreadsheetId}:`,
      err,
    );
  }
  await deleteSheetMirror(tenantId);
}

export interface SweepSummary {
  attempted: number;
  synced: number;
  failed: number;
}

/**
 * Refresh every connected mirror. Driven by the scheduled heartbeat.
 *
 * Sequential, not parallel: the Sheets API's quota is per PROJECT, shared by
 * every store on the platform, so a fan-out across tenants is the one shape
 * guaranteed to trip it. One store's failure never stops the sweep.
 */
export async function runSheetMirrorSweep(): Promise<SweepSummary> {
  if (!isSheetsConfigured()) return { attempted: 0, synced: 0, failed: 0 };

  const mirrors = await listSheetMirrors();
  let synced = 0;
  let failed = 0;
  for (const mirror of mirrors) {
    try {
      const result = await syncSheetMirror(mirror.tenantId);
      if (result.status === "synced") synced += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `[SheetMirror] Sync failed for tenant ${mirror.tenantId}:`,
        err,
      );
    }
  }
  return { attempted: mirrors.length, synced, failed };
}
