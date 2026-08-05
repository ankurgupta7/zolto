import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import StoreDetail from "./StoreDetail";

const mocks = vi.hoisted(() => ({
  detail: undefined as unknown,
  isLoading: false,
  error: null as { message: string } | null,
  setRole: vi.fn(),
  setPlan: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      platform: {
        tenantDetail: { invalidate: vi.fn() },
        tenants: { invalidate: vi.fn() },
      },
    }),
    platform: {
      tenantDetail: {
        useQuery: () => ({
          data: mocks.detail,
          isLoading: mocks.isLoading,
          error: mocks.error,
        }),
      },
      setTenantUserRole: {
        useMutation: () => ({ mutate: mocks.setRole, isPending: false }),
      },
      setTenantPlan: {
        useMutation: () => ({ mutate: mocks.setPlan, isPending: false }),
      },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function user(over: Record<string, unknown> = {}) {
  return {
    id: 11,
    email: "owner@example.com",
    name: "Owner",
    role: "customer",
    loginMethod: "google",
    pendingClaim: false,
    lastSignedIn: new Date("2026-07-01T00:00:00Z"),
    ...over,
  };
}

function detail(over: Record<string, unknown> = {}, users = [user()]) {
  return {
    tenant: {
      id: 42,
      slug: "stuck",
      name: "Stuck Store",
      domain: null,
      plan: "free",
      subscriptionStatus: "trialing",
      trialEndsAt: null,
      createdAt: new Date("2026-03-01T00:00:00Z"),
      stripeConnected: false,
      adminCount: users.filter((u) =>
        ["admin", "superadmin"].includes(u.role as string),
      ).length,
      userCount: users.length,
      onboardingStep: 2,
      referralCode: "ABC123",
      ...over,
    },
    users,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isLoading = false;
  mocks.error = null;
  mocks.detail = detail();
});
afterEach(() => cleanup());

describe("StoreDetail — the locked-out repair", () => {
  it("warns when the store has users but no admin", () => {
    render(<StoreDetail tenantId={42} />);
    expect(screen.getByText("This store has no admin")).toBeTruthy();
  });

  it("promotes a user to the store's admin", () => {
    render(<StoreDetail tenantId={42} />);
    fireEvent.click(screen.getByText("Make admin"));
    expect(mocks.setRole).toHaveBeenCalledWith({
      tenantId: 42,
      userId: 11,
      role: "admin",
    });
  });

  it("offers demotion once someone is already admin, and drops the warning", () => {
    mocks.detail = detail({}, [user({ role: "admin" })]);
    render(<StoreDetail tenantId={42} />);
    expect(screen.queryByText("This store has no admin")).toBeNull();
    fireEvent.click(screen.getByText("Demote to staff"));
    expect(mocks.setRole).toHaveBeenCalledWith({
      tenantId: 42,
      userId: 11,
      role: "staff",
    });
  });

  // A pending-claim row is a placeholder, not an account — promoting it would
  // grant admin to a user who cannot sign in.
  it("offers no promotion for a user who has never signed in", () => {
    mocks.detail = detail({}, [user({ pendingClaim: true })]);
    render(<StoreDetail tenantId={42} />);
    expect(screen.queryByText("Make admin")).toBeNull();
    expect(screen.getByText("must sign in first")).toBeTruthy();
  });

  it("never offers to change the platform owner's own role", () => {
    mocks.detail = detail({}, [user({ role: "superadmin" })]);
    render(<StoreDetail tenantId={42} />);
    expect(screen.queryByText("Make admin")).toBeNull();
    expect(screen.queryByText("Demote to staff")).toBeNull();
    expect(screen.getByText("platform owner")).toBeTruthy();
  });

  it("says so when nobody has ever signed in to the store", () => {
    mocks.detail = detail({ adminCount: 0, userCount: 0 }, []);
    render(<StoreDetail tenantId={42} />);
    expect(screen.getByText(/Nobody has ever signed in/i)).toBeTruthy();
    // No users means nothing to repair — the warning would be misleading.
    expect(screen.queryByText("This store has no admin")).toBeNull();
  });
});

describe("StoreDetail — plan", () => {
  it("moves the store to the other plan", () => {
    render(<StoreDetail tenantId={42} />);
    fireEvent.click(screen.getByText("Move to pro"));
    expect(mocks.setPlan).toHaveBeenCalledWith({ tenantId: 42, plan: "pro" });
  });

  it("disables the plan the store is already on", () => {
    render(<StoreDetail tenantId={42} />);
    const current = screen.getByText("Move to free").closest("button");
    expect(current?.hasAttribute("disabled")).toBe(true);
  });

  it("states that Stripe is not touched, so nobody assumes billing followed", () => {
    render(<StoreDetail tenantId={42} />);
    expect(screen.getByText(/Stripe is not touched/i)).toBeTruthy();
  });
});

describe("StoreDetail — states", () => {
  it("shows a loading state", () => {
    mocks.isLoading = true;
    render(<StoreDetail tenantId={42} />);
    expect(screen.getByText(/Loading the store/i)).toBeTruthy();
  });

  it("surfaces a server error with a way back to the list", () => {
    mocks.error = { message: "No such store." };
    render(<StoreDetail tenantId={42} />);
    expect(screen.getByText("No such store.")).toBeTruthy();
    expect(screen.getByText("All stores").closest("a")).toBeTruthy();
  });

  it("rejects a non-numeric id from the URL without querying", () => {
    render(<StoreDetail tenantId={Number.NaN} />);
    expect(screen.getByText("Invalid store id.")).toBeTruthy();
  });
});
