/**
 * Platform metrics (superadmin only) — how Zolto itself is doing.
 *
 * Leads with the one number the pricing model lives or dies on: the share of
 * free in-person vendors who made an online or agent sale this month. A free
 * vendor who only sells at their stall pays CHF 0 forever by design, so this
 * ratio — not signups, not GMV — is the business
 * (docs/planning/pricing-pivot-agent-commerce.md §5).
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { PageHeader, SettingsCard } from "@/components/admin/ui";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const chf = (n: number) =>
  `CHF ${n.toLocaleString("en-CH", { maximumFractionDigits: 2 })}`;

export default function Platform() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";

  const query = trpc.platform.metrics.useQuery(undefined, {
    enabled: isSuperadmin,
    retry: false,
  });

  if (!isSuperadmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">
          Platform metrics are for the Zolto operator only.
        </p>
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const m = query.data;
  if (!m) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">Metrics are unavailable.</p>
      </div>
    );
  }

  const ns = m.northStar;

  return (
    <div>
      <PageHeader
        title="Platform metrics"
        description={`Zolto-wide, for ${m.month} (UTC). Free vendors pay ${m.model.feePercentLabel} on online and agent orders; Pro is CHF ${m.model.proPriceChf}/mo and pays none.`}
      />

      {/* The north star, given the space it deserves. */}
      <div className="mb-6 rounded-xl border-2 border-primary bg-card p-6">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          North star — free in-person vendors selling online
        </span>
        <p className="mt-2 text-5xl font-semibold tabular-nums text-foreground">
          {ns.conversionPct === null ? "—" : `${ns.conversionPct}%`}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {ns.freeInPersonVendorsSellingOnline} of {ns.freeInPersonVendors} free
          vendors who sold in person this month also made an online or agent
          sale.{" "}
          {ns.conversionPct === null &&
            "No free vendor has sold in person yet this month, so there is nothing to convert."}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          A free, in-person-only vendor pays Zolto nothing — by design. This
          ratio is whether the model works.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Online + agent GMV"
          value={chf(m.online.gmvChf)}
          hint={`${m.online.orders} orders from ${m.online.sellingTenants} stores`}
        />
        <Stat
          label="Platform fees earned"
          value={chf(m.online.feeChf)}
          hint="The Free plan's share of online sales"
        />
        <Stat
          label="Agent-originated"
          value={chf(m.online.agentGmvChf)}
          hint={`${m.online.agentOrders} orders bought by AI agents`}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="In-person GMV"
          value={chf(m.inPerson.gmvChf)}
          hint={`${m.inPerson.orders} sales — Zolto takes nothing here`}
        />
        <Stat
          label="Stores"
          value={String(m.tenants.total)}
          hint={`${m.tenants.free} free · ${m.tenants.pro} Pro`}
        />
        <Stat
          label="Pro conversion"
          value={
            m.tenants.total === 0
              ? "—"
              : `${Math.round((m.tenants.pro / m.tenants.total) * 1000) / 10}%`
          }
          hint={`Break-even at CHF 2,500 online/mo`}
        />
      </div>

      <SettingsCard
        title="Subscriptions"
        description="Watch canceled and past-due through the off-season — seasonality is the model's known weak point."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Active" value={String(m.subscriptions.active)} />
          <Stat label="Trialing" value={String(m.subscriptions.trialing)} />
          <Stat label="Past due" value={String(m.subscriptions.pastDue)} />
          <Stat label="Canceled" value={String(m.subscriptions.canceled)} />
        </div>
      </SettingsCard>
    </div>
  );
}
