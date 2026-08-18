/**
 * AgentTrafficCard — "is anything out there reading my shop?"
 *
 * The reach half of the agent-commerce funnel, read from `agent_hits`
 * (server/agentHits.ts). Its sale half is already on this page as online
 * orders, since an MCP purchase lands as `orders.channel = 'agent'`.
 *
 * Two deliberate choices about how the numbers are shown:
 *
 *  - **Assistant fetches are called out separately from crawling.** They mean
 *    different things and deserve different reactions: a crawler indexing the
 *    catalogue is reach, while an assistant fetch means a person was asking
 *    something and an AI went and read this shop to answer them. Summed into
 *    one "AI visits" figure, neither is interpretable.
 *  - **Zero is a real answer, rendered as one.** A merchant whose shop no agent
 *    has found yet gets told that plainly, along with the fact that the
 *    surfaces are live and waiting — not an empty chart implying breakage.
 */
import { useTranslation } from "react-i18next";
import { Bot, Wrench } from "lucide-react";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { trpc } from "@/lib/trpc";
import { SettingsCard } from "@/components/admin/ui";

/** How far back the panel looks. Matches the rest of the Insights page. */
const WINDOW_DAYS = 30;

/** "2026-08-14" → "14 Aug", in the reader's language. */
function shortDay(day: string, locale: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return day;
  return parsed.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default function AgentTrafficCard() {
  const { t, i18n } = useTranslation("admin");
  const traffic = trpc.insights.agentTraffic.useQuery(
    { days: WINDOW_DAYS },
    { retry: false },
  );

  const data = traffic.data;
  // Rendering nothing while loading rather than a skeleton: this sits below the
  // numbers a merchant actually came for, and a box that resizes under them as
  // a secondary query lands is worse than one that appears.
  if (traffic.isLoading || !data) return null;

  const locale = i18n.language;
  const chart = data.byDay.map((d) => ({
    day: shortDay(d.day, locale),
    count: d.count,
  }));

  const stats: Array<{ label: string; value: string }> = [
    {
      label: t("ops.agents.statReads"),
      value: String(data.total),
    },
    {
      label: t("ops.agents.statAssistants"),
      value: String(data.assistantHits),
    },
    {
      label: t("ops.agents.statToolCalls"),
      value: String(data.byTool.reduce((sum, tool) => sum + tool.count, 0)),
    },
  ];

  return (
    <SettingsCard
      title={t("ops.agents.title")}
      description={t("ops.agents.description")}
    >
      {data.total === 0 ? (
        <div className="flex items-start gap-3 text-sm text-muted-foreground">
          <Bot className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("ops.agents.empty")}</p>
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-3 gap-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                {/* lining-nums, not just tabular: the brand serif defaults to
                    oldstyle figures, which renders a count of 100 with two
                    descending zeros. */}
                <p className="text-2xl font-semibold lining-nums tabular-nums text-foreground">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <div className="mb-5 h-32 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chart}
                margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
              >
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  // 30 bars will not fit 30 labels on a phone; every fifth
                  // keeps the axis readable at any width.
                  interval={4}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  width={28}
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  cursor={{ opacity: 0.1 }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar
                  dataKey="count"
                  name={t("ops.agents.chartSeries")}
                  fill="currentColor"
                  className="text-emerald-500"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                {t("ops.agents.byAgentTitle")}
              </p>
              <ul className="divide-y">
                {data.byAgent.map((row) => (
                  <li
                    key={row.agent}
                    className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="flex items-center gap-2 text-foreground">
                      <Bot
                        className={
                          row.kind === "assistant"
                            ? "h-4 w-4 text-emerald-500"
                            : "h-4 w-4 text-muted-foreground"
                        }
                      />
                      {row.agent}
                      <span className="text-xs text-muted-foreground">
                        {row.kind === "assistant"
                          ? t("ops.agents.kindAssistant")
                          : t("ops.agents.kindCrawler")}
                      </span>
                    </span>
                    <span className="lining-nums tabular-nums text-muted-foreground">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {data.byTool.length > 0 && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  {t("ops.agents.byToolTitle")}
                </p>
                <ul className="divide-y">
                  {data.byTool.map((row) => (
                    <li
                      key={row.tool}
                      className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0"
                    >
                      <span className="flex items-center gap-2 font-mono text-xs text-foreground">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        {row.tool}
                      </span>
                      <span className="lining-nums tabular-nums text-muted-foreground">
                        {row.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </SettingsCard>
  );
}
