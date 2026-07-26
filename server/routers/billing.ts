import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../_core/trpc";
import { requireTenant } from "../_core/trpc";
import {
  createPlanCheckoutSession,
  createPhotoCreditCheckoutSession,
  isBillingConfigured,
  monthlyPhotoCredits,
  type PaidPlanId,
} from "../billing";
import { PLANS, AI_PHOTO_CREDITS } from "@shared/platform";
import { getPhotoCreditBalance, getPhotoCreditHistory } from "../db";
import { generateStyledProductPhoto } from "../photoCredits";

// ═══════════════════════════════════════════════════════════════════════════════
// Billing Router — plan upgrades + AI photo credit purchases/metering
// All procedures require a tenant admin (the store owner managing their own
// subscription); platform-level operations stay superadmin-only elsewhere.
// ═══════════════════════════════════════════════════════════════════════════════

const tenantAdmin = adminProcedure.use(requireTenant);

export const billingRouter = router({
  /** Current plan, billing status, photo-credit balance, and what's purchasable. */
  getStatus: tenantAdmin.query(async ({ ctx }) => {
    const balance = await getPhotoCreditBalance(ctx.tenant.id);
    return {
      plan: ctx.tenant.plan,
      subscriptionStatus: ctx.tenant.subscriptionStatus,
      trialEndsAt: ctx.tenant.trialEndsAt,
      photoCredits: {
        balance,
        monthlyBucket: monthlyPhotoCredits(ctx.tenant.plan),
        priceChf: AI_PHOTO_CREDITS.priceChf,
        unit: AI_PHOTO_CREDITS.unit,
      },
      plans: PLANS.map((p) => ({
        id: p.id,
        name: p.name,
        priceChf: p.priceChf,
        includedPhotoCredits: p.includedPhotoCredits,
      })),
      billingConfigured: isBillingConfigured(),
    };
  }),

  /** Start a Stripe Checkout subscription for a paid plan. */
  createPlanCheckout: tenantAdmin
    .input(z.object({ plan: z.enum(["maker", "studio", "atelier"]) }))
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

  /** Buy a pay-as-you-go pack of AI photo credits (CHF 1 each, non-expiring). */
  purchasePhotoCredits: tenantAdmin
    .input(z.object({ quantity: z.number().int().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await createPhotoCreditCheckoutSession({
          tenant: ctx.tenant,
          quantity: input.quantity,
          req: ctx.req,
        });
      } catch (err) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }),

  /** Ledger history for the merchant's own transparency (newest first). */
  photoCreditHistory: tenantAdmin.query(async ({ ctx }) => {
    return getPhotoCreditHistory(ctx.tenant.id);
  }),

  /**
   * Generate an AI-styled photo for one of the merchant's products.
   * Costs 1 credit (refunded automatically if generation fails).
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
        productId: input.productId,
        stylePrompt: input.stylePrompt,
      });
    }),
});
