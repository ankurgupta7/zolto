/**
 * Platform router — Zolto's own operating metrics, for the platform owner.
 *
 * Superadmin only, and deliberately separate from the tenant-facing routers:
 * everything here reads ACROSS tenants, which no store owner may ever do. A
 * tenant's own numbers live in billing.getStatus.
 *
 * Exists because the pricing model has one metric that decides whether the
 * business floats — the share of free in-person vendors who make an online or
 * agent sale — and until now nothing could compute it
 * (docs/planning/pricing-pivot-agent-commerce.md §5).
 */

import { z } from "zod";
import { router, superadminProcedure } from "../_core/trpc";
import { getPlatformMetrics } from "../db";
import { runStripeReconciliationForAllTenants } from "../reconciliation";
import { PRO_PLAN, REVENUE_SHARE } from "@shared/platform";

export const platformRouter = router({
  metrics: superadminProcedure.query(async () => {
    const metrics = await getPlatformMetrics();
    return {
      ...metrics,
      // Rendered alongside the numbers so the dashboard states the model it is
      // measuring, rather than leaving a bare percentage to interpret.
      model: {
        feePercentLabel: REVENUE_SHARE.percentLabel,
        proPriceChf: PRO_PLAN.priceChf,
      },
    };
  }),

  /**
   * Platform-wide Stripe reconciliation: every tenant that has connected
   * Stripe, each scanned against their OWN account.
   *
   * The merchant-facing button (reconciliation.run) covers one store. This is
   * the operator's sweep — useful for catching stores that never press their
   * own button, and the only place the cross-tenant picture is legitimate.
   *
   * A single tenant's failure (revoked Connect grant, Stripe outage) is
   * recorded per tenant rather than aborting the sweep, so one bad store
   * cannot hide every other store's unmatched payments.
   */
  reconcileAllTenants: superadminProcedure
    .input(
      z.object({ lookbackDays: z.number().int().min(1).max(90).optional() }),
    )
    .mutation(async ({ input }) => {
      return runStripeReconciliationForAllTenants(input.lookbackDays);
    }),
});
