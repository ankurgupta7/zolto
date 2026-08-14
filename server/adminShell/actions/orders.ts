/**
 * Tier — Orders, payments and reconciliation.
 *
 * Reconciliation is the part worth understanding before running it: it scans
 * the STORE'S OWN connected Stripe account for succeeded payments with no
 * local counterpart, shortlists candidate pieces, and emails the merchant to
 * confirm. It does not mark anything sold on its own.
 */

import { askInteger } from "../choose";
import {
  describe,
  fromMinorUnits,
  heading,
  orDash,
  table,
  timestamp,
  truncate,
} from "../format";
import type { ActionContext } from "../types";
import { askLookbackDays, confirmWrite, withStore } from "./helpers";

export async function recentOrders(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const limit =
      (await askInteger(ctx.io, "  How many orders? [50]", {
        min: 1,
        max: 200,
      })) ?? 50;
    const orders = await caller.checkout.listOrders({ limit });
    ctx.io.printLines(
      heading(`Paid online orders — ${tenant.slug} (${orders.length})`),
    );
    if (orders.length === 0) {
      ctx.io.print("  No paid online orders. (POS sales are not listed here.)");
      return;
    }
    ctx.io.printLines(
      table(orders, [
        { label: "id", align: "right", value: (o) => String(o.id) },
        { label: "when", value: (o) => timestamp(o.createdAt) },
        {
          label: "total",
          align: "right",
          value: (o) => fromMinorUnits(o.amountTotal, o.currency),
        },
        { label: "status", value: (o) => o.status },
        { label: "method", value: (o) => orDash(o.paymentMethod) },
        { label: "customer", value: (o) => orDash(o.customerEmail) },
        {
          label: "items",
          value: (o) => truncate(o.items.map((i) => i.name).join(", "), 44),
        },
      ]),
    );
    const total = orders.reduce((sum, o) => sum + o.amountTotal, 0);
    ctx.io.print("");
    ctx.io.print(
      `  ${orders.length} orders, ${fromMinorUnits(total)} in total.`,
    );
  });
}

/**
 * Re-run fulfilment for a Stripe Checkout session — the fix for an order whose
 * webhook never arrived. Idempotent on the application's side, and it refuses
 * a session that isn't paid or isn't this store's.
 */
export async function refulfilSession(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const sessionId = await ctx.io.ask(
      "  Stripe checkout session id (cs_…, ⏎ to cancel)",
    );
    if (sessionId === "") return;
    if (
      !(await confirmWrite(
        ctx,
        `Re-run fulfilment for ${sessionId} on ${tenant.slug}?`,
      ))
    ) {
      return;
    }
    await caller.checkout.fulfillSession({ sessionId });
    ctx.io.print(
      "  Fulfilment ran: stock and the order record are up to date.",
    );
  });
}

export async function reconcileStripe(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    if (!tenant.stripeConnectedAccountId) {
      ctx.io.print(
        `  ${tenant.slug} has not connected Stripe — there is no account to scan.`,
      );
      return;
    }
    const lookbackDays = await askLookbackDays(ctx, 90, 7);
    if (
      !(await confirmWrite(
        ctx,
        `Scan ${tenant.slug}'s Stripe account for unmatched payments (${lookbackDays} days) and email them to confirm?`,
      ))
    ) {
      return;
    }
    const report = await caller.reconciliation.run({ lookbackDays });
    ctx.io.printLines(heading(`Reconciliation — ${tenant.slug}`));
    ctx.io.printLines(describe(report));
  });
}

export async function reconcilePos(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const lookbackDays = await askLookbackDays(ctx, 30, 3);
    if (
      !(await confirmWrite(
        ctx,
        `Guess which pieces ${tenant.slug}'s amount-only POS sales were, and queue them for confirmation?`,
      ))
    ) {
      return;
    }
    const report = await caller.reconciliation.runPos({ lookbackDays });
    ctx.io.printLines(heading(`POS attribution — ${tenant.slug}`));
    ctx.io.printLines(describe(report));
  });
}

/** Sales and inventory stats for the last 30 days. */
export async function salesInsights(ctx: ActionContext): Promise<void> {
  await withStore(ctx, async ({ tenant, caller }) => {
    const summary = await caller.insights.summary();
    ctx.io.printLines(heading(`Insights — ${tenant.slug} (last 30 days)`));
    ctx.io.printLines(describe(summary));
  });
}
