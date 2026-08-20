/**
 * Platform router — Gwinn's own operating metrics, for the platform owner.
 *
 * Superadmin only, and deliberately separate from the tenant-facing routers:
 * everything here reads ACROSS tenants, which no store owner may ever do. A
 * tenant's own numbers live in billing.getStatus.
 *
 * Exists because the pricing model has one metric that decides whether the
 * business floats — the share of free in-person vendors who make an online or
 * agent sale — and until now nothing could compute it
 * (docs/planning/pricing-pivot-agent-commerce.md §5).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, superadminProcedure } from "../_core/trpc";
import {
  getAllAgentHits,
  getPlatformMetrics,
  listTenantsForOperator,
  getTenantDetailForOperator,
  setTenantUserRoleByOperator,
  setTenantPlanByOperator,
  setTenantCompByOperator,
  getTenantBySlug,
  createTenant,
  createTenantSettings,
  setTenantPosApiKeyHash,
} from "../db";
import { runStripeReconciliationForAllTenants } from "../reconciliation";
import { generatePosApiKey, hashPosApiKey } from "../posApiKey";
import { PRO_PLAN, REVENUE_SHARE } from "@shared/platform";
import {
  dayKey,
  isAgentSurface,
  summarizeAgentHits,
  type AgentHitRow,
} from "@shared/aiAgents";
import { PLATFORM_TENANT_ID } from "../agentHits";

/**
 * The platform's own POS test store. Its POS key is what the POS apps' CI
 * uses, so no pipeline ever has to skip or soften a test for lack of a key.
 * It is an entirely ordinary tenant — the key goes through the same
 * per-tenant auth path as every merchant's (server/pos.ts requirePosKey),
 * with no special rules, so CI reproduces issues faithfully.
 */
export const POS_TEST_TENANT_SLUG = "platform-tests";

/**
 * Operator actions change another party's account, so every one of them leaves
 * a line in the server log naming who did what to whom. A persistent audit
 * table is the right home for this and is not built yet; until it is, the log
 * is the record, and it is written before the mutation so a failure midway
 * still shows the attempt.
 */
function auditOperatorAction(
  actorId: number | undefined,
  action: string,
  details: Record<string, unknown>,
): void {
  console.warn(
    `[operator-audit] actor=${actorId ?? "unknown"} action=${action} ${JSON.stringify(details)}`,
  );
}

