import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { requestMagicLink } from "./_core/magicLink";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
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
        requestMagicLink({ email: input.email, next: input.next, req: ctx.req }),
      ),
  }),
  tenant: tenantRouter, // NEW: Multi-tenant routes
  billing: billingRouter, // Plan subscriptions + AI usage
  platform: platformRouter, // Zolto-wide operating metrics (superadmin only)
  staff: staffRouter, // Team seats + invites
  chat: chatRouter, // AI support assistant (storefront)
  insights: insightsRouter, // Sales/inventory stats + AI narrative (Pro)
  products: productsRouter,
  instagram: instagramRouter,
  checkout: checkoutRouter,
  reconciliation: reconciliationRouter,
});

export type AppRouter = typeof appRouter;
