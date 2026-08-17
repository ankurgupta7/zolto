/**
 * The store's transaction ledger, as data — shared by everything that publishes
 * it.
 *
 * This started life inside `salesRouter.list` and was lifted out when the Google
 * Sheets mirror needed the same rows: a spreadsheet whose "Sales" tab disagreed
 * with the /admin/sales table underneath it would be worse than no spreadsheet,
 * and two implementations of "merge both channels, name the line items, total
 * them up" is exactly how that disagreement arrives. One builder, two surfaces.
 *
 * Reads only, and every read is scoped by the `tenantId` argument. There is no
 * ambient tenant here — the caller says whose ledger it wants, which is what
 * lets the scheduled mirror sweep iterate stores without a request context.
 */

import { getPaidOrders, getPosSalesWithItems, getProductsByIds } from "./db";

/** How many transactions per channel we are willing to pull into memory. */
export const MAX_WINDOW = 1000;
export const DEFAULT_WINDOW = 200;

export type SaleChannel = "pos" | "online";

export interface SaleLedgerItem {
  productId: number | null;
  name: string;
  /** Smallest currency unit (Rappen for CHF). */
  amountMinor: number;
}

export interface SaleLedgerRow {
  /** Unique across channels — the row id alone collides between the tables. */
  key: string;
  id: number;
  channel: SaleChannel;
  /** Invoice number for POS sales, `#id` for online ones. */
  reference: string;
  createdAt: string;
  paymentMethod: string | null;
  currency: string;
  amountMinor: number;
  customerName: string | null;
  customerEmail: string | null;
  items: SaleLedgerItem[];
}

export interface SalesLedgerQuery {
  channel: "all" | "pos" | "online";
  /** Matches `paymentMethod` exactly (cash, card, twint, twint_qr…). */
  paymentMethod?: string;
  /** Inclusive ISO date (YYYY-MM-DD or full timestamp). */
  from?: string;
  /** Exclusive ISO date — callers pass the day AFTER the last day wanted. */
  to?: string;
  /** Case-insensitive substring over reference, customer, and item names. */
  search?: string;
  limit: number;
}

export interface SalesLedgerTotals {
  count: number;
  grossMinor: number;
  posCount: number;
  posGrossMinor: number;
  onlineCount: number;
  onlineGrossMinor: number;
}

export interface SalesLedger {
  rows: SaleLedgerRow[];
  totals: SalesLedgerTotals;
  /** Every distinct method present, so a filter offers only real ones. */
  paymentMethods: string[];
  truncated: boolean;
}

/** Parse a caller-supplied date, ignoring anything unparseable. */
function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function matchesSearch(row: SaleLedgerRow, needle: string): boolean {
  const haystack = [
    row.reference,
    row.customerName ?? "",
    row.customerEmail ?? "",
    ...row.items.map((i) => i.name),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * Both channels within the window, merged, filtered, newest first.
 *
 * Totals are computed over the rows actually returned, and `truncated` says so
 * when a channel hit the window cap — a summary that silently described a
 * different set of sales than the table (or spreadsheet) under it would be worse
 * than none.
 */
export async function buildSalesLedger(
  tenantId: number,
  query: SalesLedgerQuery,
): Promise<SalesLedger> {
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  const wantPos = query.channel !== "online";
  const wantOnline = query.channel !== "pos";

  const [posSales, onlineOrders] = await Promise.all([
    wantPos
      ? getPosSalesWithItems(tenantId, { limit: query.limit, from, to })
      : Promise.resolve([]),
    wantOnline
      ? getPaidOrders(tenantId, query.limit, { from, to })
      : Promise.resolve([]),
  ]);

  // Online orders store a comma-separated product id list rather than line
  // item rows, so their names come from one batched product lookup.
  const onlineProductIds = (order: { productIds: string }) =>
    order.productIds
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
  const referencedIds = Array.from(
    new Set(onlineOrders.flatMap(onlineProductIds)),
  );
  const nameById = new Map(
    (referencedIds.length
      ? await getProductsByIds(tenantId, referencedIds)
      : []
    ).map((p) => [p.id, p.name]),
  );

  const posRows: SaleLedgerRow[] = posSales.map(({ order, items }) => ({
    key: `pos-${order.id}`,
    id: order.id,
    channel: "pos",
    reference: order.invoiceNumber ?? `KPOS-${order.id}`,
    createdAt: order.createdAt.toISOString(),
    paymentMethod: order.paymentMethod,
    currency: "chf",
    amountMinor: order.totalRappen,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    items: items.map((i) => ({
      productId: i.productId,
      name: i.name,
      amountMinor: i.priceRappen,
    })),
  }));

  const onlineRows: SaleLedgerRow[] = onlineOrders.map((order) => ({
    key: `online-${order.id}`,
    id: order.id,
    channel: "online",
    reference: `#${order.id}`,
    createdAt: order.createdAt.toISOString(),
    paymentMethod: order.paymentMethod,
    currency: order.currency,
    amountMinor: order.amountTotal,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    // An online order records what was bought but not what each line cost
    // (only the charged total), so line amounts are deliberately absent
    // rather than guessed from today's list price.
    items: onlineProductIds(order).map((id) => ({
      productId: id,
      name: nameById.get(id) ?? `#${id}`,
      amountMinor: 0,
    })),
  }));

  const needle = query.search?.trim().toLowerCase();
  const rows = [...posRows, ...onlineRows]
    .filter((r) =>
      query.paymentMethod ? r.paymentMethod === query.paymentMethod : true,
    )
    .filter((r) => (needle ? matchesSearch(r, needle) : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const totals: SalesLedgerTotals = {
    count: rows.length,
    grossMinor: rows.reduce((sum, r) => sum + r.amountMinor, 0),
    posCount: rows.filter((r) => r.channel === "pos").length,
    posGrossMinor: rows
      .filter((r) => r.channel === "pos")
      .reduce((sum, r) => sum + r.amountMinor, 0),
    onlineCount: rows.filter((r) => r.channel === "online").length,
    onlineGrossMinor: rows
      .filter((r) => r.channel === "online")
      .reduce((sum, r) => sum + r.amountMinor, 0),
  };

  const paymentMethods = Array.from(
    new Set(
      [...posRows, ...onlineRows]
        .map((r) => r.paymentMethod)
        .filter((m): m is string => Boolean(m)),
    ),
  ).sort();

  return {
    rows,
    totals,
    paymentMethods,
    truncated:
      posSales.length >= query.limit || onlineOrders.length >= query.limit,
  };
}
