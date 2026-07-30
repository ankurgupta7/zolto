/**
 * AI usage (account plane) — docs/ARCHITECTURE-ADMIN.md §7.
 *
 * Post-pivot (two-tier pricing) there is nothing to buy here: AI photo
 * generation is included with the plan — a monthly allowance on Free (the
 * "taste of AI"), unmetered on Pro. Queries are never the meter. The page
 * shows this month's usage and the generation log for transparency.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Sparkles } from "lucide-react";
import { Link } from "wouter";
import { PageHeader, SettingsCard, AdminOnly } from "@/components/admin/ui";

const LEDGER_LABELS: Record<string, string> = {
  monthly_grant: "Plan bucket (pre-pivot)",
  purchase: "Top-up purchase (pre-pivot)",
  consumption: "AI photo generated",
  manual_adjustment: "Adjustment",
  refund: "Refund (generation failed)",
};

export default function Credits() {
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

  return (
    <div>
      <PageHeader
        title="AI usage"
        description="AI photo generation is included with your plan — a monthly allowance on Free, unmetered on Pro. Queries are never the meter."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wide">
              AI photo shots this month
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
            {ai == null
              ? "—"
              : unmetered
                ? "Unmetered"
                : `${ai.usedThisMonth} / ${ai.allowancePerMonth}`}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Descriptions, translations &amp; chat
          </span>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            Not counted
          </p>
        </div>
      </div>

      {ai != null && !unmetered && (
        <SettingsCard
          title="Want unmetered AI?"
          description="Pro removes the monthly allowance entirely — and the 1% online fee with it."
        >
          <p className="text-sm text-muted-foreground">
            Upgrade under{" "}
            <Link href="/admin/account/plan" className="underline">
              Plan &amp; billing
            </Link>
            . Your allowance also resets automatically each month.
          </p>
        </SettingsCard>
      )}

      <SettingsCard title="Generation log">
        {history.data && history.data.length > 0 ? (
          <ul className="divide-y">
            {history.data.map((row) => {
              const delta = (row as { delta: number }).delta;
              const kind = (row as { kind: string }).kind;
              const createdAt = (row as { createdAt: string | Date }).createdAt;
              return (
                <li
                  key={(row as { id: number }).id}
                  className="flex items-center justify-between py-2.5 text-sm first:pt-0 last:pb-0"
                >
                  <div>
                    <p className="text-foreground">
                      {LEDGER_LABELS[kind] ?? kind}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(createdAt).toLocaleDateString()}
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
          <p className="text-sm text-muted-foreground">No AI activity yet.</p>
        )}
      </SettingsCard>
    </div>
  );
}
