import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { TRPCClientError } from "@trpc/client";
import Insights from "./Insights";

const summaryFixture = () => ({
  currency: "CHF",
  last30d: {
    totalRevenue: 1234.5,
    onlineOrders: 4,
    posSales: 2,
    totalUnits: 6,
  },
  catalog: { live: 10, sold: 3, total: 13, avgPrice: 95 },
  topSellers: [{ name: "Moonstone Ring", units: 3, revenue: 660 }],
  staleStock: [{ name: "Dusty Brooch", daysLive: 90, price: 45 }],
});

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  summary: {
    data: undefined as Record<string, unknown> | undefined,
    isLoading: false,
  },
  narrative: {
    data: undefined as { narrative: string } | undefined,
    error: null as unknown,
    isFetching: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    insights: {
      summary: { useQuery: () => mocks.summary },
      narrative: { useQuery: () => mocks.narrative },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.summary = { data: summaryFixture(), isLoading: false };
  mocks.narrative = {
    data: undefined,
    error: null,
    isFetching: false,
    refetch: vi.fn(),
  };
});
afterEach(() => cleanup());

describe("Insights page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<Insights />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("shows a loading state while the summary is fetched", () => {
    mocks.summary = { data: undefined, isLoading: true };
    render(<Insights />);
    expect(screen.getByText("Doing the sums…")).toBeTruthy();
  });

  it("renders the 30-day stats, top sellers, and slow movers", () => {
    render(<Insights />);
    expect(screen.getByText("CHF 1'234.50")).toBeTruthy();
    expect(screen.getByText("Revenue (30d)")).toBeTruthy();
    expect(screen.getByText("Live products")).toBeTruthy();
    expect(screen.getByText("Moonstone Ring")).toBeTruthy();
    expect(screen.getByText(/3 sold/)).toBeTruthy();
    expect(screen.getByText("Dusty Brooch")).toBeTruthy();
    expect(screen.getByText(/90d live/)).toBeTruthy();
  });

  it("hides the top-sellers and slow-movers cards when the lists are empty", () => {
    mocks.summary.data = {
      ...summaryFixture(),
      topSellers: [],
      staleStock: [],
    };
    render(<Insights />);
    expect(screen.queryByText("Top sellers (30 days)")).toBeNull();
    expect(screen.queryByText("Slow movers")).toBeNull();
  });

  it("fetches the AI narrative on demand", () => {
    render(<Insights />);
    fireEvent.click(screen.getByText("Generate insights"));
    expect(mocks.narrative.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows the narrative text once it has arrived", () => {
    mocks.narrative.data = { narrative: "Rings are carrying the month." };
    render(<Insights />);
    expect(screen.getByText("Rings are carrying the month.")).toBeTruthy();
    expect(screen.queryByText("Generate insights")).toBeNull();
  });

  it("renders the Pro upsell when the narrative is plan-gated", () => {
    // The server answers FORBIDDEN for non-Pro plans; the page must upsell,
    // not error.
    mocks.narrative.error = new TRPCClientError("FORBIDDEN", {
      result: {
        error: {
          message: "FORBIDDEN",
          code: -32003,
          data: { code: "FORBIDDEN", httpStatus: 403 },
        },
      } as never,
    });
    render(<Insights />);
    expect(screen.getByText("AI insights is a Pro-plan feature")).toBeTruthy();
    expect(screen.getByText("View plans")).toBeTruthy();
    expect(screen.queryByText("Generate insights")).toBeNull();
  });
});
