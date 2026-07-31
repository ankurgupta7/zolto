import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { requireTenant } from "../_core/trpc";
import {
  createPlanCheckoutSession,
  isBillingConfigured,
  type PaidPlanId,
} from "../billing";
import {
  PLANS,
  PRO_PLAN,
  storageBytesForPlan,
  PRO_BREAK_EVEN_ONLINE_CHF,
  REVENUE_SHARE,
} from "@shared/platform";
import {
  getMonthlyOnlineSales,
  getPhotoCreditHistory,
  getTenantStorageBytes,
} from "../db";
import {
  countPhotoGenerationsThisMonth,
  generateStyledProductPhoto,
  photoAllowanceForPlan,
} from "../photoCredits";

// ═══════════════════════════════════════════════════════════════════════════════
// Billing Router — Free/Pro plan management + AI usage + the skim-vs-Pro upsell
// All procedures require a tenant admin (the store owner managing their own
// subscription); platform-level operations stay superadmin-only elsewhere.
// ═══════════════════════════════════════════════════════════════════════════════

const tenantAdmin = adminProcedure.use(requireTenant);

export const billingRouter = router({
  /**
   * Current plan, billing status, AI usage, and this month's online-fee
   * numbers — including the locked upsell trigger: once 1% of monthly online
   * sales exceeds Pro's flat price, `upsell.savingsChf` goes positive and
   * the UI surfaces "you'd save CHF X on Pro this month".
   */
  getStatus: tenantAdmin.query(async ({ ctx }) => {
    const allowance = photoAllowanceForPlan(ctx.tenant.plan);
    const [usedThisMonth, online, storageBytes] = await Promise.all([
      allowance === null
        ? Promise.resolve(0)
        : countPhotoGenerationsThisMonth(ctx.tenant.id),
      getMonthlyOnlineSales(ctx.tenant.id),
      getTenantStorageBytes(ctx.tenant.id),
    ]);
    const onFree = ctx.tenant.plan !== "pro";
    const skimChf = online.feeRappen / 100;
    // Grandfathered subscribers still bill at a retired tier's price; show
    // them what they actually pay rather than Pro's list price.
    const legacyPriceChf = ctx.tenant.planPriceOverride
      ? Number(ctx.tenant.planPriceOverride)
      : null;

    return {
      plan: ctx.tenant.plan,
      subscriptionStatus: ctx.tenant.subscriptionStatus,
      trialEndsAt: ctx.tenant.trialEndsAt,
      /** Non-null only while a tenant is billed at a pre-pivot price. */
      legacyPriceChf,
      ai: {
        /** null = unmetered (Pro). */
        allowancePerMonth: allowance,
        usedThisMonth: allowance === null ? null : usedThisMonth,
      },
      onlineFees: {
        feePercentLabel: REVENUE_SHARE.percentLabel,
        appliesTo: REVENUE_SHARE.appliesTo,
        monthGmvChf: online.gmvRappen / 100,
        monthAgentGmvChf: online.agentGmvRappen / 100,
        monthOrderCount: online.orderCount,
        monthFeeChf: skimChf,
      },
      upsell: onFree
        ? {
            breakEvenOnlineChf: PRO_BREAK_EVEN_ONLINE_CHF,
            proPriceChf: PRO_PLAN.priceChf,
            /** Positive once this month's 1% exceeds Pro's flat price. */
            savingsChf: Math.round((skimChf - PRO_PLAN.priceChf) * 100) / 100,
          }
        : null,
      plans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        priceChf: p.priceChf,
        onlineFeeBps: p.onlineFeeBps,
        aiPhotoAllowancePerMonth: p.aiPhotoAllowancePerMonth,
        maxProducts: p.maxProducts,
        storageGb: p.storageGb,
      })),
      // Surfaced so a merchant can see where they stand BEFORE an upload is
      // refused. A quota you only learn about by hitting it is a support ticket.
      storage: {
        usedBytes: storageBytes,
        limitBytes: storageBytesForPlan(ctx.tenant.plan),
      },
      billingConfigured: isBillingConfigured(),
    };
  }),

  /** Start a Stripe Checkout subscription for the Pro plan. */
  createPlanCheckout: tenantAdmin
    .input(z.object({ plan: z.enum(["pro"]) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await createPlanCheckoutSession({
          tenant: ctx.tenant,
          plan: input.plan as PaidPlanId,
          req: ctx.req,
        });
      } catch (err) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),

  /** AI photo generation log for the merchant's own transparency (newest first). */
  photoCreditHistory: tenantAdmin.query(async ({ ctx }) => {
    return getPhotoCreditHistory(ctx.tenant.id);
  }),

  /**
   * Generate an AI-styled photo for one of the merchant's products.
   * Counts against the Free plan's monthly allowance; unmetered on Pro.
   */
  generateProductPhoto: tenantAdmin
    .input(
      z.object({
        productId: z.number().int().positive(),
        stylePrompt: z.string().min(3).max(1000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return generateStyledProductPhoto({
        tenantId: ctx.tenant.id,
        plan: ctx.tenant.plan,
        productId: input.productId,
        stylePrompt: input.stylePrompt,
      });
    }),
});
