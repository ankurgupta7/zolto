/**
 * InsightsCard — sales & inventory stats on /admin (all plans) plus the
 * Studio+ AI narrative ("advanced analytics" from the pricing page).
 * The narrative is opt-in per click (it costs an LLM call); on a lower plan
 * the server error surfaces as an upgrade hint.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useCurrency, formatPrice } from "@/lib/money";
import { BarChart3, Loader2, Sparkles } from "lucide-react";

export default function InsightsCard() {
  const currency = useCurrency();
  const [narrativeRequested, setNarrativeRequested] = useState(false);

  const summary = trpc.insights.summary.useQuery();
  const narrative = trpc.insights.narrative.useQuery(undefined, {
    enabled: narrativeRequested,
    retry: false,
  });

  const data = summary.data;
  if (summary.isLoading || !data) return null;

  const money = (v: number) => formatPrice(v, currency);

  const stats: Array<[string, string]> = [
    ["Revenue (30d)", money(data.last30d.totalRevenue)],
    ["Online orders", String(data.last30d.onlineOrders)],
    ["Market sales", String(data.last30d.posSales)],
    ["Live products", `${data.catalog.live} of ${data.catalog.total}`],
    ["Sold (all time)", String(data.catalog.sold)],
    ["Avg. price", money(data.catalog.avgPrice)],
  ];

  return (
    <section className="border border-[var(--brand-border)] bg-white mb-10">
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--brand-border)]">
        <h2 className="font-serif text-lg text-[var(--brand-text)] flex items-center gap-2">
          <BarChart3 size={18} className="text-[var(--brand-accent)]" />
          Insights
        </h2>
        {!narrativeRequested && (
          <button
            type="button"
            onClick={() => setNarrativeRequested(true)}
            className="flex items-center gap-1.5 text-xs font-sans uppercase tracking-[0.1em] text-[var(--brand-accent)] hover:underline"
          >
            <Sparkles size={12} /> AI analysis
          </button>
        )}
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-[var(--brand-border)]">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-white px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--brand-muted-2)]">
              {label}
            </p>
            <p className="mt-0.5 font-serif text-lg text-[var(--brand-text)]">
              {value}
            </p>
          </div>
        ))}
      </div>

      {(data.topSellers.length > 0 || data.staleStock.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-4 px-5 py-4 border-t border-[var(--brand-border)]">
          {data.topSellers.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--brand-muted-2)] mb-1.5">
                Top sellers (30d)
              </p>
              <ul className="text-sm space-y-1">
                {data.topSellers.map((t) => (
                  <li key={t.name}>
                    {t.name} · {t.units} sold · {money(t.revenue)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data.staleStock.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--brand-muted-2)] mb-1.5">
                Slow movers (90+ days live)
              </p>
              <ul className="text-sm space-y-1">
                {data.staleStock.map((s) => (
                  <li key={s.name}>
                    {s.name} · {s.daysLive}d · {money(s.price)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {narrativeRequested && (
        <div className="border-t border-[var(--brand-border)] px-5 py-4">
          {narrative.isLoading && (
            <Loader2
              size={16}
              className="animate-spin text-[var(--brand-muted-2)]"
            />
          )}
          {narrative.error && (
            <p className="text-sm text-[var(--brand-muted-2)]">
              {narrative.error.message.includes("Studio plan")
                ? "AI analysis is part of the Studio plan — upgrade in Plan & Billing."
                : narrative.error.message}
            </p>
          )}
          {narrative.data && (
            <div className="text-sm whitespace-pre-wrap text-[var(--brand-text)]">
              {narrative.data.narrative}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
