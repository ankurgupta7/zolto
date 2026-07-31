/**
 * Insights router — basic stats for every plan, AI narrative on Pro
 * (PLAN_FEATURES.analytics === "advanced"). The plan check is inline because
 * analytics is a tiered feature, not a boolean.
 */

import { TRPCError } from "@trpc/server";
import {
  router,
  tenantAdminProcedure,
  PLAN_FEATURES,
  type PlanId,
} from "../_core/trpc";
import { computeInsights, generateInsightsNarrative } from "../insights";
import { getTenantSettings } from "../db";

// Store-admin guard. `adminProcedure.use(requireTenant)` alone is NOT enough:
// ctx.tenant comes from the request host, so an admin of store A hitting store
// B's subdomain would pass it and act on B's data. tenantAdminProcedure adds
// the belongs-to-this-tenant check (server/_core/trpc.ts).
const tenantAdmin = tenantAdminProcedure;

export const insightsRouter = router({
  /** Computed stats — every plan (basic analytics). */
  summary: tenantAdmin.query(async ({ ctx }) => {
    const settings = await getTenantSettings(ctx.tenant.id);
    return computeInsights(ctx.tenant.id, settings?.currency || "chf");
  }),

  /** LLM narrative — Pro only (advanced analytics). */
  narrative: tenantAdmin.query(async ({ ctx }) => {
    const features = PLAN_FEATURES[ctx.tenant.plan as PlanId];
    if (features?.analytics !== "advanced") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "AI insights are part of the Pro plan's advanced analytics. Please upgrade.",
      });
    }
    const settings = await getTenantSettings(ctx.tenant.id);
    const summary = await computeInsights(
      ctx.tenant.id,
      settings?.currency || "chf",
    );
    const narrative = await generateInsightsNarrative(ctx.tenant.name, summary);
    return { narrative, generatedAt: new Date().toISOString() };
  }),
});
