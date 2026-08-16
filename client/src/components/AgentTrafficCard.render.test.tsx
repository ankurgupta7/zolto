import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import AgentTrafficCard from "./AgentTrafficCard";

const mocks = vi.hoisted(() => ({
  traffic: {
    data: undefined as Record<string, unknown> | undefined,
    isLoading: false,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    insights: { agentTraffic: { useQuery: () => mocks.traffic } },
  },
}));

// Recharts measures its container, which jsdom reports as 0x0 — the chart
// renders nothing there. Everything asserted below is outside it on purpose:
// a chart nobody can assert on is exactly why CLAUDE.md asks for a screenshot.
const withData = (over: Record<string, unknown> = {}) => ({
  days: 30,
  total: 12,
  assistantHits: 5,
  byDay: [
    { day: "2026-08-13", count: 4 },
    { day: "2026-08-14", count: 8 },
  ],
  byAgent: [
    { agent: "GPTBot", kind: "crawler", count: 7 },
    { agent: "Claude", kind: "assistant", count: 5 },
  ],
  bySurface: [{ surface: "llms.txt", count: 7 }],
  byTool: [
    { tool: "search_products", count: 4 },
    { tool: "create_checkout", count: 3 },
  ],
  ...over,
});

/**
 * Read a stat tile by its label. Asserting on a bare number would be ambiguous
 * — the same figure legitimately appears as a tile, as an agent's count and as
 * a tool's count — and would pass or fail for the wrong reason.
 */
function statValue(label: string): string | null {
  return screen.getByText(label).previousElementSibling?.textContent ?? null;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.traffic = { data: withData(), isLoading: false };
});
afterEach(() => cleanup());

describe("AgentTrafficCard", () => {
  it("renders nothing while the query is in flight", () => {
    // It sits below the numbers the merchant came for; a box that appears and
    // resizes under them mid-read is worse than one that simply arrives.
    mocks.traffic = { data: undefined, isLoading: true };
    const { container } = render(<AgentTrafficCard />);
    expect(container.textContent).toBe("");
  });

  it("shows total reads and assistant fetches as separate figures", () => {
    // Summed into one "AI visits" number neither is interpretable: indexing
    // and someone-is-asking-right-now call for different reactions.
    render(<AgentTrafficCard />);
    expect(statValue("Reads (30d)")).toBe("12");
    expect(statValue("Assistant fetches")).toBe("5");
  });

  it("counts tool calls across every tool, not just the top one", () => {
    render(<AgentTrafficCard />);
    // 4 + 3. Showing only the leading tool would under-report shop queries.
    expect(statValue("Shop queries")).toBe("7");
  });

  it("names each agent and whether it was answering someone or indexing", () => {
    // The distinction the panel exists to draw: an assistant fetch means a
    // person asked something, a crawler means background indexing.
    render(<AgentTrafficCard />);
    expect(screen.getByText("GPTBot")).toBeTruthy();
    expect(screen.getByText("Claude")).toBeTruthy();
    expect(screen.getByText("answering someone")).toBeTruthy();
    expect(screen.getByText("indexing")).toBeTruthy();
  });

  it("lists the MCP tools the agents actually called", () => {
    render(<AgentTrafficCard />);
    expect(screen.getByText("search_products")).toBeTruthy();
    expect(screen.getByText("create_checkout")).toBeTruthy();
  });

  it("says plainly when nothing has read the shop, rather than drawing an empty chart", () => {
    // Zero is a real answer. An empty chart reads as breakage.
    mocks.traffic = {
      data: withData({
        total: 0,
        assistantHits: 0,
        byAgent: [],
        byTool: [],
        bySurface: [],
        byDay: [],
      }),
      isLoading: false,
    };
    render(<AgentTrafficCard />);
    expect(screen.getByText(/No AI agent has read your shop yet/)).toBeTruthy();
    expect(screen.getByText(/live and waiting/)).toBeTruthy();
  });

  it("omits the tools column when no tool was called", () => {
    mocks.traffic = { data: withData({ byTool: [] }), isLoading: false };
    render(<AgentTrafficCard />);
    expect(screen.queryByText("What they asked for")).toBeNull();
  });

  it("uses lining figures for every count", () => {
    // The brand serif defaults to oldstyle numerals, which renders a count of
    // 100 with two descending zeros — CLAUDE.md has caught this before.
    const { container } = render(<AgentTrafficCard />);
    const numeric = Array.from(container.querySelectorAll(".tabular-nums"));
    expect(numeric.length).toBeGreaterThan(0);
    for (const el of numeric) {
      expect(el.className).toContain("lining-nums");
    }
  });
});
