import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ShopProfile from "./ShopProfile";

const mocks = vi.hoisted(() => ({
  role: "admin" as string,
  tenant: { slug: "bergblume", name: "Bergblume", plan: "free" } as Record<
    string,
    unknown
  > | null,
  settings: {
    contactEmail: "hello@bergblume.ch",
    contactPhone: "",
    currency: "chf",
  } as Record<string, unknown> | null,
  save: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: 1, role: mocks.role },
    isAuthenticated: true,
    loading: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/admin/useTenantSettings", () => ({
  useTenantSettings: () => ({
    tenant: mocks.tenant,
    slug: "bergblume",
    settings: mocks.settings,
    isLoading: false,
    invalidate: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      updateSettings: {
        useMutation: () => ({ mutate: mocks.save, isPending: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "admin";
  mocks.settings = {
    contactEmail: "hello@bergblume.ch",
    contactPhone: "",
    currency: "chf",
  };
});
afterEach(() => cleanup());

// The server has accepted `currency` on tenant.updateSettings all along; no UI
// ever wrote it, so every store was stuck on CHF short of a SQL statement.
describe("ShopProfile — currency", () => {
  it("prefills the store's saved currency", () => {
    mocks.settings = { ...mocks.settings, currency: "eur" };
    render(<ShopProfile />);
    expect((screen.getByLabelText("Currency") as HTMLSelectElement).value).toBe(
      "eur",
    );
  });

  it("falls back to CHF when the store has never set one", () => {
    mocks.settings = { contactEmail: null, contactPhone: null };
    render(<ShopProfile />);
    expect((screen.getByLabelText("Currency") as HTMLSelectElement).value).toBe(
      "chf",
    );
  });

  it("saves the chosen currency alongside the contact details", () => {
    render(<ShopProfile />);
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "eur" },
    });
    fireEvent.click(screen.getByText("Save changes"));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "eur" }),
    );
  });

  // A code set by support before this selector existed must survive a save of
  // an unrelated field, rather than being silently reset to the first option.
  it("keeps a currency that is not in the offered list", () => {
    mocks.settings = { ...mocks.settings, currency: "sek" };
    render(<ShopProfile />);
    const select = screen.getByLabelText("Currency") as HTMLSelectElement;
    expect(select.value).toBe("sek");
    fireEvent.click(screen.getByText("Save changes"));
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ currency: "sek" }),
    );
  });

  it("warns that prices are relabelled, not converted", () => {
    render(<ShopProfile />);
    expect(screen.getByText(/does not convert them/i)).toBeTruthy();
  });

  it("tells the merchant to re-price only once they have actually changed it", () => {
    render(<ShopProfile />);
    expect(screen.queryByText(/Re-price your catalogue/i)).toBeNull();
    fireEvent.change(screen.getByLabelText("Currency"), {
      target: { value: "usd" },
    });
    expect(screen.getByText(/Re-price your catalogue/i)).toBeTruthy();
  });
});

describe("ShopProfile — access", () => {
  it("is closed to staff", () => {
    mocks.role = "staff";
    render(<ShopProfile />);
    expect(screen.queryByLabelText("Currency")).toBeNull();
  });
});
