import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../_core/trpc";
import { adminProcedure } from "../procedures";
import { runStripeReconciliation } from "../reconciliation";
import { runPosAttribution } from "../posAttribution";

export const reconciliationRouter = router({
  // Admin: scan recent Stripe payments for ones missing from our own records,
  // guess candidate products for each, and email the admin to confirm.
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
  // product. Guesses the likely piece for each (per-tenant) and emails the
  // merchant a one-click confirm link. No Stripe dependency — covers cash/TWINT too.
  runPos: adminProcedure
    .input(
      z.object({ lookbackDays: z.number().int().min(1).max(30).optional() }),
    )
    .mutation(async ({ input }) => {
      return await runPosAttribution(input.lookbackDays);
    }),
});
