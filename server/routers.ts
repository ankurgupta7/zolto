import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { productsRouter } from "./routers/products";
import { checkoutRouter } from "./routers/checkout";
import { instagramRouter } from "./routers/instagram";
import { reconciliationRouter } from "./routers/reconciliation";
import { tenantRouter } from "./routers/tenant";

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
  }),
  tenant: tenantRouter, // NEW: Multi-tenant routes
  products: productsRouter,
  instagram: instagramRouter,
  checkout: checkoutRouter,
  reconciliation: reconciliationRouter,
});

export type AppRouter = typeof appRouter;
