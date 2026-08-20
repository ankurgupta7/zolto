/**
 * Platform metrics (superadmin only) — how Gwinn itself is doing.
 *
 * Leads with the one number the pricing model lives or dies on: the share of
 * free in-person vendors who made an online or agent sale this month. A free
 * vendor who only sells at their stall pays CHF 0 forever by design, so this
 * ratio — not signups, not GMV — is the business
 * (docs/planning/pricing-pivot-agent-commerce.md §5).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEFAULT_LANGUAGE, matchSupportedLanguage } from "@/lib/languages";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { toast } from "sonner";
import { CreditCard, AlertTriangle, KeyRound, Copy } from "lucide-react";
import {
  PageHeader,
  SettingsCard,
  PrimaryButton,
  LoadingState,
} from "@/components/admin/ui";

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

/** Swiss regional locale for the active UI language ("it" → "it-CH"). */
function numberLocale(language: string): string {
  return `${matchSupportedLanguage(language) ?? DEFAULT_LANGUAGE}-CH`;
}

type SweepResult =
  inferRouterOutputs<AppRouter>["platform"]["reconcileAllTenants"];

export default function Platform() {
  const { t, i18n } = useTranslation("admin");
  const { user } = useAuth();
  const isSuperadmin = user?.role === "superadmin";

  const locale = numberLocale(i18n.language);
  const chf = (n: number) =>
    `CHF ${n.toLocaleString(locale, { maximumFractionDigits: 2 })}`;

  const query = trpc.platform.metrics.useQuery(undefined, {
    enabled: isSuperadmin,
    retry: false,
  });

  const [testKey, setTestKey] = useState<string | null>(null);
  const rotateTestKey = trpc.platform.rotatePosTestKey.useMutation({
    onSuccess: (data) => {
      setTestKey(data.posApiKey);
      toast.success(t("ops.platform.rotated"));
    },
    onError: (e) => toast.error(e.message || t("ops.platform.rotateFailed")),
  });

  const [sweep, setSweep] = useState<SweepResult | null>(null);
  const reconcileAll = trpc.platform.reconcileAllTenants.useMutation({
    onSuccess: (data) => {
      setSweep(data);
      toast.success(
        `${t("ops.platform.toastScanned", { count: data.tenantsScanned })} — ${t(
          "ops.platform.toastQueued",
          { count: data.totals.newPendingReview },
        )}`,
      );
    },
    onError: (e) => toast.error(e.message || t("ops.platform.sweepFailed")),
  });

  if (!isSuperadmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">
          {t("ops.platform.operatorOnly")}
        </p>
      </div>
    );
  }

  if (query.isLoading) {
    return <LoadingState label={t("ops.platform.loading")} />;
  }

  const m = query.data;
  if (!m) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">{t("ops.platform.unavailable")}</p>
      </div>
    );
  }

  const ns = m.northStar;

  return (
    <div>
      <PageHeader
        title={t("ops.platform.title")}
        description={t("ops.platform.description", {
          month: m.month,
          fee: m.model.feePercentLabel,
          price: m.model.proPriceChf,
        })}
      />

      {/* The north star, given the space it deserves. */}
      <div className="mb-6 rounded-xl border-2 border-primary bg-card p-6">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("ops.platform.northStarLabel")}
        </span>
        <p className="mt-2 text-5xl font-semibold tabular-nums text-foreground">
          {ns.conversionPct === null ? "—" : `${ns.conversionPct}%`}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("ops.platform.northStarLine", {
            selling: ns.freeInPersonVendorsSellingOnline,
            total: ns.freeInPersonVendors,
          })}{" "}
          {ns.conversionPct === null && t("ops.platform.northStarNone")}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("ops.platform.northStarFootnote")}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label={t("ops.platform.statOnlineGmv")}
          value={chf(m.online.gmvChf)}
          hint={t("ops.platform.statOnlineGmvHint", {
            orders: m.online.orders,
            stores: m.online.sellingTenants,
          })}
        />
        <Stat
          label={t("ops.platform.statFees")}
          value={chf(m.online.feeChf)}
          hint={t("ops.platform.statFeesHint")}
        />
        <Stat
          label={t("ops.platform.statAgent")}
          value={chf(m.online.agentGmvChf)}
          hint={t("ops.platform.statAgentHint", {
            orders: m.online.agentOrders,
          })}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label={t("ops.platform.statInPersonGmv")}
          value={chf(m.inPerson.gmvChf)}
          hint={t("ops.platform.statInPersonHint", {
            orders: m.inPerson.orders,
          })}
        />
        <Stat
          label={t("ops.platform.statStores")}
          value={String(m.tenants.total)}
          hint={t("ops.platform.statStoresHint", {
            free: m.tenants.free,
            pro: m.tenants.pro,
          })}
        />
        <Stat
          label={t("ops.platform.statProConversion")}
          value={
            m.tenants.total === 0
              ? "—"
              : `${Math.round((m.tenants.pro / m.tenants.total) * 1000) / 10}%`
          }
          hint={t("ops.platform.statProConversionHint")}
        />
      </div>

      <SettingsCard
        title={t("ops.platform.sweepTitle")}
        description={t("ops.platform.sweepDescription")}
        footer={
          <PrimaryButton
            onClick={() => reconcileAll.mutate({})}
            loading={reconcileAll.isPending}
          >
            <CreditCard className="h-4 w-4" />
            {t("ops.platform.sweepButton")}
          </PrimaryButton>
        }
      >
        {sweep ? (
          <div>
            <p className="text-sm text-foreground">
              {[
                t("ops.platform.resultStores", { count: sweep.tenantsScanned }),
                t("ops.platform.resultChecked", {
                  count: sweep.totals.scannedSucceededPayments,
                }),
                t("ops.platform.resultQueued", {
                  count: sweep.totals.newPendingReview,
                }),
                t("ops.platform.resultNoMatch", {
                  count: sweep.totals.newNoCandidates,
                }),
                t("ops.platform.resultEmails", {
                  count: sweep.totals.emailsSent,
                }),
              ].join(" · ")}
            </p>

            {sweep.tenantsFailed > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("ops.platform.failedLine", { count: sweep.tenantsFailed })}
              </p>
            )}

            {sweep.perTenant.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">
                        {t("ops.platform.thStore")}
                      </th>
                      <th className="py-2 pr-4 font-medium">
                        {t("ops.platform.thChecked")}
                      </th>
                      <th className="py-2 pr-4 font-medium">
                        {t("ops.platform.thToReview")}
                      </th>
                      <th className="py-2 font-medium">
                        {t("ops.platform.thResult")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sweep.perTenant.map((tenant) => (
                      <tr
                        key={tenant.tenantId}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 pr-4 text-foreground">
                          {tenant.name}{" "}
                          <span className="text-muted-foreground">
                            /{tenant.slug}
                          </span>
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {tenant.ok ? tenant.scannedSucceededPayments : "—"}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {tenant.ok ? tenant.newPendingReview : "—"}
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {tenant.ok
                            ? tenant.emailSent
                              ? t("ops.platform.emailed")
                              : t("ops.platform.nothingToSend")
                            : tenant.error}
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
            {t("ops.platform.sweepIdle")}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("ops.platform.keyTitle")}
        description={t("ops.platform.keyDescription")}
        footer={
          <PrimaryButton
            onClick={() => rotateTestKey.mutate()}
            loading={rotateTestKey.isPending}
          >
            <KeyRound className="h-4 w-4" />
            {t("ops.platform.rotateButton")}
          </PrimaryButton>
        }
      >
        {testKey ? (
          <div>
            <p className="mb-2 text-sm text-foreground">
              {t("ops.platform.shownOnce")}
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md border bg-muted px-3 py-2 text-xs">
                {testKey}
              </code>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
                onClick={() => {
                  navigator.clipboard
                    .writeText(testKey)
                    .then(() => toast.success(t("ops.platform.copied")))
                    .catch(() => toast.error(t("ops.platform.copyFailed")));
                }}
              >
                <Copy className="h-3.5 w-3.5" />
                {t("ops.platform.copy")}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("ops.platform.rotateIdle")}
          </p>
        )}
      </SettingsCard>

      <SettingsCard
        title={t("ops.platform.subsTitle")}
        description={t("ops.platform.subsDescription")}
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat
            label={t("ops.platform.subsActive")}
            value={String(m.subscriptions.active)}
          />
          <Stat
            label={t("ops.platform.subsTrialing")}
            value={String(m.subscriptions.trialing)}
          />
          <Stat
            label={t("ops.platform.subsPastDue")}
            value={String(m.subscriptions.pastDue)}
          />
          <Stat
            label={t("ops.platform.subsCanceled")}
            value={String(m.subscriptions.canceled)}
          />
        </div>
      </SettingsCard>
    </div>
  );
}
