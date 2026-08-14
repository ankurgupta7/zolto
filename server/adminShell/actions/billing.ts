/**
 * Tier — Plans, subscriptions and comps.
 *
 * The distinction this tier has to keep visible: `plan` is what Stripe says a
 * store pays for, and a *comp* is what the platform owner has given it for
 * nothing. Changing the first is a billing edit; granting the second is a
 * gift that survives Stripe's webhooks. shared/entitlements.ts is the long
 * version of why they are separate columns.
 */

import { chooseFrom } from "../choose";
import {
  fromMinorUnits,
  heading,
  keyValues,
  money,
  orDash,
  planLabel,
  shortDate,
  table,
  timestamp,
  yesNo,
} from "../format";
import type { ActionContext } from "../types";
import { confirmWrite, withStore } from "./helpers";

const PLAN_CHOICES = [
  { id: "free" as const, label: "Free — 1% on online/agent orders" },
  { id: "pro" as const, label: "Pro — CHF 25/month, no platform fee" },
];

export async function subscriptionOverview(ctx: ActionContext): Promise<void> {
  const stores = await ctx.platform.platform.tenants();
  ctx.io.printLines(heading(`Subscriptions (${stores.length} stores)`));
  if (stores.length === 0) {
    ctx.io.print("  No stores yet.");
    return;
  }
  ctx.io.printLines(
    table(stores, [
      { label: "slug", value: (s) => s.slug },
      { label: "paid plan", value: (s) => s.plan },
      { label: "comped", value: (s) => orDash(s.comp?.plan) },
      { label: "fee waived", value: (s) => yesNo(s.comp?.feeWaived) },
      { label: "status", value: (s) => orDash(s.subscriptionStatus) },
      { label: "trial ends", value: (s) => shortDate(s.trialEndsAt) },
      { label: "why comped", value: (s) => orDash(s.comp?.note) },
    ]),
  );

  const counts = new Map<string, number>();
  for (const store of stores) {
    const key = planLabel(store);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  ctx.io.print("");
  for (const [label, count] of Array.from(counts.entries())) {
    ctx.io.print(`  ${count} × ${label}`);
  }
}

/** One store's billing page, as the merchant themselves would see it. */
export async function storeBilling(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const status = await caller.billing.getStatus();
    ctx.io.printLines(heading(`Billing — ${tenant.name} (${tenant.slug})`));
    ctx.io.printLines(
      keyValues([
        ["entitled plan", status.plan],
        ["paid plan", tenant.plan],
        [
          "comp",
          status.comp
            ? `${orDash(status.comp.plan)}${status.comp.feeWaived ? " + fee waived" : ""}`
            : "—",
        ],
        ["subscription", orDash(status.subscriptionStatus)],
        ["trial ends", shortDate(status.trialEndsAt)],
        [
          "AI photos this month",
          status.ai.allowancePerMonth === null
            ? "unmetered"
            : `${status.ai.usedThisMonth} / ${status.ai.allowancePerMonth}`,
        ],
        ["online fee", `${status.onlineFees.feeBps / 100}%`],
        ["online GMV (month)", money(status.onlineFees.monthGmvChf)],
        ["agent GMV (month)", money(status.onlineFees.monthAgentGmvChf)],
        ["online orders (month)", String(status.onlineFees.monthOrderCount)],
        ["fee owed (month)", money(status.onlineFees.monthFeeChf)],
        [
          "storage",
          `${(status.storage.usedBytes / 1_000_000).toFixed(1)} MB / ${(
            status.storage.limitBytes / 1_000_000_000
          ).toFixed(1)} GB`,
        ],
        ["Stripe billing configured", yesNo(status.billingConfigured)],
      ]),
    );
    if (status.upsell && status.upsell.savingsChf > 0) {
      ctx.io.print("");
      ctx.io.print(
        `  This store is paying more in fees than Pro costs — it would save ${money(
          status.upsell.savingsChf,
        )} this month on Pro.`,
      );
    }
  });
}

/**
 * Move a store between plans directly — the billing-repair tool, not the way
 * to give somebody Pro. It edits the column Stripe's webhooks own, so a
 * subscription event arriving later can undo it; comps exist for grants.
 */
export async function changePlan(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant }) => {
    ctx.io.print(`  ${tenant.slug} currently pays for: ${tenant.plan}`);
    const plan = await chooseFrom(ctx.io, {
      title: "  Move it to",
      rows: PLAN_CHOICES,
      empty: "",
      searchable: (p) => [p.id],
      columns: [{ label: "plan", value: (p) => p.label }],
    });
    if (!plan) return;
    if (plan.id === tenant.plan) {
      ctx.io.print(
        `  ${tenant.slug} is already on ${plan.id} — nothing to do.`,
      );
      return;
    }
    ctx.io.print(
      "  Note: Stripe owns this column. A later subscription webhook can overwrite it — " +
        "use a comp to grant a plan durably.",
    );
    if (
      !(await confirmWrite(
        ctx,
        `Set ${tenant.slug}'s paid plan to "${plan.id}"?`,
      ))
    ) {
      return;
    }
    await ctx.platform.platform.setTenantPlan({
      tenantId: tenant.id,
      plan: plan.id,
    });
    ctx.io.print(`  ${tenant.slug} is now on ${plan.id}.`);
  });
}

