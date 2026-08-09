import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import i18n from "@/lib/i18n";
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
    comp: null,
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
      feeBps: 100,
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

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.authState.isAuthenticated = true;
  window.history.replaceState({}, "", "/admin/billing");
  await i18n.changeLanguage("en");
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
    // Money follows the UI language's Swiss locale (en → en-CH), so thousands
    // group with an apostrophe rather than the US comma.
    expect(screen.getByText("CHF 3'200")).toBeTruthy();
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

// Every line of copy here is one `admin`-namespace lookup away from a raw key,
// so pin that the account fragment resolves in a non-default language rather
// than falling back to English (or rendering "catalog.account.billing.…").
// A store the platform owner has put on the house. Without this the page
// shows Pro with no subscription behind it, which reads as a billing fault —
// and offers to sell the merchant the plan they were given.
describe("Billing page — a comped store", () => {
  const compedPro = () =>
    ({
      ...mocks.statusData,
      plan: "pro",
      comp: { plan: "pro", planComped: true, feeWaived: true },
      subscriptionStatus: null,
      ai: { allowancePerMonth: null, usedThisMonth: null },
      upsell: null,
      onlineFees: {
        ...(mocks.statusData as { onlineFees: Record<string, unknown> })
          .onlineFees,
        monthFeeChf: 0,
        feeBps: 0,
      },
    }) as never;

  it("says the plan is a gift rather than a subscription", () => {
    const original = mocks.statusData;
    mocks.statusData = compedPro();
    render(<Billing />);
    expect(screen.getByText("Your store is on the house")).toBeTruthy();
    expect(
      screen.getByText(/given you the Pro plan at no charge/),
    ).toBeTruthy();
    expect(screen.getByText(/no platform fee/)).toBeTruthy();
    mocks.statusData = original;
  });

  it("offers no way to buy the plan it was given", () => {
    const original = mocks.statusData;
    mocks.statusData = compedPro();
    render(<Billing />);
    expect(screen.queryByText("Upgrade")).toBeNull();
    expect(screen.queryByText("Upgrade now")).toBeNull();
    expect(mocks.planCheckoutMutate).not.toHaveBeenCalled();
    mocks.statusData = original;
  });

  it("shows 'On the house' instead of a trial or subscription state", () => {
    const original = mocks.statusData;
    mocks.statusData = compedPro();
    render(<Billing />);
    expect(screen.getByText("On the house")).toBeTruthy();
    expect(screen.queryByText(/Trial until/)).toBeNull();
    expect(screen.queryByText("Active")).toBeNull();
    mocks.statusData = original;
  });

  it("names the waived fee where the 1% line would be", () => {
    const original = mocks.statusData;
    mocks.statusData = compedPro();
    render(<Billing />);
    expect(
      screen.getByText(/Platform fees \(0% — on the house\)/),
    ).toBeTruthy();
    mocks.statusData = original;
  });

  it("unlocks the Pro-gated store settings for a comped store", () => {
    // The gates here read PLAN_FEATURES for the plan the server reports, and
    // the server reports the ENTITLED plan — so the custom-domain and
    // multi-currency locks lift for a comped store exactly as they do for a
    // paying one. An ordinary Free store still sees both "Pro plan" badges.
    render(<Billing />);
    expect(screen.getAllByText("Pro plan").length).toBe(2);
    expect(
      screen.getByText(/Serve your store on your own domain/),
    ).toBeTruthy();
    cleanup();

    const original = mocks.statusData;
    mocks.statusData = compedPro();
    render(<Billing />);
    expect(screen.queryByText("Pro plan")).toBeNull();
    expect(
      screen.queryByText(/Serve your store on your own domain/),
    ).toBeNull();
    mocks.statusData = original;
  });

  it("still charges an ordinary free store, and still upsells it", () => {
    render(<Billing />);
    expect(screen.queryByText("Your store is on the house")).toBeNull();
    expect(screen.getByText(/You'd save CHF 7 on Pro/)).toBeTruthy();
  });
});

describe("Billing page — a store whose fee alone is waived", () => {
  it("keeps the Free plan but reports no platform fee", () => {
    const original = mocks.statusData;
    mocks.statusData = {
      ...mocks.statusData,
      comp: { plan: null, planComped: false, feeWaived: true },
      upsell: null,
      onlineFees: {
        ...(mocks.statusData as { onlineFees: Record<string, unknown> })
          .onlineFees,
        monthFeeChf: 0,
        feeBps: 0,
      },
    } as never;
    render(<Billing />);
    expect(screen.getByText("Your store is on the house")).toBeTruthy();
    expect(screen.getByText(/no platform fee/)).toBeTruthy();
    // No plan was granted, so the page must not claim one was.
    expect(screen.queryByText(/at no charge/)).toBeNull();
    mocks.statusData = original;
  });
});

describe("Billing page — translated", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("renders its headings, copy and money in German", async () => {
    await act(async () => {
      await i18n.changeLanguage("de");
    });
    render(<Billing />);
    expect(screen.getByText("Plan & Abrechnung")).toBeTruthy();
    expect(screen.getByText("Online-Verkäufe diesen Monat")).toBeTruthy();
    expect(screen.getByText("Aktuell")).toBeTruthy();
    expect(
      screen.getByText(/Mit Pro würden Sie diesen Monat CHF 7 sparen/),
    ).toBeTruthy();
    expect(screen.getByText("Teamplätze")).toBeTruthy();
    // Swiss grouping holds in every language, and the plan names do not
    // translate — "Pro" stays "Pro".
    expect(screen.getByText("CHF 3'200")).toBeTruthy();
    expect(screen.getByText("Pro")).toBeTruthy();
    // The invite placeholder is user-visible chrome, so it translates too.
    expect(screen.getByPlaceholderText("teamkollege@example.com")).toBeTruthy();
  });
});
