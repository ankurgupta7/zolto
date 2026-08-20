/**
 * Support (account plane) — the one account page staff can also see. Plan-aware
 * support channel copy plus links to docs and platform status. Static content;
 * the plan tier only changes which channel is highlighted.
 */
import { useTranslation } from "react-i18next";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { LifeBuoy, BookOpen, Activity, Mail } from "lucide-react";
import { PageHeader, SettingsCard } from "@/components/admin/ui";
import { featuresForPlan } from "@shared/platform";

// Keyed off PLAN_FEATURES.prioritySupport rather than plan ids, so a plan
// rename can't silently downgrade what a merchant is told. The previous map
// was keyed free/maker/studio/atelier; after the Free/Pro pivot "pro" hit the
// `?? free` fallback and a paying merchant was told they had community support
// with a multi-day response — while the pricing page sold them "Priority human
// support". The copy itself lives in store.support.level* locale keys.

export default function Support() {
  const { t } = useTranslation("admin");
  useAuth();
  const me = trpc.tenant.me.useQuery(undefined, { retry: false });
  const plan = me.data?.plan ?? "free";

  return (
    <div>
      <PageHeader
        title={t("store.support.title")}
        description={t("store.support.description")}
      />

      <SettingsCard title={t("store.support.levelTitle")}>
        <div className="flex items-start gap-3">
          <LifeBuoy className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium capitalize text-foreground">
              {t("store.support.planName", { plan })}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {featuresForPlan(plan).prioritySupport
                ? t("store.support.levelPriority")
                : t("store.support.levelStandard")}
            </p>
          </div>
        </div>
      </SettingsCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <a
          href="mailto:support@gwinn.ch"
          className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary"
        >
          <Mail className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {t("store.support.emailUs")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            support@gwinn.ch
          </p>
        </a>
        <a
          href="https://gwinn.ch/blog"
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary"
        >
          <BookOpen className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {t("store.support.guidesDocs")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("store.support.guidesNote")}
          </p>
        </a>
        <div className="rounded-xl border bg-card p-5">
          <Activity className="h-5 w-5 text-emerald-500" />
          <p className="mt-3 text-sm font-medium text-foreground">
            {t("store.support.statusTitle")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("store.support.statusNote")}
          </p>
        </div>
      </div>
    </div>
  );
}
