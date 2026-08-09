import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, tenantAdminProcedure } from "../_core/trpc";
import {
  createPlanCheckoutSession,
  isBillingConfigured,
  type PaidPlanId,
} from "../billing";
import {
  effectivePlan,
  entitlementsFor,
  isPlanComped,
} from "@shared/entitlements";
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

// Store-admin guard. `adminProcedure.use(requireTenant)` alone is NOT enough:
// ctx.tenant comes from the request host, so an admin of store A hitting store
// B's subdomain would pass it and act on B's data. tenantAdminProcedure adds
// the belongs-to-this-tenant check (server/_core/trpc.ts).
const tenantAdmin = tenantAdminProcedure;

export const billingRouter = router({
  /**
   * Current plan, billing status, AI usage, and this month's online-fee
   * numbers — including the locked upsell trigger: once 1% of monthly online
   * sales exceeds Pro's flat price, `upsell.savingsChf` goes positive and
   * the UI surfaces "you'd save CHF X on Pro this month".
   */
  getStatus: tenantAdmin.query(async ({ ctx }) => {
    // Everything below reads the ENTITLED plan, not the paid one: a store the
    // platform owner has comped onto Pro sees Pro's allowances and must not be
    // shown an upsell for what it has already been given.
    const entitlements = entitlementsFor(ctx.tenant);
    const allowance = photoAllowanceForPlan(entitlements.effectivePlan);
    const [usedThisMonth, online, storageBytes] = await Promise.all([
      allowance === null
        ? Promise.resolve(0)
        : countPhotoGenerationsThisMonth(ctx.tenant.id),
      getMonthlyOnlineSales(ctx.tenant.id),
      getTenantStorageBytes(ctx.tenant.id),
    ]);
    // The upsell only makes sense for a store that would actually pay the fee.
    const payingTheSkim = entitlements.onlineFeeBps > 0;
    const skimChf = online.feeRappen / 100;

    return {
      plan: entitlements.effectivePlan,
      /**
       * What this store is comped, if anything — the merchant's own view of
       * the grant, so "Pro, on the house" reads as deliberate rather than as a
       * billing bug they might try to "fix" by paying for it again.
       *
       * Deliberately NOT `compNote`: that is the operator's own shorthand for
       * why a store was comped ("launch apology", "friend of the house"),
       * written for the platform console and not for the merchant to read.
       */
      comp: entitlements.comped
        ? {
            plan: entitlements.compPlan,
            planComped: entitlements.planComped,
            feeWaived: entitlements.feeWaived,
          }
        : null,
      subscriptionStatus: ctx.tenant.subscriptionStatus,
      trialEndsAt: ctx.tenant.trialEndsAt,
      ai: {
        /** null = unmetered (Pro). */
        allowancePerMonth: allowance,
        usedThisMonth: allowance === null ? null : usedThisMonth,
      },
      onlineFees: {
        feePercentLabel: REVENUE_SHARE.percentLabel,
        appliesTo: REVENUE_SHARE.appliesTo,
        /** What this store actually pays, comps included — 0% when waived. */
        feeBps: entitlements.onlineFeeBps,
        monthGmvChf: online.gmvRappen / 100,
        monthAgentGmvChf: online.agentGmvRappen / 100,
        monthOrderCount: online.orderCount,
        monthFeeChf: skimChf,
      },
      upsell: payingTheSkim
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
        limitBytes: storageBytesForPlan(entitlements.effectivePlan),
      },
      billingConfigured: isBillingConfigured(),
    };
  }),

  /** Start a Stripe Checkout subscription for the Pro plan. */
  createPlanCheckout: tenantAdmin
    .input(z.object({ plan: z.enum(["pro"]) }))
    .mutation(async ({ ctx, input }) => {
      // Never take money for something we have already given away. The UI
      // hides the button for a comped store, but the mutation is the door that
      // actually has to be locked — a stale tab or a direct call would
      // otherwise start a real subscription and charge a merchant CHF 25/month
      // for the Pro they were comped.
      if (effectivePlan(ctx.tenant) === input.plan) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: isPlanComped(ctx.tenant)
            ? `Your store is already on ${input.plan} at no charge — there's nothing to pay.`
            : `Your store is already on ${input.plan}.`,
        });
      }
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
        plan: effectivePlan(ctx.tenant),
        productId: input.productId,
        stylePrompt: input.stylePrompt,
      });
    }),
});
