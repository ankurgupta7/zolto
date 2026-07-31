/**
 * Insights (store plane, Pro) — a stats dashboard for the last 30 days plus
 * an on-demand AI narrative. Stats come from insights.summary (available on any
 * plan); the narrative is insights.narrative, which the server gates to Pro
 * advanced analytics — a FORBIDDEN there renders the upsell rather than an error.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import {
  BarChart3,
  Loader2,
  Sparkles,
  TrendingUp,
  Package,
} from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  PrimaryButton,
  LoadingState,
  AdminOnly,
  PlanGate,
} from "@/components/admin/ui";

function money(v: number, currency: string): string {
  return `${currency} ${v.toLocaleString("de-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Insights() {
  const { user } = useAuth();
  const summary = trpc.insights.summary.useQuery(undefined, { retry: false });
  const narrative = trpc.insights.narrative.useQuery(undefined, {
    enabled: false,
    retry: false,
  });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  const s = summary.data;
  const cur = s?.currency ?? "CHF";

  const narrativeForbidden =
    narrative.error instanceof TRPCClientError &&
    narrative.error.data?.code === "FORBIDDEN";

  const stats = s
    ? [
        { label: "Revenue (30d)", value: money(s.last30d.totalRevenue, cur) },
        { label: "Online orders", value: String(s.last30d.onlineOrders) },
        { label: "Market sales", value: String(s.last30d.posSales) },
        { label: "Units sold (30d)", value: String(s.last30d.totalUnits) },
        { label: "Live products", value: String(s.catalog.live) },
        { label: "Sold all time", value: String(s.catalog.sold) },
        { label: "Total products", value: String(s.catalog.total) },
        { label: "Avg. price", value: money(s.catalog.avgPrice, cur) },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Insights"
        description="How your shop is doing, and what to do next."
      />

      {summary.isLoading ? (
        <LoadingState label="Doing the sums…" />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border bg-card p-5">
                <p className="text-2xl font-semibold tabular-nums text-foreground">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          {s && s.topSellers.length > 0 && (
            <SettingsCard title="Top sellers (30 days)">
              <ul className="divide-y">
                {s.topSellers.map((t, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="flex items-center gap-2 text-foreground">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      {t.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {t.units} sold · {money(t.revenue, cur)}
                    </span>
                  </li>
                ))}
              </ul>
            </SettingsCard>
          )}

          {s && s.staleStock.length > 0 && (
            <SettingsCard
              title="Slow movers"
              description="Live a while without selling — consider restyling the photo or adjusting the price."
            >
              <ul className="divide-y">
                {s.staleStock.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="flex items-center gap-2 text-foreground">
                      <Package className="h-4 w-4 text-amber-500" />
                      {p.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {p.daysLive}d live · {money(p.price, cur)}
                    </span>
                  </li>
                ))}
              </ul>
            </SettingsCard>
          )}

          <SettingsCard
            title="AI analysis"
            description="A written read on what's selling and what to change next."
          >
            {narrativeForbidden ? (
              <PlanGate requiredPlan="pro" feature="AI insights" />
            ) : narrative.data ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                {narrative.data.narrative}
              </p>
            ) : (
              <PrimaryButton
                onClick={() => narrative.refetch()}
                loading={narrative.isFetching}
              >
                {narrative.isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Generate insights
              </PrimaryButton>
            )}
          </SettingsCard>
        </>
      )}
    </div>
  );
}
