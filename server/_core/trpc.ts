import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
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

const requireUser = t.middleware(async opts => {
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
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || (ctx.user.role !== "admin" && ctx.user.role !== "superadmin")) {
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
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (ctx.user?.role !== "superadmin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin access required" });
    }

    return next({ ctx });
  }),
);

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Gating Middleware
// ═══════════════════════════════════════════════════════════════════════════════

export const PLAN_FEATURES = {
  starter: {
    maxProducts: 50,
    maxStaff: 1,
    maxImagesPerProduct: 3,
    discordBot: false,
    aiBulkUpload: false,
    customDomain: false,
    pos: true,
    onlineStore: true,
    analytics: "basic",
  },
  growth: {
    maxProducts: 500,
    maxStaff: 5,
    maxImagesPerProduct: 10,
    discordBot: true,
    aiBulkUpload: true,
    customDomain: true,
    pos: true,
    onlineStore: true,
    analytics: "advanced",
  },
  enterprise: {
    maxProducts: Infinity,
    maxStaff: Infinity,
    maxImagesPerProduct: Infinity,
    discordBot: true,
    aiBulkUpload: true,
    customDomain: true,
    pos: true,
    onlineStore: true,
    analytics: "custom",
    sso: true,
    apiAccess: true,
    prioritySupport: true,
  },
} as const;

export type PlanFeature = keyof typeof PLAN_FEATURES.starter;

export function checkFeature(feature: PlanFeature) {
  return t.middleware(async ({ ctx, next }) => {
    if (!ctx.tenant) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No tenant context" });
    }

    const features = PLAN_FEATURES[ctx.tenant.plan];
    const hasFeature = features[feature as keyof typeof features] ?? false;

    if (!hasFeature) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `This feature requires a ${ctx.tenant.plan === "starter" ? "Growth" : "Enterprise"} plan. Please upgrade.`,
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
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Tenant required" });
  }
  return next({ ctx: { ...ctx, tenant: ctx.tenant } });
});
