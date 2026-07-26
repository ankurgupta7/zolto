import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
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
// the DB enum (drizzle/schema.ts tenants.plan) uses the same four ids, so a
// tenant's row, the pricing page, and the gates below can never drift apart.
// includedPhotoCredits is intentionally NOT duplicated here — read it from
// PLANS in shared/platform.ts, which is the single owner of the buckets.
export const PLAN_FEATURES = {
  // Free: the whole commerce engine (unlimited products, full POS, online
  // store, real-time sync, AI text) — per honest-pricing-strategy.md we never
  // gate what costs us ~nothing to run. No custom domain, Zolto badge shown.
  free: {
    maxStaff: 1,
    customDomain: false,
    whiteLabel: false,
    analytics: "basic",
    multiCurrency: false,
    prioritySupport: false,
    sso: false,
    apiAccess: false,
    auditLogs: false,
    pos: true,
    onlineStore: true,
  },
  // Maker (CHF 19/mo): custom domain + managed SSL, white-label, human support.
  maker: {
    maxStaff: 3,
    customDomain: true,
    whiteLabel: true,
    analytics: "basic",
    multiCurrency: false,
    prioritySupport: false,
    sso: false,
    apiAccess: false,
    auditLogs: false,
    pos: true,
    onlineStore: true,
  },
  // Studio (CHF 49/mo): teams, advanced analytics, multi-currency, priority support.
  studio: {
    maxStaff: 10,
    customDomain: true,
    whiteLabel: true,
    analytics: "advanced",
    multiCurrency: true,
    prioritySupport: true,
    sso: false,
    apiAccess: false,
    auditLogs: false,
    pos: true,
    onlineStore: true,
  },
  // Atelier (CHF 99/mo): API access, SSO, audit logs, dedicated support + SLA.
  atelier: {
    maxStaff: 20,
    customDomain: true,
    whiteLabel: true,
    analytics: "advanced",
    multiCurrency: true,
    prioritySupport: true,
    sso: true,
    apiAccess: true,
    auditLogs: true,
    pos: true,
    onlineStore: true,
  },
} as const;

export type PlanId = keyof typeof PLAN_FEATURES;
export type PlanFeature = keyof typeof PLAN_FEATURES.free;

/** The next plan up, for upgrade prompts. */
const UPGRADE_PATH: Record<PlanId, string | null> = {
  free: "Maker",
  maker: "Studio",
  studio: "Atelier",
  atelier: null,
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
