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
    // Both cards on this page (business contact, company details) save the
    // whole form through the same handler, so either button will do.
    fireEvent.click(screen.getAllByText("Save changes")[0]);
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
    fireEvent.click(screen.getAllByText("Save changes")[0]);
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

// The imprint has always told the merchant they are responsible for adding
// their company form, registration number and registered address — and until
// these fields existed, gave them nowhere to put them.
describe("ShopProfile — company details", () => {
  it("prefills the legal identity from settings", () => {
    mocks.settings = {
      ...mocks.settings,
      companyLegalName: "Bergblume Keramik GmbH",
      companyAddress: "Musterstrasse 1\n8001 Basel",
      vatNumber: "CHE-123.456.789 MWST",
      companyRegistration: "CH-020.3.001.234-5",
    };
    render(<ShopProfile />);
    expect(screen.getByDisplayValue("Bergblume Keramik GmbH")).toBeTruthy();
    // Read the textarea directly: getByDisplayValue normalises whitespace, so
    // it cannot tell a one-line address from a real multi-line one.
    expect(
      (screen.getByLabelText("Registered address") as HTMLTextAreaElement)
        .value,
    ).toBe("Musterstrasse 1\n8001 Basel");
    expect(screen.getByDisplayValue("CHE-123.456.789 MWST")).toBeTruthy();
    expect(screen.getByDisplayValue("CH-020.3.001.234-5")).toBeTruthy();
  });

  it("saves the company details alongside the rest of the profile", () => {
    render(<ShopProfile />);
    fireEvent.change(screen.getByLabelText("Registered address"), {
      target: { value: "Musterstrasse 1\n8001 Basel" },
    });
    fireEvent.change(screen.getByLabelText("VAT number"), {
      target: { value: "CHE-123.456.789 MWST" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[1]);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyAddress: "Musterstrasse 1\n8001 Basel",
        vatNumber: "CHE-123.456.789 MWST",
      }),
    );
  });

  // A mistyped VAT number is published on a legal document, so removing it has
  // to actually remove it rather than read as "leave unchanged".
  it("sends null for a detail the merchant cleared", () => {
    mocks.settings = { ...mocks.settings, vatNumber: "CHE-oops" };
    render(<ShopProfile />);
    fireEvent.change(screen.getByLabelText("VAT number"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getAllByText("Save changes")[1]);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ vatNumber: null }),
    );
  });
});
