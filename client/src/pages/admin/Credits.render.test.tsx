import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import Credits from "./Credits";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  statusData: {
    photoCredits: {
      balance: 7,
      monthlyBucket: 10,
      priceChf: 1,
      unit: "per image",
    },
    billingConfigured: true,
  } as Record<string, unknown> | undefined,
  historyData: [] as unknown[],
  purchase: vi.fn(),
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
      purchasePhotoCredits: {
        useMutation: () => ({ mutate: mocks.purchase, isPending: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.statusData = {
    photoCredits: { balance: 7, monthlyBucket: 10, priceChf: 1, unit: "per image" },
    billingConfigured: true,
  };
  window.history.replaceState({}, "", "/admin/account/credits");
});
afterEach(() => cleanup());

describe("Credits page", () => {
  it("shows the balance and monthly grant", () => {
    render(<Credits />);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("starts a top-up checkout when a pack is clicked", () => {
    render(<Credits />);
    fireEvent.click(screen.getByText("+50"));
    expect(mocks.purchase).toHaveBeenCalledWith({ quantity: 50 });
  });

  it("hides top-up packs when billing isn't configured", () => {
    mocks.statusData = {
      photoCredits: { balance: 0, monthlyBucket: 0, priceChf: 1, unit: "per image" },
      billingConfigured: false,
    };
    render(<Credits />);
    expect(screen.queryByText("+50")).toBeNull();
    expect(screen.getByText(/aren't purchasable/)).toBeTruthy();
  });
});
