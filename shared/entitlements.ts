/**
 * What a store is actually entitled to — the plan it *has* plus anything the
 * platform owner has given it **on the house**.
 *
 * Gwinn sells two things (shared/platform.ts PLANS): a Pro subscription, and a
 * 1% platform fee on online/agent orders that Pro removes. The operator
 * sometimes wants to hand one or both to a particular store for nothing — a
 * design partner, a friend of the house, a merchant we broke something for, the
 * platform's own test store. That is a *comp*, and it lives in three columns on
 * `tenants`:
 *
 *   comp_plan        the plan this store gets without paying for it (or NULL)
 *   comp_fee_waived  take no platform fee from this store, whatever its plan
 *   comp_note        why, in the operator's own words
 *
 * ## Why an overlay and not just `UPDATE tenants SET plan = 'pro'`
 *
 * The operator console could already move a store to Pro by hand
 * (`platform.setTenantPlan`), and for a moment that looks like the whole
 * feature. It isn't, for two reasons:
 *
 *  1. **Stripe writes that column.** `customer.subscription.deleted` sets
 *     `plan = 'free'` (server/billing.ts), and a cancelled *old* subscription
 *     arriving weeks later would silently strip a comp granted since. Keeping
 *     `tenants.plan` meaning "what Stripe says" and `comp_plan` meaning "what
 *     we granted" means neither can overwrite the other.
 *  2. **A comp has to be legible.** A store on Pro with no subscription is
 *     indistinguishable from a billing bug — both on the operator's list and on
 *     the merchant's own billing page, which would happily offer to sell them
 *     the Pro they already have.
 *
 * So `plan` stays untouched and everything that *gates* on a plan reads
 * `effectivePlan()` instead. Every such site is listed in the tests; if you add
 * a new one, read it from here rather than from `tenant.plan` — the whole point
 * of one derivation is that a comp cannot be honoured in nine places and
 * forgotten in the tenth.
 */

import { PLANS, PLAN_FEATURES, type PlanId } from "./platform";

/**
 * The billing-relevant columns of a tenant row. Deliberately structural rather
 * than `Tenant`, so this file stays free of the Drizzle schema and can be read
 * by the client, the server and the tests alike.
 */
export interface TenantBillingFacts {
  /** `tenants.plan` — what the store pays for. Stripe owns this column. */
  plan: string;
  /** `tenants.comp_plan` — the plan granted on the house, or null/undefined. */
  compPlan?: string | null;
  /** `tenants.comp_fee_waived` — take 0% on online/agent orders. */
  compFeeWaived?: boolean | null;
}

/** Plans in ascending order of what they include. */
const PLAN_RANK: Record<PlanId, number> = { free: 0, pro: 1 };

/**
 * A plan id that may have come from the database, a URL, or a retired tier
 * (maker/studio/atelier — see shared/platform.ts). Anything unrecognised reads
 * as Free: under-granting is recoverable, silently granting Pro is not.
 */
export function normalizePlan(plan: string | null | undefined): PlanId {
  return plan != null && plan in PLAN_RANK ? (plan as PlanId) : "free";
}

/**
 * The plan whose features, limits and fee actually apply — the better of what
 * the store pays for and what it was given.
 *
 * The max (rather than "comp wins") matters: a comped store that later *buys*
 * Pro must not be dropped back to a stale `comp_plan: "free"`, and revoking a
 * comp must never take away something the merchant is paying for.
 */
export function effectivePlan(tenant: TenantBillingFacts): PlanId {
  const paid = normalizePlan(tenant.plan);
  if (tenant.compPlan == null) return paid;
  const comped = normalizePlan(tenant.compPlan);
  return PLAN_RANK[comped] > PLAN_RANK[paid] ? comped : paid;
}

/** Feature flags for a store, comp included. The gate every plane shares. */
export function featuresForTenant(
  tenant: TenantBillingFacts,
): (typeof PLAN_FEATURES)[PlanId] {
  return PLAN_FEATURES[effectivePlan(tenant)];
}

/**
 * Gwinn's cut of an online/agent order, in basis points.
 *
 * Two independent ways to reach 0: being on (or comped to) Pro, which removes
 * the fee as a feature of the plan, and an explicit fee waiver, which removes
 * it for a store we are otherwise leaving on Free. The waiver exists because
 * "don't take a margin from this merchant" and "give this merchant the Pro
 * feature set" are separate favours, and the operator should be able to grant
 * either without implying the other.
 */
export function onlineFeeBpsFor(tenant: TenantBillingFacts): number {
  if (tenant.compFeeWaived) return 0;
  return PLANS.find((p) => p.id === effectivePlan(tenant))!.onlineFeeBps;
}

/** Is this store getting a plan it isn't paying for? */
export function isPlanComped(tenant: TenantBillingFacts): boolean {
  return (
    tenant.compPlan != null &&
    PLAN_RANK[normalizePlan(tenant.compPlan)] >
      PLAN_RANK[normalizePlan(tenant.plan)]
  );
}

/** Is this store on the house in any way at all? */
export function isComped(tenant: TenantBillingFacts): boolean {
  return isPlanComped(tenant) || Boolean(tenant.compFeeWaived);
}

/**
 * Everything the two consoles need to say about a store's billing, derived
 * once. Returned by `billing.getStatus` (the merchant's own view) and by the
 * operator's tenant list, so the two can never describe the same store
 * differently.
 */
export interface TenantEntitlements {
  /** `tenants.plan` — what Stripe bills, unchanged. */
  paidPlan: PlanId;
  /** The plan that actually applies (paid or comped, whichever is better). */
  effectivePlan: PlanId;
  /** The plan granted for free, if any. */
  compPlan: PlanId | null;
  /** Platform fee on online/agent orders, in basis points. */
  onlineFeeBps: number;
  /** True when the plan itself is a grant rather than a purchase. */
  planComped: boolean;
  /** True when the 1% is waived by hand rather than by the plan. */
  feeWaived: boolean;
  /** True when this store is on the house in any way. */
  comped: boolean;
}

export function entitlementsFor(
  tenant: TenantBillingFacts,
): TenantEntitlements {
  return {
    paidPlan: normalizePlan(tenant.plan),
    effectivePlan: effectivePlan(tenant),
    compPlan: tenant.compPlan == null ? null : normalizePlan(tenant.compPlan),
    onlineFeeBps: onlineFeeBpsFor(tenant),
    planComped: isPlanComped(tenant),
    feeWaived: Boolean(tenant.compFeeWaived),
    comped: isComped(tenant),
  };
}
