import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import Stores from "./Stores";

type Row = {
  id: number;
  slug: string;
  name: string;
  domain: string | null;
  plan: "free" | "pro";
  subscriptionStatus: string | null;
  trialEndsAt: Date | null;
  createdAt: Date;
  stripeConnected: boolean;
  adminCount: number;
  userCount: number;
  comp: {
    plan: "free" | "pro" | null;
    feeWaived: boolean;
    note: string | null;
    grantedAt: Date | null;
  } | null;
};

function row(over: Partial<Row> = {}): Row {
  return {
    id: 1,
    slug: "aurora",
    name: "Aurora",
    domain: null,
    plan: "free",
    subscriptionStatus: "trialing",
    trialEndsAt: null,
    createdAt: new Date("2026-03-01T00:00:00Z"),
    stripeConnected: false,
    adminCount: 1,
    userCount: 2,
    comp: null,
    ...over,
  };
}

const mocks = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  error: null as { message: string } | null,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    platform: {
      tenants: {
        useQuery: () => ({
          data: mocks.data,
          isLoading: mocks.isLoading,
          error: mocks.error,
        }),
      },
    },
  },
}));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isLoading = false;
  mocks.error = null;
  mocks.data = [row()];
});
afterEach(() => cleanup());

describe("Stores — the list", () => {
  it("lists each store with its plan and address", () => {
    render(<Stores />);
    expect(screen.getByText("Aurora")).toBeTruthy();
    expect(screen.getByText("aurora.zolto.ch")).toBeTruthy();
    expect(screen.getByText("free")).toBeTruthy();
  });

  it("prefers a custom domain over the zolto.ch address when one is set", () => {
    mocks.data = [row({ domain: "aurora.ch" })];
    render(<Stores />);
    expect(screen.getByText("aurora.ch")).toBeTruthy();
    expect(screen.queryByText("aurora.zolto.ch")).toBeNull();
  });

  it("filters by name, address, and domain", () => {
    mocks.data = [row(), row({ id: 2, slug: "beta", name: "Beta Shop" })];
    render(<Stores />);
    fireEvent.change(screen.getByLabelText("Filter stores"), {
      target: { value: "beta" },
    });
    expect(screen.queryByText("Aurora")).toBeNull();
    expect(screen.getByText("Beta Shop")).toBeTruthy();
  });

  it("says so when a filter matches nothing, rather than showing an empty table", () => {
    render(<Stores />);
    fireEvent.change(screen.getByLabelText("Filter stores"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText(/Nothing matches "zzz"/)).toBeTruthy();
  });
});

// The reason this page exists: a store whose owner never redeemed their claim
// token has users but no admin, and every admin action fails for them with a
// permissions error that reads like a Stripe problem.
describe("Stores — locked-out stores", () => {
  it("banners stores that have users but no admin", () => {
    mocks.data = [row({ adminCount: 0, userCount: 2 })];
    render(<Stores />);
    expect(screen.getByText(/1 store has users but no admin/i)).toBeTruthy();
    expect(screen.getByText("no admin")).toBeTruthy();
  });

  it("does not banner a store that simply has nobody in it yet", () => {
    // adminCount 0 AND userCount 0 is a store nobody has signed in to — not a
    // locked-out owner, and nothing for the operator to repair.
    mocks.data = [row({ adminCount: 0, userCount: 0 })];
    render(<Stores />);
    expect(screen.queryByText(/users but no admin/i)).toBeNull();
  });

  it("links each locked-out store straight to its detail page", () => {
    mocks.data = [row({ id: 42, slug: "stuck", adminCount: 0, userCount: 3 })];
    render(<Stores />);
    const link = screen.getByText("stuck").closest("a");
    expect(link?.getAttribute("href")).toBe("/platform/stores/42");
  });
});

describe("Stores — states", () => {
  it("shows a loading state", () => {
    mocks.isLoading = true;
    render(<Stores />);
    expect(screen.getByText(/Loading every store/i)).toBeTruthy();
  });

  it("surfaces a server error instead of rendering an empty list", () => {
    mocks.error = { message: "Superadmin only" };
    render(<Stores />);
    expect(screen.getByText(/Superadmin only/)).toBeTruthy();
  });

  it("handles a platform with no stores at all", () => {
    mocks.data = [];
    render(<Stores />);
    expect(screen.getByText("No stores yet.")).toBeTruthy();
  });
});

// A comped store looks exactly like a paying Pro store on this list unless the
// grant is said out loud — which is how a comp gets left on for a year.
describe("Stores — comps", () => {
  it("lists the plan the store is entitled to, and marks it as a comp", () => {
    mocks.data = [
      row({
        plan: "free",
        comp: { plan: "pro", feeWaived: true, note: null, grantedAt: null },
      }),
    ];
    render(<Stores />);
    expect(screen.getByText("pro")).toBeTruthy();
    expect(screen.getByText("comped · 0%")).toBeTruthy();
  });

  it("distinguishes a bare fee waiver from a granted plan", () => {
    mocks.data = [
      row({
        plan: "free",
        comp: { plan: null, feeWaived: true, note: null, grantedAt: null },
      }),
    ];
    render(<Stores />);
    expect(screen.getByText("free")).toBeTruthy();
    expect(screen.getByText("0% fee")).toBeTruthy();
  });

  it("marks a granted plan that still pays the fee", () => {
    mocks.data = [
      row({
        plan: "free",
        comp: { plan: "pro", feeWaived: false, note: null, grantedAt: null },
      }),
    ];
    render(<Stores />);
    expect(screen.getByText("comped")).toBeTruthy();
  });

  it("leaves an ordinary paying store unmarked", () => {
    mocks.data = [row({ plan: "pro" })];
    render(<Stores />);
    expect(screen.getByText("pro")).toBeTruthy();
    expect(screen.queryByText(/comped/)).toBeNull();
    expect(screen.queryByText("0% fee")).toBeNull();
  });
});
