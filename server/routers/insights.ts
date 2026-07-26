/**
 * Insights router — basic stats for every plan, AI narrative on Studio+
 * (PLAN_FEATURES.analytics === "advanced"). The plan check is inline because
 * analytics is a tiered feature, not a boolean.
 */

import { TRPCError } from "@trpc/server";
import {
  router,
  adminProcedure,
  requireTenant,
  PLAN_FEATURES,
  type PlanId,
} from "../_core/trpc";
import { computeInsights, generateInsightsNarrative } from "../insights";
import { getTenantSettings } from "../db";

const tenantAdmin = adminProcedure.use(requireTenant);

export const insightsRouter = router({
  /** Computed stats — every plan (basic analytics). */
  summary: tenantAdmin.query(async ({ ctx }) => {
    const settings = await getTenantSettings(ctx.tenant.id);
    return computeInsights(ctx.tenant.id, settings?.currency || "chf");
  }),

  /** LLM narrative — Studio+ only (advanced analytics). */
  narrative: tenantAdmin.query(async ({ ctx }) => {
    const features = PLAN_FEATURES[ctx.tenant.plan as PlanId];
    if (features?.analytics !== "advanced") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "AI insights are part of the Studio plan's advanced analytics. Please upgrade.",
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
