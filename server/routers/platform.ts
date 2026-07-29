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

import { router, superadminProcedure } from "../_core/trpc";
import { getPlatformMetrics } from "../db";
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
});
