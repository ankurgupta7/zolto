/**
 * Tier — Platform: the operations that cross tenants by design.
 */

import { heading, keyValues, money, orDash, table, timestamp } from "../format";
import type { ActionContext } from "../types";
import { askLookbackDays, confirmWrite } from "./helpers";

export async function operatingMetrics(ctx: ActionContext): Promise<void> {
  const m = await ctx.platform.platform.metrics();
  ctx.io.printLines(heading(`Zolto — operating metrics (${m.month})`));
  ctx.io.printLines(
    keyValues([
      [
        "stores",
        `${m.tenants.total} (free ${m.tenants.free}, pro ${m.tenants.pro})`,
      ],
      [
        "north star",
        m.northStar.conversionPct === null
          ? "—"
          : `${m.northStar.conversionPct}% of free in-person vendors also sell online ` +
            `(${m.northStar.freeInPersonVendorsSellingOnline}/${m.northStar.freeInPersonVendors})`,
      ],
      [
        "online",
        `${money(m.online.gmvChf)} GMV · ${m.online.orders} orders · ${m.online.sellingTenants} stores`,
      ],
      [
        "of which agent",
        `${money(m.online.agentGmvChf)} · ${m.online.agentOrders} orders`,
      ],
      [
        "platform fee earned",
        `${money(m.online.feeChf)} (${m.model.feePercentLabel})`,
      ],
      [
        "in person",
        `${money(m.inPerson.gmvChf)} GMV · ${m.inPerson.orders} orders · ${m.inPerson.sellingTenants} stores`,
      ],
      [
        "subscriptions",
        `${m.subscriptions.active} active · ${m.subscriptions.trialing} trialing · ` +
          `${m.subscriptions.pastDue} past due · ${m.subscriptions.canceled} canceled`,
      ],
      ["Pro price", money(m.model.proPriceChf)],
    ]),
  );
}

/**
 * The all-stores Stripe sweep. One tenant failing (a revoked Connect grant, a
 * Stripe outage) is recorded against that tenant rather than aborting the run,
 * so one bad store cannot hide every other store's unmatched payments.
 */
export async function reconcileEveryStore(ctx: ActionContext): Promise<void> {
  const lookbackDays = await askLookbackDays(ctx, 90, 7);
  ctx.io.print(
    "  This scans every store that has connected Stripe, against its own account, " +
      "and emails each merchant anything it cannot match.",
  );
  if (
    !(await confirmWrite(
      ctx,
      `Run reconciliation across all stores (${lookbackDays} days)?`,
    ))
  ) {
    return;
  }
  const report = await ctx.platform.platform.reconcileAllTenants({
    lookbackDays,
  });
  ctx.io.printLines(
    heading(
      `Platform reconciliation — ${report.tenantsScanned} scanned, ${report.tenantsFailed} failed`,
    ),
  );
  ctx.io.printLines(
    table(report.perTenant, [
      { label: "store", value: (t) => t.slug },
      {
        label: "payments",
        align: "right",
        value: (t) => (t.ok ? String(t.scannedSucceededPayments) : "—"),
      },
      {
        label: "already known",
        align: "right",
        value: (t) => (t.ok ? String(t.alreadyRecorded) : "—"),
      },
      {
        label: "to review",
        align: "right",
        value: (t) => (t.ok ? String(t.newPendingReview) : "—"),
      },
      {
        label: "no candidates",
        align: "right",
        value: (t) => (t.ok ? String(t.newNoCandidates) : "—"),
      },
      {
        label: "emailed",
        value: (t) => (t.ok ? (t.emailSent ? "yes" : "no") : "—"),
      },
      { label: "error", value: (t) => (t.ok ? "" : t.error) },
    ]),
  );
  ctx.io.print("");
  ctx.io.print(
    `  Totals: ${report.totals.scannedSucceededPayments} payments scanned, ` +
      `${report.totals.newPendingReview} queued for a merchant to confirm, ` +
      `${report.totals.emailsSent} emails sent.`,
  );
}

/**
 * Rotate the POS test key — the platform's own test store, whose key the POS
 * apps' CI uses. Returned once; CI secrets must be updated in the same sitting
 * because the old key stops working immediately.
 */
export async function rotatePosTestKey(ctx: ActionContext): Promise<void> {
  ctx.io.print(
    "  The POS apps' CI authenticates with this key. Rotating it breaks CI until " +
      "the POS_API_KEY secret is updated.",
  );
  if (!(await confirmWrite(ctx, "Rotate the platform POS test key now?"))) {
    return;
  }
  const result = await ctx.platform.platform.rotatePosTestKey();
  ctx.io.printLines(heading("New POS test key — shown once"));
  ctx.io.printLines(
    keyValues([
      ["store", `${result.slug} (id ${result.tenantId})`],
      ["POS_API_KEY", result.posApiKey],
    ]),
  );
}

export async function serviceHealth(ctx: ActionContext): Promise<void> {
  const started = Date.now();
  const health = await ctx.platform.system.health({ timestamp: started });
  ctx.io.printLines(heading("Service health"));
  ctx.io.printLines(
    keyValues([
      ["app + database", health.ok ? "ok" : "not ok"],
      ["round trip", `${Date.now() - started} ms`],
      ["checked at", timestamp(new Date(started))],
    ]),
  );
}

/** Who this shell is acting as, and what that lets it do. */
export async function whoAmI(ctx: ActionContext): Promise<void> {
  ctx.io.printLines(heading("Operator"));
  ctx.io.printLines(
    keyValues([
      ["acting as", orDash(ctx.operator.email)],
      ["name", orDash(ctx.operator.name)],
      ["user id", String(ctx.operator.id)],
      ["role", ctx.operator.role],
      ["sign-in method", orDash(ctx.operator.loginMethod)],
      ["mode", ctx.readOnly ? "read-only" : "read-write"],
      ["working store", ctx.currentStore()?.slug ?? "none"],
    ]),
  );
  ctx.io.print("");
  ctx.io.print(
    "  Every write goes through the same tRPC procedures the web console uses, " +
      "and leaves an [operator-audit] line in the server log naming this account.",
  );
}
