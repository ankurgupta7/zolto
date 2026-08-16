import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { createRateLimiter } from "./rateLimit";
import { getSessionCookieOptions } from "./_core/cookies";
import { requestMagicLink } from "./_core/magicLink";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { updateOwnDisplayName } from "./db";
import { categoriesRouter } from "./routers/categories";
import { productsRouter } from "./routers/products";
import { checkoutRouter } from "./routers/checkout";
import { instagramRouter } from "./routers/instagram";
import { reconciliationRouter } from "./routers/reconciliation";
import { tenantRouter } from "./routers/tenant";
import { billingRouter } from "./routers/billing";
import { staffRouter } from "./routers/staff";
import { chatRouter } from "./routers/chat";
import { insightsRouter } from "./routers/insights";
import { migrationRouter } from "./routers/migration";
import { siteImportRouter } from "./routers/siteImport";
import { platformRouter } from "./routers/platform";
import { testimonialsRouter } from "./routers/testimonials";
import { trustpilotRouter } from "./routers/trustpilot";
import { discountsRouter } from "./routers/discounts";
import { salesRouter } from "./routers/sales";

// Sign-in links, bounded per address and per caller. See requestMagicLink
// below for why both keys are needed and why the address is checked first.
const magicLinkEmailLimiter = createRateLimiter({
  limit: 5,
  windowMs: 60 * 60 * 1000,
});
const magicLinkIpLimiter = createRateLimiter({
  limit: 20,
  windowMs: 60 * 60 * 1000,
});

// ─── App router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // Passwordless fallback for anyone without a Google/Apple account — see
    // server/_core/magicLink.ts for the token + email mechanics and the
    // GET /api/auth/magic-link/callback route that redeems the link.
    //
    // Rate limited on both keys, because they bound different harms. Per
    // address caps how hard one inbox can be flooded — the link only ever
    // reaches its owner, so the abuse here is mail, not access, and it matters
    // more now that redeeming one can open a store admin (magicLink.ts). Per
    // IP caps one caller enumerating many addresses, which per-address limits
    // alone never see. Address first, so a flood aimed at one inbox is
    // stopped by the tighter bound whatever it is sent from. Both windows are
    // generous next to a merchant who mistypes their address twice.
    requestMagicLink: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          next: z.string().max(512).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const email = input.email.trim().toLowerCase();
        for (const gate of [
          { key: `magic-link:email:${email}`, limiter: magicLinkEmailLimiter },
          {
            key: `magic-link:ip:${ctx.req.ip ?? "unknown"}`,
            limiter: magicLinkIpLimiter,
          },
        ]) {
          const result = await gate.limiter.check(gate.key);
          if (!result.allowed) {
            throw new TRPCError({
              code: "TOO_MANY_REQUESTS",
              message: `Too many sign-in links requested. Try again in ${result.retryAfterSeconds} seconds.`,
            });
          }
        }
        return requestMagicLink({
          email: input.email,
          next: input.next,
          req: ctx.req,
        });
      }),

    /**
     * Edit your own display name. `protectedProcedure` and scoped to
     * `ctx.user.id` — it takes no user id from the caller, so there is no
     * shape of this request that edits somebody else.
     *
     * Name only: the sign-in email belongs to the identity provider the
     * session was minted against, and changing it is a verification flow
     * rather than a form field (see updateOwnDisplayName).
     */
    updateProfile: protectedProcedure
      .input(z.object({ name: z.string().trim().min(1).max(255) }))
      .mutation(async ({ ctx, input }) => {
        await updateOwnDisplayName(ctx.user.id, input.name);
        return { success: true } as const;
      }),
  }),
  tenant: tenantRouter, // NEW: Multi-tenant routes
  billing: billingRouter, // Plan subscriptions + AI usage
  platform: platformRouter, // Zolto-wide operating metrics (superadmin only)
  staff: staffRouter, // Team seats + invites
  chat: chatRouter, // AI support assistant (storefront)
  insights: insightsRouter, // Sales/inventory stats + AI narrative (Pro)
  products: productsRouter,
  migration: migrationRouter, // Switch-in from Stripe/SumUp/Worldline
  siteImport: siteImportRouter, // Paid one-time switch-in from an existing site
  categories: categoriesRouter,
  instagram: instagramRouter,
  checkout: checkoutRouter,
  sales: salesRouter,
  reconciliation: reconciliationRouter,
  testimonials: testimonialsRouter, // Customer quotes on the storefront
  trustpilot: trustpilotRouter, // The store's Trustpilot standing
  discounts: discountsRouter, // Promotional + friends-and-family codes
});

export type AppRouter = typeof appRouter;
