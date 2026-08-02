import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
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
import { platformRouter } from "./routers/platform";

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
    requestMagicLink: publicProcedure
      .input(
        z.object({
          email: z.string().email().max(320),
          next: z.string().max(512).optional(),
        }),
      )
      .mutation(({ ctx, input }) =>
        requestMagicLink({
          email: input.email,
          next: input.next,
          req: ctx.req,
        }),
      ),

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
  categories: categoriesRouter,
  instagram: instagramRouter,
  checkout: checkoutRouter,
  reconciliation: reconciliationRouter,
});

export type AppRouter = typeof appRouter;
