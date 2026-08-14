/**
 * Who is reading the machine-facing surfaces, and what they asked for.
 *
 * Zolto publishes three things no human ever looks at: `/llms.txt`, its
 * long-form companion, and the MCP endpoint (server/llms.ts, server/mcp.ts).
 * They exist because the pricing thesis is that an AI agent can discover a
 * store and buy from it — and until now nothing recorded whether a single agent
 * ever did. `orders.channel = 'agent'` counts the ones that *bought*; this
 * module is the other half, the reach that precedes the sale.
 *
 * Client-side analytics cannot see any of it. An agent fetching `/llms.txt`
 * never loads the SPA and never runs JavaScript, so a page-view script — Umami
 * or anything else — reports zero for the exact traffic this file is about.
 *
 * Pure data and pure functions: the middleware that records hits, the tRPC
 * routes that read them and the admin panel that draws them all share these
 * definitions, and none of them needs a database or a browser.
 */

// ─── Surfaces ─────────────────────────────────────────────────────────────────

/**
 * The machine-readable surfaces worth counting. Deliberately a closed list
 * rather than "every path an agent touched": the question is whether the
 * agent-commerce funnel works, and these are its steps. Storefront HTML pages
 * are measured on the human side instead.
 */
export const AGENT_SURFACES = [
  "llms.txt",
  "llms-full.txt",
  "mcp",
  "robots.txt",
  "sitemap.xml",
] as const;

export type AgentSurface = (typeof AGENT_SURFACES)[number];

export function isAgentSurface(value: string): value is AgentSurface {
  return (AGENT_SURFACES as readonly string[]).includes(value);
}

/**
 * Map a request path to the surface it hits, or null for everything else.
 *
 * Kept here rather than in the middleware so the route list and the enum can
 * never drift: adding a surface means adding it in one place, and the test
 * suite checks every entry in {@link AGENT_SURFACES} is reachable from a path.
 */
export function surfaceForPath(path: string): AgentSurface | null {
  // Normalise a trailing slash and any query string the caller left on.
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  switch (clean) {
    case "/llms.txt":
      return "llms.txt";
    case "/llms-full.txt":
      return "llms-full.txt";
    case "/mcp":
      return "mcp";
    case "/robots.txt":
      return "robots.txt";
    case "/sitemap.xml":
      return "sitemap.xml";
    default:
      return null;
  }
}

// ─── Agents ───────────────────────────────────────────────────────────────────

/**
 * The label used for a caller we don't recognise. Not a failure case: plenty of
 * legitimate agent traffic comes from a bespoke script with no advertised
 * User-Agent, and lumping it in with the named crawlers would be a lie. Worth
 * watching as a share of the total — if it dominates, this table needs entries.
 */
export const UNKNOWN_AGENT = "Other";

/**
 * What a named agent is actually doing, which changes what the number means to
 * a merchant:
 *  - "crawler": indexing for a model or a search product. Reach, not intent.
 *  - "assistant": fetching on behalf of a person asking a question right now.
 *    This is the one that converts, and the one worth a merchant's attention.
 */
export type AgentKind = "crawler" | "assistant";

export interface KnownAgent {
  /** Display label, and the value stored in `agent_hits.agent`. */
  label: string;
  kind: AgentKind;
  /**
   * Case-insensitive substring matched against the User-Agent. Substring rather
   * than a regex because these tokens are stable product identifiers and the
   * surrounding version/URL noise is not.
   */
  token: string;
}

/**
 * Ordered most specific first: several vendors ship a crawler and an
 * on-demand fetcher whose tokens share a prefix (`ChatGPT-User` vs `GPTBot`,
 * `Claude-User` vs `ClaudeBot`), and matching the assistant before the crawler
 * is what keeps "someone is asking about this store right now" from being
 * filed as background indexing.
 */
export const KNOWN_AGENTS: readonly KnownAgent[] = [
  // OpenAI
  { label: "ChatGPT", kind: "assistant", token: "ChatGPT-User" },
  { label: "OpenAI Search", kind: "crawler", token: "OAI-SearchBot" },
  { label: "GPTBot", kind: "crawler", token: "GPTBot" },
  // Anthropic
  { label: "Claude", kind: "assistant", token: "Claude-User" },
  { label: "Claude Search", kind: "crawler", token: "Claude-SearchBot" },
  { label: "ClaudeBot", kind: "crawler", token: "ClaudeBot" },
  // Perplexity
  { label: "Perplexity", kind: "assistant", token: "Perplexity-User" },
  { label: "PerplexityBot", kind: "crawler", token: "PerplexityBot" },
  // Everyone else
  { label: "Gemini", kind: "assistant", token: "Google-CloudVertexBot" },
  { label: "Google AI", kind: "crawler", token: "Google-Extended" },
  { label: "Apple Intelligence", kind: "crawler", token: "Applebot-Extended" },
  { label: "DuckAssist", kind: "assistant", token: "DuckAssistBot" },
  { label: "Mistral", kind: "assistant", token: "MistralAI-User" },
  { label: "Meta AI", kind: "crawler", token: "meta-externalagent" },
  { label: "Amazon", kind: "crawler", token: "Amazonbot" },
  { label: "ByteDance", kind: "crawler", token: "Bytespider" },
  { label: "Common Crawl", kind: "crawler", token: "CCBot" },
] as const;

