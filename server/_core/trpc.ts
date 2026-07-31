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
// the DB enum (drizzle/schema.ts tenants.plan) uses the same two ids, so a
// tenant's row, the pricing page, and the gates below can never drift apart.
// The AI photo allowance and scale limits (maxProducts/storageGb) are NOT
// duplicated here — read them from PLANS, the single owner of those numbers.
// The 1% online/agent fee is likewise owned by PLANS[].onlineFeeBps and
// applied in server/routers/checkout.ts, not gated here.
export const PLAN_FEATURES = {
  // Free: the whole commerce engine — store, full POS, inventory sync, the
  // agent layer (llms.txt/MCP/chat, the discovery wedge) and a taste of AI.
  // Monetized via the 1% fee on online/agent orders, not by gating.
  free: {
    maxStaff: 1,
    customDomain: false,
    whiteLabel: false,
    analytics: "basic",
    multiCurrency: false,
    prioritySupport: false,
    pos: true,
    onlineStore: true,
  },
  // Pro (CHF 25/mo): removes the 1% fee, unmetered AI, and everything a
  // maker selling online every week needs — domain, team, analytics, support.
  pro: {
    maxStaff: 3,
    customDomain: true,
    whiteLabel: true,
    analytics: "advanced",
    multiCurrency: true,
    prioritySupport: true,
    pos: true,
    onlineStore: true,
  },
} as const;

export type PlanId = keyof typeof PLAN_FEATURES;
export type PlanFeature = keyof typeof PLAN_FEATURES.free;

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

/**
 * The guard almost every store-admin mutation actually wants: signed in, an
 * admin, **and** an admin of the store being addressed.
 *
 * `adminProcedure` alone only proves the caller is an admin *somewhere* —
 * `ctx.tenant` is resolved from the request host, so an admin of store A
 * hitting store B's subdomain passes it. That cross-tenant check previously
 * existed in exactly one procedure (tenant.getStripeConnectUrl), copied by
 * hand; anything that forgot it was writeable across tenants.
 *
 * Superadmins are deliberately exempt — platform support needs to act on a
 * tenant it doesn't belong to, and `platform.metrics` already treats that role
 * as cross-tenant by design.
 */
export const tenantAdminProcedure = adminProcedure
  .use(requireTenant)
  .use(async ({ ctx, next }) => {
    // adminProcedure has already rejected a null user; re-checking rather than
    // asserting keeps this a real guard instead of a `!` the compiler can't
    // verify — a security check should not be the place we trust inference.
    if (!ctx.user) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    if (ctx.user.role !== "superadmin" && ctx.user.tenantId !== ctx.tenant.id) {
      // Logged because the merchant-facing symptom is indistinguishable from
      // "not an admin": the usual cause is a session bound to a different
      // tenant (a stale cookie, or the platform owner) browsing a tenant
      // subdomain, and without this line nothing anywhere says so.
      console.warn(
        `[Auth] Refusing cross-tenant admin action: user ${ctx.user.id} ` +
          `belongs to tenant ${ctx.user.tenantId} but is addressing tenant ` +
          `${ctx.tenant.id} (${ctx.tenant.slug}).`,
      );
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx });
  });
