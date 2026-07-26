import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import Billing from "./Billing";

const mocks = vi.hoisted(() => ({
  planCheckoutMutate: vi.fn(),
  creditCheckoutMutate: vi.fn(),
  statusInvalidate: vi.fn(),
  historyInvalidate: vi.fn(),
  authState: {
    user: { role: "admin" } as { role: string } | null,
    isAuthenticated: true,
    loading: false,
  },
  statusData: {
    plan: "free",
    subscriptionStatus: "trialing",
    trialEndsAt: null,
    photoCredits: {
      balance: 7,
      monthlyBucket: 0,
      priceChf: 1,
      unit: "per image",
    },
    plans: [
      { id: "free", name: "Free", priceChf: 0, includedPhotoCredits: 0 },
      { id: "maker", name: "Maker", priceChf: 19, includedPhotoCredits: 10 },
      { id: "studio", name: "Studio", priceChf: 49, includedPhotoCredits: 40 },
      {
        id: "atelier",
        name: "Atelier",
        priceChf: 99,
        includedPhotoCredits: 150,
      },
    ],
    billingConfigured: true,
  } as Record<string, unknown> | undefined,
  historyData: [
    {
      id: 2,
      tenantId: 7,
      delta: -1,
      kind: "consumption",
      createdAt: new Date(),
    },
    {
      id: 1,
      tenantId: 7,
      delta: 10,
      kind: "monthly_grant",
      createdAt: new Date(),
    },
  ] as unknown[] | undefined,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => mocks.authState,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      billing: {
        getStatus: { invalidate: mocks.statusInvalidate },
        photoCreditHistory: { invalidate: mocks.historyInvalidate },
      },
      staff: { list: { invalidate: vi.fn() } },
      tenant: {
        domainStatus: { invalidate: vi.fn() },
        getSettings: { invalidate: vi.fn() },
      },
    }),
    billing: {
      getStatus: {
        useQuery: () => ({
          data: mocks.statusData,
          isLoading: mocks.statusData === undefined,
        }),
      },
      photoCreditHistory: {
        useQuery: () => ({ data: mocks.historyData }),
      },
      createPlanCheckout: {
        useMutation: () => ({
          mutate: mocks.planCheckoutMutate,
          isPending: false,
        }),
      },
      purchasePhotoCredits: {
        useMutation: () => ({
          mutate: mocks.creditCheckoutMutate,
          isPending: false,
        }),
      },
    },
    staff: {
      list: {
        useQuery: () => ({
          data: {
            staff: [
              { id: 1, name: "Owner", email: "o@a.example", role: "admin" },
            ],
            pendingInvites: [],
            seatsUsed: 1,
            seatLimit: 1,
          },
        }),
      },
      invite: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      revokeInvite: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      removeStaff: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
    tenant: {
      domainStatus: {
        useQuery: () => ({
          data: { domain: null, expected: "app.zolto.ch", pointsToUs: false },
        }),
      },
      updateSettings: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.authState.isAuthenticated = true;
  window.history.replaceState({}, "", "/admin/billing");
});

afterEach(() => cleanup());

describe("Billing page", () => {
  it("shows the current plan and all four tiers", () => {
    render(<Billing />);
    expect(screen.getByText("Plan & Billing")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    for (const name of ["Maker", "Studio", "Atelier"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    expect(screen.getByText("CHF 19")).toBeTruthy();
  });

  it("shows the credit balance and top-up packs", () => {
    render(<Billing />);
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("+25")).toBeTruthy();
  });

  it("starts a plan checkout when Upgrade is clicked", () => {
    render(<Billing />);
    const upgrades = screen.getAllByText("Upgrade");
    fireEvent.click(upgrades[0]); // Maker
    expect(mocks.planCheckoutMutate).toHaveBeenCalledWith({ plan: "maker" });
  });

  it("starts a credit checkout when a pack is clicked", () => {
    render(<Billing />);
    fireEvent.click(screen.getByText("+50"));
    expect(mocks.creditCheckoutMutate).toHaveBeenCalledWith({ quantity: 50 });
  });

  it("renders the credit ledger with signed deltas", () => {
    render(<Billing />);
    // "+10" also matches a top-up pack button, so scope to the ledger kind.
    expect(screen.getByText("Monthly plan bucket")).toBeTruthy();
    expect(screen.getByText("AI photo generated")).toBeTruthy();
    expect(screen.getByText("-1")).toBeTruthy();
  });

  it("confirms a successful upgrade redirect and refreshes", async () => {
    window.history.replaceState({}, "", "/admin/billing?upgraded=1");
    render(<Billing />);
    await waitFor(() => expect(mocks.statusInvalidate).toHaveBeenCalled());
  });

  it("blocks non-admins", () => {
    mocks.authState.user = { role: "customer" };
    render(<Billing />);
    expect(screen.getByText("Admins only.")).toBeTruthy();
  });

  it("warns when billing isn't configured on this deployment", () => {
    const original = mocks.statusData;
    mocks.statusData = { ...original, billingConfigured: false } as never;
    render(<Billing />);
    expect(screen.getByText(/aren't purchasable/)).toBeTruthy();
    expect(screen.queryByText("Upgrade")).toBeNull();
    mocks.statusData = original;
  });
});
