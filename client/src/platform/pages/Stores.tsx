/**
 * Every store on the platform — the operator's list view.
 *
 * Sorted newest-first by the server. The one thing this page is designed to
 * make impossible to miss is a store with users but no admin: that tenant's
 * owner is locked out of their own admin area and every button they press
 * fails with a permissions error that reads like a payments bug.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Search, ExternalLink } from "lucide-react";
import { PageHeader, LoadingState, inputClass } from "@/components/admin/ui";
import { effectivePlan } from "@shared/entitlements";
import type { PlanId } from "@shared/platform";

/** The plan a listed store actually gets, comp included. */
function effectivePlanOf(t: {
  plan: string;
  comp: { plan: "free" | "pro" | null; feeWaived: boolean } | null;
}): PlanId {
  return effectivePlan({
    plan: t.plan,
    compPlan: t.comp?.plan ?? null,
    compFeeWaived: t.comp?.feeWaived ?? false,
  });
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn";
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    good: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    warn: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export default function Stores() {
  const query = trpc.platform.tenants.useQuery(undefined, { retry: false });
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    const all = query.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (t.domain ?? "").toLowerCase().includes(q),
    );
  }, [query.data, filter]);

  if (query.isLoading) return <LoadingState label="Loading every store…" />;

  if (query.error) {
    return (
      <p className="text-sm text-muted-foreground">
        Could not load stores: {query.error.message}
      </p>
    );
  }

  const all = query.data ?? [];
  const lockedOut = all.filter((t) => t.adminCount === 0 && t.userCount > 0);

  return (
    <div>
      <PageHeader
        title="Stores"
        description={`${all.length} store${all.length === 1 ? "" : "s"} on Gwinn.`}
      />

      {lockedOut.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/40">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {lockedOut.length} store{lockedOut.length === 1 ? " has" : "s have"}{" "}
            users but no admin
          </p>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Their owners signed in but never redeemed the claim token, so every
            admin action fails for them. Open the store and promote the owner.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {lockedOut.map((t) => (
              <Link
                key={t.id}
                href={`/platform/stores/${t.id}`}
                className="rounded-md border border-amber-400 px-2 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900/40"
              >
                {t.slug}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center gap-2">
        <Search
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, address, or domain"
          aria-label="Filter stores"
          className={inputClass}
        />
      </div>

      {rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {all.length === 0
            ? "No stores yet."
            : `Nothing matches "${filter.trim()}".`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Store</th>
                <th className="px-4 py-2 font-medium">Plan</th>
                <th className="px-4 py-2 font-medium">Subscription</th>
                <th className="px-4 py-2 font-medium">Stripe</th>
                <th className="px-4 py-2 font-medium">People</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/stores/${t.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {t.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {t.domain ?? `${t.slug}.gwinn.ch`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {/* The plan the store is ENTITLED to, with the grant said
                        out loud beside it — a comped Pro looks exactly like a
                        paying Pro otherwise, which is how a comp gets left on
                        a store for a year without anyone noticing. */}
                    <div className="flex flex-wrap items-center gap-1">
                      <StatusPill
                        tone={effectivePlanOf(t) === "pro" ? "good" : "neutral"}
                      >
                        {effectivePlanOf(t)}
                      </StatusPill>
                      {t.comp && (
                        <StatusPill tone="warn">
                          {t.comp.plan && t.comp.feeWaived
                            ? "comped · 0%"
                            : t.comp.plan
                              ? "comped"
                              : "0% fee"}
                        </StatusPill>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      tone={
                        t.subscriptionStatus === "past_due" ? "warn" : "neutral"
                      }
                    >
                      {t.subscriptionStatus ?? "—"}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.stripeConnected ? "linked" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {t.adminCount === 0 && t.userCount > 0 ? (
                      <StatusPill tone="warn">no admin</StatusPill>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">
                        {t.adminCount} admin · {t.userCount} total
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString("en-CH")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`https://${t.domain ?? `${t.slug}.gwinn.ch`}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${t.name}'s storefront`}
                      className="inline-flex text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
