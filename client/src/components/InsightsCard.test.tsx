import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import InsightsCard from "./InsightsCard";

const mocks = vi.hoisted(() => ({
  summaryData: {
    last30d: { totalRevenue: 850, onlineOrders: 12, posSales: 4 },
    catalog: { live: 18, total: 25, sold: 40, avgPrice: 95 },
    topSellers: [{ name: "Silver Ring", units: 5, revenue: 250 }],
    staleStock: [{ name: "Opal Brooch", daysLive: 120, price: 180 }],
  } as Record<string, unknown> | undefined,
  summaryLoading: false,
  narrativeState: {
    isLoading: false,
    data: undefined as { narrative: string } | undefined,
    error: null as { message: string } | null,
  },
  narrativeEnabled: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    insights: {
      summary: {
        useQuery: () => ({
          data: mocks.summaryData,
          isLoading: mocks.summaryLoading,
        }),
      },
      narrative: {
        useQuery: (_input: undefined, opts?: { enabled?: boolean }) => {
          mocks.narrativeEnabled = Boolean(opts?.enabled);
          return opts?.enabled
            ? mocks.narrativeState
            : { isLoading: false, data: undefined, error: null };
        },
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.summaryLoading = false;
  mocks.narrativeEnabled = false;
  mocks.narrativeState = { isLoading: false, data: undefined, error: null };
});
afterEach(() => cleanup());

describe("InsightsCard", () => {
  it("renders nothing while the summary loads", () => {
    mocks.summaryLoading = true;
    const original = mocks.summaryData;
    mocks.summaryData = undefined;
    const { container } = render(<InsightsCard />);
    expect(container.firstChild).toBeNull();
    mocks.summaryData = original;
  });

  it("shows the stat grid with formatted money", () => {
    render(<InsightsCard />);
    expect(screen.getByText("Revenue (30d)")).toBeTruthy();
    expect(screen.getByText("CHF 850.00")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("18 of 25")).toBeTruthy();
    expect(screen.getByText("40")).toBeTruthy();
    expect(screen.getByText("CHF 95.00")).toBeTruthy();
  });

  it("lists top sellers and slow movers", () => {
    render(<InsightsCard />);
    expect(screen.getByText(/Silver Ring · 5 sold/)).toBeTruthy();
    expect(screen.getByText(/Opal Brooch · 120d/)).toBeTruthy();
  });

  it("only fetches the AI narrative after the button is clicked", () => {
    mocks.narrativeState.data = { narrative: "Sales are up 20%." };
    render(<InsightsCard />);
    expect(mocks.narrativeEnabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /ai analysis/i }));
    expect(mocks.narrativeEnabled).toBe(true);
    expect(screen.getByText("Sales are up 20%.")).toBeTruthy();
    // The trigger disappears once requested.
    expect(screen.queryByRole("button", { name: /ai analysis/i })).toBeNull();
  });

  it("translates the Studio-plan error into an upgrade hint", () => {
    mocks.narrativeState.error = {
      message: "AI narrative requires the Studio plan",
    };
    render(<InsightsCard />);
    fireEvent.click(screen.getByRole("button", { name: /ai analysis/i }));
    expect(
      screen.getByText(/part of the Studio plan — upgrade in Plan & Billing/),
    ).toBeTruthy();
  });

  it("shows other narrative errors verbatim", () => {
    mocks.narrativeState.error = { message: "LLM temporarily unavailable" };
    render(<InsightsCard />);
    fireEvent.click(screen.getByRole("button", { name: /ai analysis/i }));
    expect(screen.getByText("LLM temporarily unavailable")).toBeTruthy();
  });
});
