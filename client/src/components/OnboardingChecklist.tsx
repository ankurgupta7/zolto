/**
 * OnboardingChecklist — the live setup checklist on /admin
 * (docs/ARCHITECTURE.md §3.2).
 *
 * Completion is server-derived (tenant.onboardingStatus), so tasks tick off in
 * real time as the merchant — or the platform, asynchronously — finishes them.
 * While visible it polls every 5s. Open tasks offer "Go there" (deep link)
 * and "Show me" (launches the GuidedTour for that task); blocked tasks are
 * greyed with the server's reason. All done → congratulates and offers dismiss.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
// Ensure the shared i18n instance is initialized even when this block is
// pulled in isolation (e.g. under test) before main.tsx has run.
import "@/lib/i18n";
import { Link } from "wouter";
import { toast } from "sonner";
import GuidedTour from "@/components/GuidedTour";
import { TOURS, hasTour } from "@/lib/tours";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Play,
  X,
} from "lucide-react";

export default function OnboardingChecklist() {
  const { t } = useTranslation("admin");
  const utils = trpc.useUtils();
  const [collapsed, setCollapsed] = useState(false);
  const [activeTour, setActiveTour] = useState<string | null>(null);

  const status = trpc.tenant.onboardingStatus.useQuery(undefined, {
    // Poll while visible so async platform steps (Stripe Connect return,
    // POS first sale) tick themselves off live.
    refetchInterval: 5000,
  });
  const dismiss = trpc.tenant.dismissOnboarding.useMutation({
    onSuccess: () => utils.tenant.onboardingStatus.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const data = status.data;
  if (status.isLoading || !data || data.dismissed) return null;

  return (
    <section
      aria-label={t("catalog.components.onboarding.ariaLabel")}
      className="border border-[var(--brand-accent)]/40 bg-[var(--brand-surface)] mb-10"
    >
      <header className="flex items-center justify-between px-5 py-3.5">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 text-left"
        >
          <h2 className="font-serif text-lg text-[var(--brand-text)]">
            {data.allDone
              ? t("catalog.components.onboarding.allDoneTitle")
              : t("catalog.components.onboarding.title")}
          </h2>
          <span className="text-xs font-sans text-[var(--brand-muted-2)]">
            {data.doneCount}/{data.totalCount}
          </span>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        <button
          type="button"
          aria-label={t("catalog.components.onboarding.hideAria")}
          disabled={dismiss.isPending}
          onClick={() => dismiss.mutate()}
          className="text-[var(--brand-muted-2)] hover:text-[var(--brand-text)] disabled:opacity-50"
        >
          <X size={16} />
        </button>
      </header>

      {!collapsed && (
        <div className="px-5 pb-4">
          {/* progress bar */}
          <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[var(--brand-border)]">
            <div
              className="h-full rounded-full bg-[var(--brand-accent)] transition-all"
              style={{ width: `${(data.doneCount / data.totalCount) * 100}%` }}
            />
          </div>

          <ol className="space-y-2">
            {data.tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-3 border border-[var(--brand-border)] bg-white px-4 py-3"
              >
                {task.done ? (
                  <CheckCircle2
                    size={18}
                    className="mt-0.5 flex-shrink-0 text-green-700"
                  />
                ) : (
                  <Circle
                    size={18}
                    className="mt-0.5 flex-shrink-0 text-[var(--brand-border-2)]"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      task.done
                        ? "text-[var(--brand-muted)] line-through"
                        : "text-[var(--brand-text)]"
                    }`}
                  >
                    {task.title}
                  </p>
                  {!task.done && (
                    <p className="mt-0.5 text-xs text-[var(--brand-muted-2)]">
                      {task.blockedReason ?? task.body}
                    </p>
                  )}
                </div>
                {!task.done && !task.blockedReason && (
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {task.href && (
                      <Link
                        href={task.href}
                        className="text-xs font-sans uppercase tracking-[0.1em] text-[var(--brand-accent)] hover:underline"
                      >
                        {t("catalog.components.onboarding.goThere")}
                      </Link>
                    )}
                    {hasTour(task.tourId) && (
                      <button
                        type="button"
                        onClick={() => setActiveTour(task.tourId!)}
                        className="flex items-center gap-1 text-xs font-sans uppercase tracking-[0.1em] text-[var(--brand-muted-2)] hover:text-[var(--brand-text)]"
                      >
                        <Play size={11} />{" "}
                        {t("catalog.components.onboarding.showMe")}
                      </button>
                    )}
                  </div>
                )}
                {!task.done && task.blockedReason && (
                  <span className="flex-shrink-0 text-[10px] uppercase tracking-[0.1em] text-[var(--brand-muted)]">
                    {t("catalog.components.onboarding.blocked")}
                  </span>
                )}
              </li>
            ))}
          </ol>

          {data.allDone && (
            <button
              type="button"
              disabled={dismiss.isPending}
              onClick={() => dismiss.mutate()}
              className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.12em] text-[var(--brand-accent)] hover:underline disabled:opacity-50"
            >
              {dismiss.isPending ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <CheckCircle2 size={12} />
              )}
              {t("catalog.components.onboarding.hideChecklist")}
            </button>
          )}
        </div>
      )}

      {/* "Show me" launches the task's coach-mark tour over the live page. */}
      {activeTour && (
        <GuidedTour
          tourId={`onboarding-${activeTour}`}
          steps={TOURS[activeTour]}
          autoStart
          onFinish={() => setActiveTour(null)}
        />
      )}
    </section>
  );
}