/** Put a store on the house: a free plan, a waived fee, or both. */
export async function compStore(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant }) => {
    const current = tenant.compPlan || tenant.compFeeWaived;
    if (current) {
      ctx.io.print(
        `  ${tenant.slug} is already comped: plan=${orDash(tenant.compPlan)}, ` +
          `fee waived=${yesNo(tenant.compFeeWaived)}, note=${orDash(tenant.compNote)}`,
      );
    }

    const grant = await chooseFrom(ctx.io, {
      title: "  Grant which plan on the house?",
      rows: [
        { id: null as "free" | "pro" | null, label: "no plan grant" },
        { id: "free" as const, label: "free" },
        { id: "pro" as const, label: "pro" },
      ],
      empty: "",
      searchable: (row) => [row.id ?? "none", row.label],
      columns: [{ label: "grant", value: (row) => row.label }],
    });
    if (!grant) return;

    const waiveOnlineFee = await ctx.io.confirm(
      "  Also take 0% on this store's online and agent orders?",
      { default: Boolean(tenant.compFeeWaived) },
    );
    if (!grant.id && !waiveOnlineFee) {
      ctx.io.print(
        "  That grants nothing. Use “Revoke a comp” if you meant to take it away.",
      );
      return;
    }
    const note = await ctx.io.ask("  Why? (shown next to the grant)", {
      default: tenant.compNote ?? "",
    });

    if (
      !(await confirmWrite(
        ctx,
        `Comp ${tenant.slug}: plan=${grant.id ?? "none"}, fee waived=${yesNo(
          waiveOnlineFee,
        )}?`,
      ))
    ) {
      return;
    }
    await ctx.platform.platform.setTenantComp({
      tenantId: tenant.id,
      plan: grant.id,
      waiveOnlineFee,
      note: note || undefined,
    });
    ctx.io.print(`  ${tenant.slug} is comped.`);
  });
}

/**
 * Take a comp away. Never touches the store's paid plan, so a merchant who has
 * since subscribed keeps exactly what they are paying for.
 */
export async function revokeComp(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant }) => {
    if (!tenant.compPlan && !tenant.compFeeWaived) {
      ctx.io.print(`  ${tenant.slug} has no comp to revoke.`);
      return;
    }
    ctx.io.print(
      `  Revoking: plan=${orDash(tenant.compPlan)}, fee waived=${yesNo(
        tenant.compFeeWaived,
      )}, note=${orDash(tenant.compNote)}`,
    );
    ctx.io.print(
      `  Its paid plan (${tenant.plan}) is untouched — only the grant goes away.`,
    );
    if (!(await confirmWrite(ctx, `Revoke ${tenant.slug}'s comp?`))) return;

    await ctx.platform.platform.setTenantComp({
      tenantId: tenant.id,
      plan: null,
      waiveOnlineFee: false,
    });
    ctx.io.print(`  ${tenant.slug} is no longer comped.`);
  });
}

/** The AI photo ledger — what a store spent its allowance on. */
export async function photoCredits(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const history = await caller.billing.photoCreditHistory();
    ctx.io.printLines(
      heading(`AI photo credits — ${tenant.slug} (${history.length} entries)`),
    );
    if (history.length === 0) {
      ctx.io.print("  This store has never generated an AI photo.");
      return;
    }
    ctx.io.printLines(
      table(history.slice(0, 50), [
        { label: "when", value: (e) => timestamp(e.createdAt) },
        { label: "kind", value: (e) => e.kind },
        {
          label: "delta",
          align: "right",
          value: (e) => (e.delta > 0 ? `+${e.delta}` : String(e.delta)),
        },
        { label: "ref", value: (e) => orDash(e.ref) },
        { label: "note", value: (e) => orDash(e.note) },
      ]),
    );
    if (history.length > 50) {
      ctx.io.print(`  … ${history.length - 50} older entries not shown.`);
    }
  });
}

/**
 * What the platform charges, in one screen — so an operator answering a
 * pricing question reads it off the same constants the checkout does.
 */
export async function showPlans(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ caller }) => {
    const status = await caller.billing.getStatus();
    ctx.io.printLines(heading("Plans"));
    ctx.io.printLines(
      table(status.plans, [
        { label: "id", value: (p) => p.id },
        { label: "name", value: (p) => p.name },
        { label: "price", align: "right", value: (p) => money(p.priceChf) },
        {
          label: "online fee",
          align: "right",
          value: (p) => `${p.onlineFeeBps / 100}%`,
        },
        {
          label: "AI photos/mo",
          align: "right",
          value: (p) =>
            p.aiPhotoAllowancePerMonth === null
              ? "unmetered"
              : String(p.aiPhotoAllowancePerMonth),
        },
        {
          label: "max products",
          align: "right",
          value: (p) => orDash(p.maxProducts),
        },
        {
          label: "storage",
          align: "right",
          value: (p) => `${p.storageGb} GB`,
        },
      ]),
    );
    ctx.io.print("");
    ctx.io.print(
      `  Fee applies to: ${status.onlineFees.appliesTo} (${status.onlineFees.feePercentLabel}).`,
    );
    ctx.io.print(
      `  This store's own fee right now: ${status.onlineFees.feeBps / 100}% — ` +
        `${fromMinorUnits(Math.round(status.onlineFees.monthFeeChf * 100))} so far this month.`,
    );
  });
}
