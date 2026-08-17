/**
 * Stock In — review and approve the changes a merchant typed into their sheet.
 *
 * The inbound half of the spreadsheet mirror. `preview` reads the Stock In tab
 * and returns a validated diff against the live catalogue; `apply` writes it,
 * but only if the tab still holds exactly what was reviewed.
 *
 * `adminProcedure` scoped through `ctx.user.tenantId`, like sheets.ts and
 * products.ts — nothing here reads `ctx.tenant`. Approving a restock is a write
 * to the catalogue, so the tenant scoping is doing real work: it is what stops an
 * admin of one store approving rows against another's stock.
 *
 * Note that `preview` is a *mutation*, not a query, despite writing nothing.
 * Every call spends a Google Sheets read from a per-project quota shared by the
 * whole platform, and React Query would refetch a query on every window focus.
 * The admin presses Review; that is the only thing that should cost a read.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { getSheetMirror } from "../db";
import { isSheetsConfigured } from "../googleSheets";
import { StockInConflictError, applyStockIn, previewStockIn } from "../stockIn";

/** Both routes need a mirror with the inbound lane actually switched on. */
async function assertStockInAvailable(tenantId: number): Promise<void> {
  if (!isSheetsConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Google Sheets is not configured for this installation.",
    });
  }
  const mirror = await getSheetMirror(tenantId);
  if (!mirror) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This store has no spreadsheet mirror yet.",
    });
  }
  if (!mirror.stockInEnabled) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The Stock In tab is switched off for this store.",
    });
  }
}

export const stockInRouter = router({
  preview: adminProcedure.mutation(async ({ ctx }) => {
    await assertStockInAvailable(ctx.user.tenantId);
    try {
      return await previewStockIn(ctx.user.tenantId);
    } catch (err) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message:
          err instanceof Error
            ? err.message
            : "Could not read the Stock In tab",
      });
    }
  }),

  // Named `applyChanges` rather than `apply`: tRPC reserves the keys that would
  // shadow Function.prototype members, and `apply` is one of them.
  applyChanges: adminProcedure
    .input(
      z.object({
        /**
         * The fingerprint `preview` returned. Required and non-empty: an apply
         * with no hash would be an apply of whatever the tab happens to say
         * right now, which is exactly the review step this exists to enforce.
         */
        hash: z.string().min(1).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertStockInAvailable(ctx.user.tenantId);
      try {
        return await applyStockIn(ctx.user.tenantId, ctx.user.id, input.hash);
      } catch (err) {
        if (err instanceof StockInConflictError) {
          // 409 rather than 400: nothing about the request was malformed, the
          // world moved underneath it. The client's fix is to re-review.
          throw new TRPCError({ code: "CONFLICT", message: err.message });
        }
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            err instanceof Error
              ? err.message
              : "Could not apply the Stock In tab",
        });
      }
    }),
});
