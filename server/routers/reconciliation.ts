import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantAdminProcedure } from "../_core/trpc";
import {
  NotConnectedError,
  runStripeReconciliationForTenant,
} from "../reconciliation";
import { runPosAttribution } from "../posAttribution";
import {
  listPendingReview,
  PendingResolveError,
  resolvePendingPos,
  resolvePendingStripe,
} from "../pendingReview";

/**
 * Turns a resolve failure into the tRPC code that matches what happened. All
 * four are the merchant's own store's business — nothing here distinguishes
 * "no such row" from "another store's row", because `pendingReview` scopes
 * every read by tenant and both arrive as not_found.
 */
function asTrpcError(err: PendingResolveError): TRPCError {
  const code =
    err.reason === "not_found"
      ? "NOT_FOUND"
      : err.reason === "not_a_candidate"
        ? "BAD_REQUEST"
        : "CONFLICT";
  return new TRPCError({ code, message: err.message });
}

const resolveInput = z.object({
  id: z.number().int().positive(),
  /** null is "none of these" — leave it for manual handling, touch no stock. */
  productId: z.number().int().positive().nullable(),
});

export const reconciliationRouter = router({
  // Everything the store has been asked to confirm and hasn't, for the console
  // to render directly. This is the durable path: the scans' review emails can
  // go missing, but this list is always there and needs no token.
  listPending: tenantAdminProcedure.query(async ({ ctx }) => {
    return await listPendingReview(ctx.tenant.id);
  }),

  // Assign an unmatched Stripe payment to a piece (or set it aside). The
  // emailed one-click links do the same thing via a bearer token; this does it
  // with the admin's own session.
  resolveStripe: tenantAdminProcedure
    .input(resolveInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await resolvePendingStripe(
          ctx.tenant.id,
          input.id,
          input.productId,
        );
      } catch (err) {
        if (err instanceof PendingResolveError) throw asTrpcError(err);
        throw err;
      }
    }),

  resolvePos: tenantAdminProcedure
    .input(resolveInput)
    .mutation(async ({ ctx, input }) => {
      try {
        return await resolvePendingPos(
          ctx.tenant.id,
          input.id,
          input.productId,
        );
      } catch (err) {
        if (err instanceof PendingResolveError) throw asTrpcError(err);
        throw err;
      }
    }),
  // Scan the merchant's OWN connected Stripe account for succeeded payments
  // with no local counterpart, shortlist candidate products from their own
  // catalogue, and email them to confirm.
  //
  // Scoped to the caller's store. This used to scan the PLATFORM's Stripe
  // account and match against DEFAULT_TENANT_ID, so for any merchant who
  // wasn't the default tenant it could not see a single one of their payments
  // — it was an operator tool wearing a merchant-facing button.
  run: tenantAdminProcedure
    .input(
      z.object({ lookbackDays: z.number().int().min(1).max(90).optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await runStripeReconciliationForTenant(
          ctx.tenant,
          input.lookbackDays,
        );
      } catch (err) {
        // "You haven't connected Stripe" is a normal state for an
        // in-person-only merchant, not a server fault — say so plainly
        // instead of surfacing a 500.
        if (err instanceof NotConnectedError) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: err.message,
          });
        }
        if (
          err instanceof Error &&
          err.message === "Stripe is not configured"
        ) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: err.message,
          });
        }
        throw err;
      }
    }),

  // End-of-day pass over amount-only POS sales that were never tied to a
  // product. Guesses the likely piece for each and queues it for confirmation.
  // No Stripe dependency — covers cash/TWINT too.
  //
  // Scoped to the CALLER'S store. It previously swept every tenant's POS lines,
  // so one merchant pressing "Scan" wrote pos_attributions rows for every other
  // store on the platform and folded their volume into the returned counts.
  runPos: tenantAdminProcedure
    .input(
      z.object({ lookbackDays: z.number().int().min(1).max(30).optional() }),
    )
    .mutation(async ({ ctx, input }) => {
      return await runPosAttribution(input.lookbackDays, ctx.tenant.id);
    }),
});
