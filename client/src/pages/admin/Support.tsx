/**
 * Support (account plane) — the one account page staff can also see. Plan-aware
 * support channel copy plus links to docs and platform status. Static content;
 * the plan tier only changes which channel is highlighted.
 */
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
// support".
const SUPPORT_LEVEL = {
  priority: "Priority human support, answered within one business day.",
  standard: "Community & email support, answered within a few business days.",
} as const;

export default function Support() {
  useAuth();
  const me = trpc.tenant.me.useQuery(undefined, { retry: false });
  const plan = me.data?.plan ?? "free";

  return (
    <div>
      <PageHeader
        title="Support"
        description="Get help running your shop. We're makers too."
      />

      <SettingsCard title="Your support level">
        <div className="flex items-start gap-3">
          <LifeBuoy className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium capitalize text-foreground">
              {plan} plan
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {featuresForPlan(plan).prioritySupport
                ? SUPPORT_LEVEL.priority
                : SUPPORT_LEVEL.standard}
            </p>
          </div>
        </div>
      </SettingsCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <a
          href="mailto:support@zolto.ch"
          className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary"
        >
          <Mail className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          <p className="mt-3 text-sm font-medium text-foreground">Email us</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            support@zolto.ch
          </p>
        </a>
        <a
          href="https://zolto.ch/blog"
          target="_blank"
          rel="noopener noreferrer"
          className="group rounded-xl border bg-card p-5 transition-colors hover:border-primary"
        >
          <BookOpen className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
          <p className="mt-3 text-sm font-medium text-foreground">
            Guides & docs
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            How-tos for every feature
          </p>
        </a>
        <div className="rounded-xl border bg-card p-5">
          <Activity className="h-5 w-5 text-emerald-500" />
          <p className="mt-3 text-sm font-medium text-foreground">
            Platform status
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            All systems operational
          </p>
        </div>
      </div>
    </div>
  );
}
