import { describe, it, expect } from "vitest";
import {
  AGENT_SURFACES,
  KNOWN_AGENTS,
  UNKNOWN_AGENT,
  agentKind,
  classifyAgent,
  dayKey,
  isAgentSurface,
  looksLikeBrowser,
  recentDayKeys,
  summarizeAgentHits,
  surfaceForPath,
  type AgentHitRow,
} from "./aiAgents";

describe("surfaceForPath", () => {
  it("maps every declared surface back from a real request path", () => {
    // The guard that the enum and the route list can't drift: a surface nobody
    // can reach is a column that will read zero forever and nobody will know why.
    const reached = new Set(
      ["/llms.txt", "/llms-full.txt", "/mcp", "/robots.txt", "/sitemap.xml"]
        .map(surfaceForPath)
        .filter((s): s is NonNullable<typeof s> => s !== null),
    );
    for (const surface of AGENT_SURFACES)
      expect(reached.has(surface)).toBe(true);
  });

  it("ignores every other path", () => {
    for (const path of ["/", "/shop", "/api/trpc/products.list", "/mcp-ish"]) {
      expect(surfaceForPath(path)).toBeNull();
    }
  });

  it("tolerates a trailing slash and a query string", () => {
    expect(surfaceForPath("/mcp/")).toBe("mcp");
    expect(surfaceForPath("/llms.txt?ref=x")).toBe("llms.txt");
  });

  it("isAgentSurface accepts declared values and rejects others", () => {
    expect(isAgentSurface("mcp")).toBe(true);
    expect(isAgentSurface("shop")).toBe(false);
  });
});

