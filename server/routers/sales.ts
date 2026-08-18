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
 * The ledger itself is built by server/salesLedger.ts, shared with the Google
 * Sheets mirror so the spreadsheet and this table can never disagree about what
 * the store sold. This router is the authorization boundary and the input schema
 * around it; the rows come from there.
 *
 * `adminProcedure`, not `tenantAdminProcedure`: every read below is scoped
 * through `ctx.user.tenantId` — the caller's OWN store — and nothing here
 * touches `ctx.tenant` (the host-derived store), which is the shape CLAUDE.md
 * documents as safe for a bare `adminProcedure`. An admin of store A pointing
 * at store B's subdomain still only ever sees A's ledger.
 */

import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { MAX_ORDERS_SCANNED, backfillPosLineItems } from "../posBackfill";
import { DEFAULT_WINDOW, MAX_WINDOW, buildSalesLedger } from "../salesLedger";

export type {
  SaleChannel,
  SaleLedgerItem,
  SaleLedgerRow,
} from "../salesLedger";

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

export const salesRouter = router({
  list: adminProcedure
    .input(listInput)
    .query(({ ctx, input }) => buildSalesLedger(ctx.user.tenantId, input)),

  /**
   * Reconstruct the line items of POS sales recorded before the insertId fix,
   * from the descriptions their Stripe payments carry (see posBackfill.ts).
   *
   * A mutation because it writes, but it previews by default: `dryRun` is only
   * false when the caller says so explicitly, so an admin sees the report
   * before anything lands. Idempotent either way — it only ever looks at
   * orders that have no line items.
   *
   * Scoped through ctx.user.tenantId like every other read here, so this
   * repairs the caller's OWN store and never the one the host resolves to.
   */
  backfillLineItems: adminProcedure
    .input(
      z
        .object({
          dryRun: z.boolean().default(true),
          limit: z.number().int().min(1).max(MAX_ORDERS_SCANNED).optional(),
        })
        .default({ dryRun: true }),
    )
    .mutation(({ ctx, input }) =>
      backfillPosLineItems(ctx.user.tenantId, {
        dryRun: input.dryRun,
        limit: input.limit,
      }),
    ),
});
