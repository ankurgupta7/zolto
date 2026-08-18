/**
 * Insights router — basic stats for every plan, AI narrative on Pro
 * (PLAN_FEATURES.analytics === "advanced"). The plan check is inline because
 * analytics is a tiered feature, not a boolean.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantAdminProcedure, featuresForTenant } from "../_core/trpc";
import { computeInsights, generateInsightsNarrative } from "../insights";
import { getAgentHits, getTenantSettings } from "../db";
import {
  dayKey,
  isAgentSurface,
  summarizeAgentHits,
  type AgentHitRow,
} from "@shared/aiAgents";

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
    const features = featuresForTenant(ctx.tenant);
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

  /**
   * What the AI agents did on this store — the reach that precedes an
   * `orders.channel = 'agent'` sale (server/agentHits.ts).
   *
   * Every plan, like `summary`: a merchant deciding whether agent commerce is
   * worth anything to them cannot be asked to upgrade to find out. The Pro tier
   * is the LLM narrative, not the numbers.
   */
  agentTraffic: tenantAdmin
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - (input.days - 1) * 86_400_000);
      // ctx.tenant.id, not an input — tenantAdminProcedure has already proved
      // the caller administers this store, and taking a tenant id from the
      // client would throw that proof away.
      const rows = await getAgentHits(ctx.tenant.id, dayKey(since));
      const typed: AgentHitRow[] = rows
        // A surface retired from AGENT_SURFACES leaves its old rows behind;
        // drop them rather than charting a category the UI cannot label.
        .filter((r) => isAgentSurface(r.surface))
        .map((r) => ({
          tenantId: r.tenantId,
          day: r.day,
          surface: r.surface as AgentHitRow["surface"],
          mcpTool: r.mcpTool,
          agent: r.agent,
          count: r.count,
        }));
      return { days: input.days, ...summarizeAgentHits(typed, input.days) };
    }),
});
