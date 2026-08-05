/**
 * AI usage (account plane) — docs/ARCHITECTURE-ADMIN.md §7.
 *
 * Post-pivot (two-tier pricing) there is nothing to buy here: AI photo
 * generation is included with the plan — a monthly allowance on Free (the
 * "taste of AI"), unmetered on Pro. Queries are never the meter. The page
 * shows this month's usage and the generation log for transparency.
 */
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { DEFAULT_LANGUAGE, matchSupportedLanguage } from "@/lib/languages";
import { Sparkles } from "lucide-react";
import { Link } from "wouter";
import { PageHeader, SettingsCard, AdminOnly } from "@/components/admin/ui";

/** Ledger `kind` → i18n key under `ops.credits`. */
const LEDGER_LABEL_KEYS: Record<string, string> = {
  monthly_grant: "ledgerMonthlyGrant",
  purchase: "ledgerPurchase",
  consumption: "ledgerConsumption",
  manual_adjustment: "ledgerManualAdjustment",
  refund: "ledgerRefund",
};

/** Swiss regional locale for the active UI language ("it" → "it-CH"). */
function dateLocale(language: string): string {
  return `${matchSupportedLanguage(language) ?? DEFAULT_LANGUAGE}-CH`;
}

export default function Credits() {
  const { t, i18n } = useTranslation("admin");
  const { user } = useAuth();

  const status = trpc.billing.getStatus.useQuery(undefined, { retry: false });
  const history = trpc.billing.photoCreditHistory.useQuery(undefined, {
    retry: false,
  });

  if (user && user.role !== "admin" && user.role !== "superadmin") {
    return <AdminOnly />;
  }

  const ai = status.data?.ai;
  const unmetered = ai != null && ai.allowancePerMonth === null;
  const locale = dateLocale(i18n.language);

  return (
    <div>
      <PageHeader
        title={t("ops.credits.title")}
        description={t("ops.credits.description")}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              {t("ops.credits.shotsThisMonth")}
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
            {ai == null
              ? "—"
              : unmetered
                ? t("ops.credits.unmetered")
                : `${ai.usedThisMonth} / ${ai.allowancePerMonth}`}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("ops.credits.textAi")}
          </span>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {t("ops.credits.notCounted")}
          </p>
        </div>
      </div>

      {ai != null && !unmetered && (
        <SettingsCard
          title={t("ops.credits.upsellTitle")}
          description={t("ops.credits.upsellDescription")}
        >
          <p className="text-sm text-muted-foreground">
            {t("ops.credits.upgradePrefix")}{" "}
            <Link href="/admin/account/plan" className="underline">
              {t("ops.credits.upgradeLink")}
            </Link>
            {t("ops.credits.upgradeSuffix")}
          </p>
        </SettingsCard>
      )}

      <SettingsCard title={t("ops.credits.logTitle")}>
        {history.data && history.data.length > 0 ? (
          <ul className="divide-y">
            {history.data.map((row) => {
              const delta = (row as { delta: number }).delta;
              const kind = (row as { kind: string }).kind;
              const createdAt = (row as { createdAt: string | Date }).createdAt;
              const labelKey = LEDGER_LABEL_KEYS[kind];
              return (
                <li
                  key={(row as { id: number }).id}
                  className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-foreground">
                      {labelKey ? t(`ops.credits.${labelKey}`) : kind}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(createdAt).toLocaleDateString(locale)}
                    </p>
                  </div>
                  <span
                    className={`tabular-nums font-medium ${delta >= 0 ? "text-emerald-600" : "text-muted-foreground"}`}
                  >
                    {delta >= 0 ? `+${delta}` : delta}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("ops.credits.noActivity")}
          </p>
        )}
      </SettingsCard>
    </div>
  );
}
