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
    ai: { allowancePerMonth: 5, usedThisMonth: 2 },
    onlineFees: {
      feePercentLabel: "1%",
      appliesTo: "online and AI-agent orders",
      monthGmvChf: 3200,
      monthAgentGmvChf: 500,
      monthOrderCount: 12,
      monthFeeChf: 32,
    },
    upsell: { breakEvenOnlineChf: 2500, proPriceChf: 25, savingsChf: 7 },
    plans: [
      {
        id: "free",
        name: "Free",
        priceChf: 0,
        onlineFeeBps: 100,
        aiPhotoAllowancePerMonth: 5,
        maxProducts: 200,
        storageGb: 5,
      },
      {
        id: "pro",
        name: "Pro",
        priceChf: 25,
        onlineFeeBps: 0,
        aiPhotoAllowancePerMonth: null,
        maxProducts: 5000,
        storageGb: 50,
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
    // Used by the signed-out state's SignInOptions.
    auth: {
      requestMagicLink: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
        }),
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
  it("shows the current plan and both tiers", () => {
    render(<Billing />);
    expect(screen.getByText("Plan & Billing")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    expect(screen.getByText("CHF 25")).toBeTruthy();
    // Retired tiers stay retired.
    expect(screen.queryByText("Maker")).toBeNull();
    expect(screen.queryByText("Studio")).toBeNull();
    expect(screen.queryByText("Atelier")).toBeNull();
  });

  it("shows this month's online sales, fee, and agent split", () => {
    render(<Billing />);
    expect(screen.getByText("CHF 3,200")).toBeTruthy();
    expect(screen.getByText("CHF 32")).toBeTruthy();
    expect(screen.getByText(/via AI agents/)).toBeTruthy();
    expect(screen.getByText(/never carry a Zolto fee/)).toBeTruthy();
  });

  it("surfaces the skim-vs-Pro upsell once savings go positive", () => {
    render(<Billing />);
    expect(screen.getByText(/You'd save CHF 7 on Pro/)).toBeTruthy();
    fireEvent.click(screen.getByText("Upgrade now"));
    expect(mocks.planCheckoutMutate).toHaveBeenCalledWith({ plan: "pro" });
  });

  it("hides the upsell on Pro and shows unmetered AI", () => {
    const original = mocks.statusData;
    mocks.statusData = {
      ...original,
      plan: "pro",
      ai: { allowancePerMonth: null, usedThisMonth: null },
      upsell: null,
    } as never;
    render(<Billing />);
    expect(screen.queryByText(/You'd save/)).toBeNull();
    expect(screen.getByText("Unmetered")).toBeTruthy();
    mocks.statusData = original;
  });

  it("shows the Free plan's AI allowance usage", () => {
    render(<Billing />);
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText(/of 5 used this month/)).toBeTruthy();
  });

  it("starts a Pro checkout when Upgrade is clicked", () => {
    render(<Billing />);
    const upgrades = screen.getAllByText("Upgrade");
    fireEvent.click(upgrades[0]);
    expect(mocks.planCheckoutMutate).toHaveBeenCalledWith({ plan: "pro" });
  });

  it("renders the AI generation log with signed deltas", () => {
    render(<Billing />);
    expect(screen.getByText("Plan bucket (pre-pivot)")).toBeTruthy();
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

  it("admits the platform owner (superadmin)", () => {
    mocks.authState.user = { role: "superadmin" };
    render(<Billing />);
    expect(screen.queryByText("Admins only.")).toBeNull();
    expect(screen.getByText("Plan & Billing")).toBeTruthy();
  });

  it("offers every sign-in method in place when the session has lapsed", () => {
    mocks.authState.isAuthenticated = false;
    mocks.authState.user = null;
    render(<Billing />);
    // Rendered in place rather than redirected mid-render, and never to a
    // single provider — a merchant without a Google account must be able to
    // get back to their billing page.
    expect(
      screen.getByRole("link", { name: /continue with google/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /continue with apple/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /continue with email/i }),
    ).toBeTruthy();
  });

  it("shows no legacy-price notice for a normally-priced tenant", () => {
    render(<Billing />);
    expect(screen.queryByText(/older plan price/i)).toBeNull();
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