/**
 * Classify a User-Agent header into one of {@link KNOWN_AGENTS} or
 * {@link UNKNOWN_AGENT}.
 *
 * A User-Agent is self-declared and trivially forged, which is fine for what
 * this is used for — a merchant asking "is anything reading my shop?" — and
 * would not be fine for anything that gated access or spent money. Nothing
 * here does either.
 */
export function classifyAgent(userAgent: string | undefined | null): string {
  if (!userAgent) return UNKNOWN_AGENT;
  const haystack = userAgent.toLowerCase();
  for (const agent of KNOWN_AGENTS) {
    if (haystack.includes(agent.token.toLowerCase())) return agent.label;
  }
  return UNKNOWN_AGENT;
}

/** The kind of a label produced by {@link classifyAgent}. Unknown counts as a crawler. */
export function agentKind(label: string): AgentKind {
  return KNOWN_AGENTS.find((a) => a.label === label)?.kind ?? "crawler";
}

/**
 * Is this User-Agent a browser rather than an agent? Used to keep the human
 * side out of the agent table: `/robots.txt` and `/sitemap.xml` get plenty of
 * ordinary search-engine and browser traffic, and counting a curious shopper
 * who typed the URL as agent reach would inflate the one number this exists to
 * report honestly.
 */
export function looksLikeBrowser(
  userAgent: string | undefined | null,
): boolean {
  if (!userAgent) return false;
  // Every AI agent above either omits "Mozilla/5.0" or carries its own token,
  // which classifyAgent has already had first refusal on — so this only sees
  // callers we could not name.
  return /Mozilla\/5\.0.*(Gecko|AppleWebKit|Chrome|Safari|Firefox)/i.test(
    userAgent,
  );
}

// ─── Buckets ──────────────────────────────────────────────────────────────────

/**
 * A day key in UTC (`YYYY-MM-DD`). Hits are pre-aggregated per day rather than
 * logged per request: `/mcp` is a hot path an agent can loop on, and an
 * unbounded insert log on it is a disk-fill waiting to happen. One row per
 * (day, surface, tool, agent, store) answers every question the admin panel
 * asks and costs one upsert.
 *
 * UTC rather than the store's timezone so the key is stable regardless of which
 * instance writes it; the admin panel renders dates, not timestamps.
 */
export function dayKey(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** The `day` keys covering the last `days` days, oldest first, including today. */
export function recentDayKeys(days: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
  }
  return keys;
}

/**
 * The identity of one counter row. `tenantId: 0` and `mcpTool: ""` are the
 * platform-surface and not-an-MCP-call cases — see the schema comment on
 * `agent_hits` for why those are sentinels rather than NULL.
 */
export interface AgentHitBucket {
  tenantId: number;
  day: string;
  surface: AgentSurface;
  mcpTool: string;
  agent: string;
}

/** Rows as the tRPC routes return them and the admin panel consumes them. */
export interface AgentHitRow extends AgentHitBucket {
  count: number;
}

/**
 * Fold rows into the shape the admin panel draws: a per-day total for the
 * chart, a per-agent breakdown, and the MCP tools that were actually called.
 *
 * Pure, so the panel's numbers are testable without a database or a render.
 */
export function summarizeAgentHits(
  rows: readonly AgentHitRow[],
  days: number,
  now: Date = new Date(),
): {
  total: number;
  byDay: Array<{ day: string; count: number }>;
  byAgent: Array<{ agent: string; kind: AgentKind; count: number }>;
  bySurface: Array<{ surface: AgentSurface; count: number }>;
  byTool: Array<{ tool: string; count: number }>;
  assistantHits: number;
} {
  const sum = (map: Map<string, number>, key: string, n: number) =>
    map.set(key, (map.get(key) ?? 0) + n);

  const dayTotals = new Map<string, number>();
  for (const key of recentDayKeys(days, now)) dayTotals.set(key, 0);
  const agents = new Map<string, number>();
  const surfaces = new Map<string, number>();
  const tools = new Map<string, number>();
  let total = 0;
  let assistantHits = 0;

  for (const row of rows) {
    total += row.count;
    // A row outside the requested window is ignored rather than appended, so a
    // caller passing a wider row set than `days` still gets a chart whose bars
    // line up with its axis.
    if (dayTotals.has(row.day)) sum(dayTotals, row.day, row.count);
    sum(agents, row.agent, row.count);
    sum(surfaces, row.surface, row.count);
    if (row.mcpTool) sum(tools, row.mcpTool, row.count);
    if (agentKind(row.agent) === "assistant") assistantHits += row.count;
  }

  const descending = (a: { count: number }, b: { count: number }) =>
    b.count - a.count;

  return {
    total,
    // Array.from rather than spread: the project's TS target predates
    // downlevel iteration, so `[...map.entries()]` does not compile.
    byDay: Array.from(dayTotals.entries()).map(([day, count]) => ({
      day,
      count,
    })),
    byAgent: Array.from(agents.entries())
      .map(([agent, count]) => ({ agent, kind: agentKind(agent), count }))
      .sort(descending),
    bySurface: Array.from(surfaces.entries())
      .map(([surface, count]) => ({ surface: surface as AgentSurface, count }))
      .sort(descending),
    byTool: Array.from(tools.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort(descending),
    assistantHits,
  };
}
