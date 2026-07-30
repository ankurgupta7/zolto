import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Credits from "./Credits";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  statusData: {
    plan: "free",
    ai: { allowancePerMonth: 5, usedThisMonth: 2 },
    billingConfigured: true,
  } as Record<string, unknown> | undefined,
  historyData: [] as unknown[],
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      billing: {
        getStatus: { invalidate: vi.fn() },
        photoCreditHistory: { invalidate: vi.fn() },
      },
    }),
    billing: {
      getStatus: { useQuery: () => ({ data: mocks.statusData }) },
      photoCreditHistory: { useQuery: () => ({ data: mocks.historyData }) },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.statusData = {
    plan: "free",
    ai: { allowancePerMonth: 5, usedThisMonth: 2 },
    billingConfigured: true,
  };
  mocks.historyData = [];
  window.history.replaceState({}, "", "/admin/account/credits");
});
afterEach(() => cleanup());

describe("Credits (AI usage) page", () => {
  it("shows Free-plan allowance usage and the Pro upgrade pointer", () => {
    render(<Credits />);
    expect(screen.getByText("2 / 5")).toBeTruthy();
    expect(screen.getByText(/Want unmetered AI/)).toBeTruthy();
    // Text AI is explicitly never counted.
    expect(screen.getByText("Not counted")).toBeTruthy();
  });

  it("shows unmetered on Pro, with no upgrade pointer", () => {
    mocks.statusData = {
      plan: "pro",
      ai: { allowancePerMonth: null, usedThisMonth: null },
      billingConfigured: true,
    };
    render(<Credits />);
    expect(screen.getByText("Unmetered")).toBeTruthy();
    expect(screen.queryByText(/Want unmetered AI/)).toBeNull();
  });

  it("never offers credit packs for sale — AI is not sold per query", () => {
    render(<Credits />);
    expect(screen.queryByText(/\+50/)).toBeNull();
    expect(screen.queryByText(/per image/)).toBeNull();
    expect(screen.queryByText(/Buy more credits/)).toBeNull();
  });

  it("labels historical (pre-pivot) ledger entries in the log", () => {
    mocks.historyData = [
      { id: 1, delta: -1, kind: "consumption", createdAt: new Date() },
      { id: 2, delta: 10, kind: "purchase", createdAt: new Date() },
    ];
    render(<Credits />);
    expect(screen.getByText("AI photo generated")).toBeTruthy();
    expect(screen.getByText("Top-up purchase (pre-pivot)")).toBeTruthy();
  });
});
