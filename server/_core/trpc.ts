import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import {
  PLAN_FEATURES,
  featuresForPlan,
  type PlanId,
  type PlanFeature,
} from "@shared/platform";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// ═══════════════════════════════════════════════════════════════════════════════
// Auth Middleware
// ═══════════════════════════════════════════════════════════════════════════════

const requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

// Admin guard — supports both "admin" and "superadmin" roles
export const adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (
      !ctx.user ||
      (ctx.user.role !== "admin" && ctx.user.role !== "superadmin")
    ) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// Superadmin guard — platform owner only
export const superadminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;

    if (ctx.user?.role !== "superadmin") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Superadmin access required",
      });
    }

    return next({ ctx });
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Gating Middleware
// ═══════════════════════════════════════════════════════════════════════════════

// Plan ids mirror the marketing source of truth (shared/platform.ts PLANS);
// the DB enum (drizzle/schema.ts tenants.plan) uses the same two ids, so a
// tenant's row, the pricing page, and the gates below can never drift apart.
// The AI photo allowance and scale limits (maxProducts/storageGb) are NOT
// duplicated here — read them from PLANS, the single owner of those numbers.
// The 1% online/agent fee is likewise owned by PLANS[].onlineFeeBps and
// applied in server/routers/checkout.ts, not gated here.
// Re-exported from @shared/platform so the admin UI can gate on the SAME object
// this middleware enforces. It used to be defined here, which put it out of the
// client's reach and left every admin screen mirroring the rule by hand — see
// the note on PLAN_FEATURES in shared/platform.ts for what that cost.
export { PLAN_FEATURES, featuresForPlan };
export type { PlanId, PlanFeature };

/** The next plan up, for upgrade prompts. */
const UPGRADE_PATH: Record<PlanId, string | null> = {
  free: "Pro",
  pro: null,
};

export function checkFeature(feature: PlanFeature) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.tenant) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No tenant context",
      });
    }

    const features = PLAN_FEATURES[ctx.tenant.plan];
    const hasFeature = features[feature as keyof typeof features] ?? false;

    if (!hasFeature) {
      const nextPlan = UPGRADE_PATH[ctx.tenant.plan];
      throw new TRPCError({
        code: "FORBIDDEN",
        message: nextPlan
          ? `This feature requires the ${nextPlan} plan. Please upgrade.`
          : "This feature is not available on your plan.",
      });
    }

    return next({ ctx });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tenant Presence Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export const requireTenant = t.middleware(async ({ ctx, next }) => {
  if (!ctx.tenant) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Tenant required",
    });
  }
  return next({ ctx: { ...ctx, tenant: ctx.tenant } });
});
