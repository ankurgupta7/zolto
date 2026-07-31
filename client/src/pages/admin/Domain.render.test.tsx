import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Domain from "./Domain";

/**
 * Regression test for the Free/Pro pivot.
 *
 * This screen gated on `new Set(["maker","studio","atelier"])` — the retired
 * four-tier ids. After the pivot that set matched no plan at all, so a Pro
 * merchant was shown the upgrade prompt for the custom domain the Pricing page
 * had just sold them. Nothing failed loudly; the page simply lied.
 */

const mocks = vi.hoisted(() => ({
  tenant: { plan: "free" } as { plan: string } | undefined,
  settings: { publicDomain: null } as Record<string, unknown> | undefined,
}));

vi.mock("@/components/admin/useTenantSettings", () => ({
  useTenantSettings: () => ({
    tenant: mocks.tenant,
    settings: mocks.settings,
    invalidate: vi.fn(),
  }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      domainStatus: { useQuery: () => ({ data: undefined, refetch: vi.fn() }) },
      updateSettings: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenant = { plan: "free" };
  mocks.settings = { publicDomain: null };
});
afterEach(() => cleanup());

describe("Domain (custom domain) page", () => {
  it("shows the upgrade gate on Free", () => {
    mocks.tenant = { plan: "free" };
    render(<Domain />);
    expect(screen.getAllByText(/custom domain/i).length).toBeGreaterThan(0);
    // The form must not be reachable — the server would reject it anyway.
    expect(screen.queryByPlaceholderText(/example\.com/i)).toBeNull();
  });

  it("gives a PAYING Pro merchant the form, not an upsell", () => {
    // The exact regression: Pro paid for this and was shown a sales pitch.
    mocks.tenant = { plan: "pro" };
    render(<Domain />);
    expect(screen.queryByText(/requires the Pro plan/i)).toBeNull();
    expect(screen.queryByText(/upgrade/i)).toBeNull();
  });

  it("treats a retired tier id as Free rather than unlocking it", () => {
    // A stale tenant row must not hand out a paid feature.
    for (const retired of ["maker", "studio", "atelier"]) {
      cleanup();
      mocks.tenant = { plan: retired };
      render(<Domain />);
      expect(screen.queryByPlaceholderText(/example\.com/i)).toBeNull();
    }
  });
});
