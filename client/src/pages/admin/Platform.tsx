/**
 * Platform metrics (superadmin only) — how Zolto itself is doing.
 *
 * Leads with the one number the pricing model lives or dies on: the share of
 * free in-person vendors who made an online or agent sale this month. A free
 * vendor who only sells at their stall pays CHF 0 forever by design, so this
 * ratio — not signups, not GMV — is the business
 * (docs/planning/pricing-pivot-agent-commerce.md §5).
 */
import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { toast } from "sonner";
import { Loader2, CreditCard, AlertTriangle } from "lucide-react";
import { PageHeader, SettingsCard, PrimaryButton } from "@/components/admin/ui";

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

type SweepResult =
  inferRouterOutputs<AppRouter>["platform"]["reconcileAllTenants"];

export default function Platform() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";

  const query = trpc.platform.metrics.useQuery(undefined, {
    enabled: isSuperadmin,
    retry: false,
  });

  const [sweep, setSweep] = useState<SweepResult | null>(null);
  const reconcileAll = trpc.platform.reconcileAllTenants.useMutation({
    onSuccess: (data) => {
      setSweep(data);
      toast.success(
        `Scanned ${data.tenantsScanned} store${data.tenantsScanned === 1 ? "" : "s"} — ${data.totals.newPendingReview} payment${data.totals.newPendingReview === 1 ? "" : "s"} queued for review.`,
      );
    },
    onError: (e) => toast.error(e.message || "Platform reconciliation failed."),
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
        title="Stripe reconciliation — all stores"
        description="Scan every store that has connected Stripe, each against their own account, for succeeded payments missing from our records. Each merchant is emailed their own shortlist to confirm."
        footer={
          <PrimaryButton
            onClick={() => reconcileAll.mutate({})}
            loading={reconcileAll.isPending}
          >
            <CreditCard className="h-4 w-4" />
            Reconcile every store
          </PrimaryButton>
        }
      >
        {sweep ? (
          <div>
            <p className="text-sm text-foreground">
              {sweep.tenantsScanned} store
              {sweep.tenantsScanned === 1 ? "" : "s"} scanned ·{" "}
              {sweep.totals.scannedSucceededPayments} payments checked ·{" "}
              {sweep.totals.newPendingReview} queued for review ·{" "}
              {sweep.totals.newNoCandidates} with no close match ·{" "}
              {sweep.totals.emailsSent} email
              {sweep.totals.emailsSent === 1 ? "" : "s"} sent
            </p>

            {sweep.tenantsFailed > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {sweep.tenantsFailed} store
                {sweep.tenantsFailed === 1 ? "" : "s"} could not be scanned —
                listed below. The rest still completed.
              </p>
            )}

            {sweep.perTenant.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Store</th>
                      <th className="py-2 pr-4 font-medium">Checked</th>
                      <th className="py-2 pr-4 font-medium">To review</th>
                      <th className="py-2 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sweep.perTenant.map((t) => (
                      <tr key={t.tenantId} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-foreground">
                          {t.name}{" "}
                          <span className="text-muted-foreground">
                            /{t.slug}
                          </span>
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {t.ok ? t.scannedSucceededPayments : "—"}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {t.ok ? t.newPendingReview : "—"}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {t.ok
                            ? t.emailSent
                              ? "emailed"
                              : "nothing to send"
                            : t.error}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Stores with no connected Stripe account are skipped — an
            in-person-only merchant has no online payments to reconcile. Safe to
            re-run: a payment already recorded is never queued twice.
          </p>
        )}
      </SettingsCard>

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
