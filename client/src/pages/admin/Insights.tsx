/**
 * Insights (store plane, Pro) — a stats dashboard for the last 30 days plus
 * an on-demand AI narrative. Stats come from insights.summary (available on any
 * plan); the narrative is insights.narrative, which the server gates to Pro
 * advanced analytics — a FORBIDDEN there renders the upsell rather than an error.
 */
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEFAULT_LANGUAGE, matchSupportedLanguage } from "@/lib/languages";
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

/** Swiss regional locale for the active UI language ("it" → "it-CH"). */
function numberLocale(language: string): string {
  return `${matchSupportedLanguage(language) ?? DEFAULT_LANGUAGE}-CH`;
}

function money(v: number, currency: string, locale: string): string {
  return `${currency} ${v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Insights() {
  const { t, i18n } = useTranslation("admin");
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
  const locale = numberLocale(i18n.language);

  const narrativeForbidden =
    narrative.error instanceof TRPCClientError &&
    narrative.error.data?.code === "FORBIDDEN";

  const stats = s
    ? [
        {
          label: t("ops.insights.statRevenue30d"),
          value: money(s.last30d.totalRevenue, cur, locale),
        },
        {
          label: t("ops.insights.statOnlineOrders"),
          value: String(s.last30d.onlineOrders),
        },
        {
          label: t("ops.insights.statMarketSales"),
          value: String(s.last30d.posSales),
        },
        {
          label: t("ops.insights.statUnitsSold30d"),
          value: String(s.last30d.totalUnits),
        },
        {
          label: t("ops.insights.statLiveProducts"),
          value: String(s.catalog.live),
        },
        {
          label: t("ops.insights.statSoldAllTime"),
          value: String(s.catalog.sold),
        },
        {
          label: t("ops.insights.statTotalProducts"),
          value: String(s.catalog.total),
        },
        {
          label: t("ops.insights.statAvgPrice"),
          value: money(s.catalog.avgPrice, cur, locale),
        },
      ]
    : [];

  return (
    <div>
      <PageHeader
        title={t("ops.insights.title")}
        description={t("ops.insights.description")}
      />

      {summary.isLoading ? (
        <LoadingState label={t("ops.insights.loading")} />
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
            <SettingsCard title={t("ops.insights.topSellersTitle")}>
              <ul className="divide-y">
                {s.topSellers.map((top, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="flex items-center gap-2 text-foreground">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      {top.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {t("ops.insights.soldLine", {
                        units: top.units,
                        amount: money(top.revenue, cur, locale),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </SettingsCard>
          )}

          {s && s.staleStock.length > 0 && (
            <SettingsCard
              title={t("ops.insights.slowMoversTitle")}
              description={t("ops.insights.slowMoversDescription")}
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
                      {t("ops.insights.staleLine", {
                        days: p.daysLive,
                        amount: money(p.price, cur, locale),
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </SettingsCard>
          )}

          <SettingsCard
            title={t("ops.insights.aiTitle")}
            description={t("ops.insights.aiDescription")}
          >
            {narrativeForbidden ? (
              <PlanGate
                requiredPlan="pro"
                feature={t("ops.insights.aiFeature")}
              />
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
                {t("ops.insights.generate")}
              </PrimaryButton>
            )}
          </SettingsCard>
        </>
      )}
    </div>
  );
}
