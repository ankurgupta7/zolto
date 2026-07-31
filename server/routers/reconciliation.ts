import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, tenantAdminProcedure } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import { runStripeReconciliation } from "../reconciliation";
import { runPosAttribution } from "../posAttribution";

export const reconciliationRouter = router({
  // Admin: scan recent Stripe payments for ones missing from our own records,
  // guess candidate products for each, and email the admin to confirm.
  //
  // ⚠ NOT tenant-scoped, unlike runPos below. This scans the PLATFORM's own
  // Stripe account, matches against DEFAULT_TENANT_ID's catalogue, and emails
  // ADMIN_EMAIL — see the note in server/reconciliation.ts. So it is really a
  // platform-operator job wearing a merchant-facing button (it is reachable
  // from the store-plane Reconciliation page), and any tenant admin can
  // trigger it: minor aggregate info leak in the returned counts, plus Stripe
  // API burn and noise mail to the operator.
  //
  // Deliberately left on adminProcedure rather than tightened to superadmin,
  // because that would remove a button merchants can currently see and needs a
  // product decision first. Either make it genuinely per-tenant (scan each
  // tenant's CONNECTED account) or move it to the platform plane and make it
  // superadminProcedure — do not leave it half-way indefinitely.
  run: adminProcedure
    .input(
      z.object({ lookbackDays: z.number().int().min(1).max(90).optional() }),
    )
    .mutation(async ({ input }) => {
      try {
        return await runStripeReconciliation(input.lookbackDays);
      } catch (err) {
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

  // Admin: end-of-day pass over amount-only POS sales that were never tied to a
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