export const platformRouter = router({
  /**
   * Every store on the platform — the operator's list view.
   *
   * This was `tenant.list`, a publicProcedure with a "TODO: Add superadmin
   * guard" comment on it, which meant anyone at all could enumerate every
   * store. It is superadmin-only here, and the underlying query names its
   * columns rather than returning whole tenant rows.
   */
  tenants: superadminProcedure.query(async () => {
    return listTenantsForOperator();
  }),

  /** One store in full, including who can sign in to it. */
  tenantDetail: superadminProcedure
    .input(z.object({ tenantId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const detail = await getTenantDetailForOperator(input.tenantId);
      if (!detail) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such store." });
      }
      return detail;
    }),

  /**
   * Grant or revoke tenant-admin on one of that store's users.
   *
   * The support fix for a store that has users but no admin — every
   * adminProcedure refuses them, which surfaces to the merchant as an
   * unrelated-looking "Connect Stripe" failure (see deploy/tenant-admin.sh).
   *
   * `role` is deliberately narrowed to admin|staff: the operator console can
   * hand out a store's keys but never the platform's. Granting superadmin
   * stays a manual act on the server so it cannot be done by a session that
   * has merely been left signed in.
   */
  setTenantUserRole: superadminProcedure
    .input(
      z.object({
        tenantId: z.number().int().positive(),
        userId: z.number().int().positive(),
        role: z.enum(["admin", "staff"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      auditOperatorAction(ctx.user?.id, "setTenantUserRole", input);
      const ok = await setTenantUserRoleByOperator(
        input.tenantId,
        input.userId,
        input.role,
      );
      if (!ok) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That user is not on that store.",
        });
      }
      return { success: true };
    }),

  /**
   * Move a store between plans without touching Stripe — comps, refunds, and
   * cases where billing state and entitlement have diverged.
   */
  setTenantPlan: superadminProcedure
    .input(
      z.object({
        tenantId: z.number().int().positive(),
        plan: z.enum(["free", "pro"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      auditOperatorAction(ctx.user?.id, "setTenantPlan", input);
      const ok = await setTenantPlanByOperator(input.tenantId, input.plan);
      if (!ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such store." });
      }
      return { success: true };
    }),

  /**
   * Put a store on the house: give it a plan it doesn't pay for, waive Gwinn's
   * cut of its online/agent orders, or both.
   *
   * This is the deliberate, recorded version of what `setTenantPlan` does by
   * hand. `setTenantPlan` edits `tenants.plan` — the column Stripe's webhooks
   * own — so a plan moved there is both indistinguishable from a paid one and
   * liable to be reset by a subscription event arriving later. A comp lives in
   * its own columns, survives that, and reads as a grant on both consoles:
   * the merchant is told their Pro is a gift rather than being offered the
   * chance to buy it again (billing.createPlanCheckout refuses them).
   *
   * `plan: null` + `waiveOnlineFee: false` revokes. Revoking never touches the
   * store's paid plan, so a comped merchant who has since subscribed keeps
   * exactly what they are paying for.
   */
  setTenantComp: superadminProcedure
    .input(
      z.object({
        tenantId: z.number().int().positive(),
        /** The plan granted for free. null = grant no plan. */
        plan: z.enum(["free", "pro"]).nullable(),
        /** Take 0% on this store's online/agent orders, whatever its plan. */
        waiveOnlineFee: z.boolean(),
        /** Why — shown next to the grant in the console. */
        note: z.string().trim().max(255).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      auditOperatorAction(ctx.user?.id, "setTenantComp", input);
      const ok = await setTenantCompByOperator({
        tenantId: input.tenantId,
        plan: input.plan,
        feeWaived: input.waiveOnlineFee,
        note: input.note ?? null,
        grantedByUserId: ctx.user?.id ?? null,
      });
      if (!ok) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such store." });
      }
      return { success: true };
    }),

  /**
   * Rotate (provisioning on first use) the platform's POS test key — the
   * operator's counterpart to the merchant-facing tenant.rotatePosApiKey.
   *
   * Returns the plaintext exactly ONCE, like every POS key: the operator
   * pastes it into the POS apps' CI secrets (POS_API_KEY) and it is
   * unrecoverable afterwards — a lost key is rotated, not retrieved. The old
   * key stops working the moment this returns, so CI secrets must be updated
   * in the same sitting.
   */
  rotatePosTestKey: superadminProcedure.mutation(async ({ ctx }) => {
    const plaintext = generatePosApiKey();
    const hash = hashPosApiKey(plaintext);

    const existing = await getTenantBySlug(POS_TEST_TENANT_SLUG);
    let tenantId: number;
    if (existing) {
      tenantId = existing.id;
      await setTenantPosApiKeyHash(tenantId, hash);
    } else {
      tenantId = await createTenant({
        slug: POS_TEST_TENANT_SLUG,
        name: "Platform Tests",
        plan: "free",
        posApiKey: hash,
      });
      await createTenantSettings({ tenantId, currency: "chf" });
    }

    auditOperatorAction(ctx.user?.id, "rotatePosTestKey", {
      tenantId,
      slug: POS_TEST_TENANT_SLUG,
    });
    return { tenantId, slug: POS_TEST_TENANT_SLUG, posApiKey: plaintext };
  }),

  metrics: superadminProcedure.query(async () => {
    const metrics = await getPlatformMetrics();
    return {
      ...metrics,
      // Rendered alongside the numbers so the dashboard states the model it is
      // measuring, rather than leaving a bare percentage to interpret.
      model: {
        feePercentLabel: REVENUE_SHARE.percentLabel,
        proPriceChf: PRO_PLAN.priceChf,
      },
    };
  }),

  /**
   * Agent traffic across every store AND the platform surface itself.
   *
   * The operator's view of the bet the pricing model rests on: are AI agents
   * reading `/llms.txt` and calling `/mcp` at all, and is it assistants
   * fetching for a person asking right now or crawlers indexing in the
   * background? A merchant sees only their own store (insights.agentTraffic);
   * this crosses tenants by design, which is why it is superadmin-only.
   *
   * `platformOnly` splits gwinn.ch's own brief — read by an assistant helping
   * someone choose a shop platform — from the storefronts', which are two
   * completely different questions that would otherwise be summed into one
   * uninterpretable number.
   */
  agentTraffic: superadminProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(90).default(30),
        scope: z.enum(["all", "platform", "stores"]).default("all"),
      }),
    )
    .query(async ({ input }) => {
      const since = new Date(Date.now() - (input.days - 1) * 86_400_000);
      const rows = await getAllAgentHits(dayKey(since));
      const scoped = rows.filter((r) => {
        if (!isAgentSurface(r.surface)) return false;
        if (input.scope === "platform")
          return r.tenantId === PLATFORM_TENANT_ID;
        if (input.scope === "stores") return r.tenantId !== PLATFORM_TENANT_ID;
        return true;
      });
      const typed: AgentHitRow[] = scoped.map((r) => ({
        tenantId: r.tenantId,
        day: r.day,
        surface: r.surface as AgentHitRow["surface"],
        mcpTool: r.mcpTool,
        agent: r.agent,
        count: r.count,
      }));
      // How many distinct stores were read at all — the number that says
      // whether agent reach is broad or is one enthusiastic merchant.
      const storesReached = new Set(
        typed
          .filter((r) => r.tenantId !== PLATFORM_TENANT_ID)
          .map((r) => r.tenantId),
      ).size;
      return {
        days: input.days,
        scope: input.scope,
        storesReached,
        ...summarizeAgentHits(typed, input.days),
      };
    }),

  /**
   * Platform-wide Stripe reconciliation: every tenant that has connected
   * Stripe, each scanned against their OWN account.
   *
   * The merchant-facing button (reconciliation.run) covers one store. This is
   * the operator's sweep — useful for catching stores that never press their
   * own button, and the only place the cross-tenant picture is legitimate.
   *
   * A single tenant's failure (revoked Connect grant, Stripe outage) is
   * recorded per tenant rather than aborting the sweep, so one bad store
   * cannot hide every other store's unmatched payments.
   */
  reconcileAllTenants: superadminProcedure
    .input(
      z.object({ lookbackDays: z.number().int().min(1).max(90).optional() }),
    )
    .mutation(async ({ input }) => {
      return runStripeReconciliationForAllTenants(input.lookbackDays);
    }),
});
