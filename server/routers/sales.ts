/**
 * Sales — the store's transaction ledger, as data rather than as a narrative.
 *
 * The admin could already see online orders (checkout.listOrders) and an AI
 * summary of how trading was going (insights). Neither answered the plainest
 * question a shopkeeper asks: *what did I actually sell?* In-person sales — the
 * bulk of takings for a market stall — had no admin surface at all, and the
 * insights route needs an AI model configured, so with the model off there was
 * nothing left. This router is the unglamorous, always-available answer: every
 * paid transaction, both channels, with its line items.
 *
 * `adminProcedure`, not `tenantAdminProcedure`: every read below is scoped
 * through `ctx.user.tenantId` — the caller's OWN store — and nothing here
 * touches `ctx.tenant` (the host-derived store), which is the shape CLAUDE.md
 * documents as safe for a bare `adminProcedure`. An admin of store A pointing
 * at store B's subdomain still only ever sees A's ledger.
 */

import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getPaidOrders, getPosSalesWithItems, getProductsByIds } from "../db";

/** How many transactions per channel we are willing to pull into memory. */
const MAX_WINDOW = 1000;
const DEFAULT_WINDOW = 200;

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

const listInput = z
  .object({
    channel: z.enum(["all", "pos", "online"]).default("all"),
    /** Matches `paymentMethod` exactly (cash, card, twint, twint_qr…). */
    paymentMethod: z.string().min(1).max(32).optional(),
    /** Inclusive ISO date (YYYY-MM-DD or full timestamp). */
    from: z.string().min(1).optional(),
    /** Exclusive ISO date — callers pass the day AFTER the last day wanted. */
    to: z.string().min(1).optional(),
    /** Case-insensitive substring over reference, customer, and item names. */
    search: z.string().max(120).optional(),
    limit: z.number().int().min(1).max(MAX_WINDOW).default(DEFAULT_WINDOW),
  })
  .default({ channel: "all", limit: DEFAULT_WINDOW });

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

export const salesRouter = router({
  /**
   * The ledger itself. Both channels are read within the window, merged,
   * filtered, and returned newest first.
   *
   * Totals are computed over the rows actually returned, and `truncated` says
   * so when a channel hit the window cap — a summary that silently described a
   * different set of sales than the table under it would be worse than none.
   */
  list: adminProcedure.input(listInput).query(async ({ ctx, input }) => {
    const tenantId = ctx.user.tenantId;
    const from = parseDate(input.from);
    const to = parseDate(input.to);
    const wantPos = input.channel !== "online";
    const wantOnline = input.channel !== "pos";

    const [posSales, onlineOrders] = await Promise.all([
      wantPos
        ? getPosSalesWithItems(tenantId, { limit: input.limit, from, to })
        : Promise.resolve([]),
      wantOnline
        ? getPaidOrders(tenantId, input.limit, { from, to })
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

    const needle = input.search?.trim().toLowerCase();
    const rows = [...posRows, ...onlineRows]
      .filter((r) =>
        input.paymentMethod ? r.paymentMethod === input.paymentMethod : true,
      )
      .filter((r) => (needle ? matchesSearch(r, needle) : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totals = {
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

    // Every distinct method present, so the UI's filter offers exactly the
    // methods this store has actually taken money by.
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
        posSales.length >= input.limit || onlineOrders.length >= input.limit,
    };
  }),
});
