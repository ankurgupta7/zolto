import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import Platform from "./Platform";

const mocks = vi.hoisted(() => ({
  role: "superadmin" as string | null,
  metrics: {
    month: "2026-07",
    tenants: { total: 10, free: 8, pro: 2 },
    northStar: {
      freeInPersonVendors: 6,
      freeInPersonVendorsSellingOnline: 3,
      conversionPct: 50,
    },
    online: {
      gmvChf: 4200,
      feeChf: 42,
      orders: 61,
      agentGmvChf: 900,
      agentOrders: 12,
      sellingTenants: 5,
    },
    inPerson: { gmvChf: 18000, orders: 320, sellingTenants: 7 },
    subscriptions: { active: 2, trialing: 1, pastDue: 0, canceled: 3 },
    model: { feePercentLabel: "1%", proPriceChf: 25 },
  } as Record<string, unknown> | undefined,
  reconcileMutate: vi.fn(),
  onSuccess: undefined as ((data: unknown) => void) | undefined,
  rotateMutate: vi.fn(),
  rotateOnSuccess: undefined as ((data: unknown) => void) | undefined,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mocks.role ? { id: 1, role: mocks.role } : null,
    isAuthenticated: Boolean(mocks.role),
    loading: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    platform: {
      metrics: {
        useQuery: () => ({ data: mocks.metrics, isLoading: false }),
      },
      reconcileAllTenants: {
        useMutation: (opts?: { onSuccess?: (d: unknown) => void }) => {
          mocks.onSuccess = opts?.onSuccess;
          return { mutate: mocks.reconcileMutate, isPending: false };
        },
      },
      rotatePosTestKey: {
        useMutation: (opts?: { onSuccess?: (d: unknown) => void }) => {
          mocks.rotateOnSuccess = opts?.onSuccess;
          return { mutate: mocks.rotateMutate, isPending: false };
        },
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "superadmin";
});
afterEach(() => cleanup());

describe("Platform page — Stripe reconciliation sweep", () => {
  it("is hidden entirely from a non-superadmin", () => {
    mocks.role = "admin";
    render(<Platform />);
    expect(screen.queryByText("Reconcile every store")).toBeNull();
    expect(screen.getByText(/Zolto operator only/i)).toBeTruthy();
  });

  it("explains that unconnected stores are skipped before any run", () => {
    render(<Platform />);
    expect(screen.getByText("Reconcile every store")).toBeTruthy();
    expect(
      screen.getByText(/no connected Stripe account are skipped/i),
    ).toBeTruthy();
  });

  it("triggers the sweep", () => {
    render(<Platform />);
    fireEvent.click(screen.getByText("Reconcile every store"));
    expect(mocks.reconcileMutate).toHaveBeenCalledWith({});
  });

  it("renders per-store totals once the sweep returns", async () => {
    render(<Platform />);
    mocks.onSuccess?.({
      tenantsScanned: 2,
      tenantsFailed: 0,
      perTenant: [
        {
          tenantId: 1,
          slug: "aurora",
          name: "Aurora",
          ok: true,
          scannedSucceededPayments: 9,
          alreadyRecorded: 7,
          newPendingReview: 2,
          newNoCandidates: 0,
          emailSent: true,
        },
      ],
      totals: {
        scannedSucceededPayments: 9,
        alreadyRecorded: 7,
        newPendingReview: 2,
        newNoCandidates: 0,
        emailsSent: 1,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/2 stores scanned/)).toBeTruthy();
    });
    expect(screen.getByText("Aurora")).toBeTruthy();
    expect(screen.getByText("emailed")).toBeTruthy();
  });

  it("surfaces a failed store's error rather than hiding it", async () => {
    // One tenant failing must not read as a clean sweep — the operator has to
    // see which store was never scanned, and why.
    render(<Platform />);
    mocks.onSuccess?.({
      tenantsScanned: 2,
      tenantsFailed: 1,
      perTenant: [
        {
          tenantId: 1,
          slug: "aurora",
          name: "Aurora",
          ok: false,
          error: "Connect grant revoked",
        },
        {
          tenantId: 2,
          slug: "beta",
          name: "Beta",
          ok: true,
          scannedSucceededPayments: 1,
          alreadyRecorded: 1,
          newPendingReview: 0,
          newNoCandidates: 0,
          emailSent: false,
        },
      ],
      totals: {
        scannedSucceededPayments: 1,
        alreadyRecorded: 1,
        newPendingReview: 0,
        newNoCandidates: 0,
        emailsSent: 0,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/1 store could not be scanned/i)).toBeTruthy();
    });
    expect(screen.getByText("Connect grant revoked")).toBeTruthy();
    // …and the store that did work still reports.
    expect(screen.getByText("Beta")).toBeTruthy();
  });
});

// The POS test key card: what makes the CI credential obtainable at all, so
// its show-once behaviour is pinned — the key must appear only after a
// rotation round-trips, never on load.
describe("Platform page — POS test key", () => {
  it("is hidden from a non-superadmin along with the rest of the page", () => {
    mocks.role = "admin";
    render(<Platform />);
    expect(screen.queryByText("Rotate POS test key")).toBeNull();
  });

  it("shows no key material before a rotation", () => {
    render(<Platform />);
    expect(screen.getByText("Rotate POS test key")).toBeTruthy();
    expect(screen.getByText(/provisions the store on first use/i)).toBeTruthy();
    expect(screen.queryByText(/Shown once/i)).toBeNull();
  });

  it("rotates and reveals the key exactly once on success", async () => {
    render(<Platform />);
    fireEvent.click(screen.getByText("Rotate POS test key"));
    expect(mocks.rotateMutate).toHaveBeenCalled();

    act(() => {
      mocks.rotateOnSuccess?.({
        tenantId: 42,
        slug: "platform-tests",
        posApiKey: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      });
    });

    await waitFor(() => {
      expect(screen.getByText("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4")).toBeTruthy();
    });
    expect(screen.getByText(/Shown once/i)).toBeTruthy();
  });
});