describe("classifyAgent", () => {
  it("names the agents we know", () => {
    expect(
      classifyAgent(
        "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)",
      ),
    ).toBe("GPTBot");
    expect(classifyAgent("Mozilla/5.0 (compatible; ClaudeBot/1.0)")).toBe(
      "ClaudeBot",
    );
    expect(classifyAgent("PerplexityBot/1.0")).toBe("PerplexityBot");
  });

  it("is case-insensitive — the token is a product name, not a literal", () => {
    expect(classifyAgent("mozilla/5.0 (compatible; gptbot/1.2)")).toBe(
      "GPTBot",
    );
  });

  it("prefers the on-demand fetcher over the vendor's crawler", () => {
    // ChatGPT-User contains no "GPTBot", but Claude-User vs ClaudeBot and the
    // ordering generally is the thing that breaks if someone sorts this list
    // alphabetically: an assistant fetch means a person is asking about the
    // store right now, and filing it as background indexing loses that.
    expect(classifyAgent("Mozilla/5.0 (compatible; ChatGPT-User/1.0)")).toBe(
      "ChatGPT",
    );
    expect(agentKind(classifyAgent("ChatGPT-User/1.0"))).toBe("assistant");
    expect(classifyAgent("Claude-User/1.0")).toBe("Claude");
    expect(agentKind(classifyAgent("Claude-User/1.0"))).toBe("assistant");
    expect(agentKind(classifyAgent("ClaudeBot/1.0"))).toBe("crawler");
  });

  it("falls back to Other for an unnamed or missing caller", () => {
    expect(classifyAgent("curl/8.4.0")).toBe(UNKNOWN_AGENT);
    expect(classifyAgent(undefined)).toBe(UNKNOWN_AGENT);
    expect(classifyAgent("")).toBe(UNKNOWN_AGENT);
  });

  it("treats an unknown label as a crawler rather than throwing", () => {
    expect(agentKind(UNKNOWN_AGENT)).toBe("crawler");
    expect(agentKind("something nobody ships")).toBe("crawler");
  });

  it("has no duplicate labels — each is a chart series and a stored value", () => {
    const labels = KNOWN_AGENTS.map((a) => a.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("looksLikeBrowser", () => {
  it("recognises an ordinary browser", () => {
    expect(
      looksLikeBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      ),
    ).toBe(true);
  });

  it("does not mistake a scripted caller for one", () => {
    expect(looksLikeBrowser("curl/8.4.0")).toBe(false);
    expect(looksLikeBrowser("python-requests/2.31.0")).toBe(false);
    expect(looksLikeBrowser(undefined)).toBe(false);
  });
});

describe("dayKey / recentDayKeys", () => {
  it("keys by UTC date", () => {
    expect(dayKey(new Date("2026-08-14T23:59:59Z"))).toBe("2026-08-14");
    expect(dayKey(new Date("2026-08-15T00:00:01Z"))).toBe("2026-08-15");
  });

  it("returns a contiguous window ending today, oldest first", () => {
    const keys = recentDayKeys(3, new Date("2026-08-14T12:00:00Z"));
    expect(keys).toEqual(["2026-08-12", "2026-08-13", "2026-08-14"]);
  });
});

describe("summarizeAgentHits", () => {
  const now = new Date("2026-08-14T12:00:00Z");
  const rows: AgentHitRow[] = [
    // Counts are deliberately unequal: a tie would let a stable sort pass the
    // ranking assertions below without ever ordering anything.
    {
      tenantId: 7,
      day: "2026-08-13",
      surface: "llms.txt",
      mcpTool: "",
      agent: "GPTBot",
      count: 2,
    },
    {
      tenantId: 7,
      day: "2026-08-14",
      surface: "llms.txt",
      mcpTool: "",
      agent: "GPTBot",
      count: 2,
    },
    {
      tenantId: 7,
      day: "2026-08-14",
      surface: "mcp",
      mcpTool: "search_products",
      agent: "Claude",
      count: 5,
    },
    {
      tenantId: 7,
      day: "2026-08-14",
      surface: "mcp",
      mcpTool: "create_checkout",
      agent: "Claude",
      count: 1,
    },
  ];

  it("totals every row it is given", () => {
    expect(summarizeAgentHits(rows, 3, now).total).toBe(10);
  });

  it("emits one bar per day in the window, zero-filled", () => {
    const { byDay } = summarizeAgentHits(rows, 3, now);
    expect(byDay).toEqual([
      { day: "2026-08-12", count: 0 },
      { day: "2026-08-13", count: 2 },
      { day: "2026-08-14", count: 8 },
    ]);
  });

  it("drops a row outside the window from the chart but not the total", () => {
    // A caller may hand over a wider row set than it asks to chart. The bars
    // must line up with the axis it asked for rather than growing a stray one.
    const summary = summarizeAgentHits(rows, 1, now);
    expect(summary.byDay).toEqual([{ day: "2026-08-14", count: 8 }]);
    expect(summary.total).toBe(10);
  });

  it("ranks agents and surfaces by volume", () => {
    const { byAgent, bySurface } = summarizeAgentHits(rows, 3, now);
    expect(byAgent).toEqual([
      { agent: "Claude", kind: "assistant", count: 6 },
      { agent: "GPTBot", kind: "crawler", count: 4 },
    ]);
    expect(bySurface).toEqual([
      { surface: "mcp", count: 6 },
      { surface: "llms.txt", count: 4 },
    ]);
  });

  it("lists only real MCP tools, never the empty sentinel", () => {
    const { byTool } = summarizeAgentHits(rows, 3, now);
    expect(byTool).toEqual([
      { tool: "search_products", count: 5 },
      { tool: "create_checkout", count: 1 },
    ]);
  });

  it("counts assistant traffic separately from crawling", () => {
    // The number that means "a person is asking about this store", as opposed
    // to "a model is indexing it" — the two deserve different reactions.
    expect(summarizeAgentHits(rows, 3, now).assistantHits).toBe(6);
  });

  it("handles an empty row set without inventing days", () => {
    const summary = summarizeAgentHits([], 2, now);
    expect(summary.total).toBe(0);
    expect(summary.byDay).toEqual([
      { day: "2026-08-13", count: 0 },
      { day: "2026-08-14", count: 0 },
    ]);
    expect(summary.byAgent).toEqual([]);
  });
});
