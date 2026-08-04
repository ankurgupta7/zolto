import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import i18n from "@/lib/i18n";
import { AdminLayout } from "./AdminLayout";

// Display state comes from two injected sources; both are mocked so the test
// verifies behaviour (what the sidebar shows) through the public component.
const mockUseAuth = vi.fn();
vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));
const mockMeQuery = vi.fn();
vi.mock("@/lib/trpc", () => ({
  trpc: { tenant: { me: { useQuery: (...args: unknown[]) => mockMeQuery(...args) } } },
}));

function asViewer(role: string, plan: string) {
  mockUseAuth.mockReturnValue({ user: { id: 1, role, name: "A", email: "a@b.c" }, loading: false });
  mockMeQuery.mockReturnValue({ data: { plan } });
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  // The language tests below switch languages; every test starts from English.
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("AdminLayout", () => {
  it("renders both plane groups for an admin", () => {
    asViewer("admin", "pro");
    render(<AdminLayout title="Home"><p>page body</p></AdminLayout>);
    expect(screen.getByText("Shop")).toBeTruthy();
    expect(screen.getByText("Zolto account")).toBeTruthy();
    expect(screen.getByText("page body")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
  });

  it("hides admin-only account items from staff, keeping Support", () => {
    asViewer("staff", "pro");
    render(<AdminLayout><p>x</p></AdminLayout>);
    expect(screen.queryByText("Team")).toBeNull();
    expect(screen.queryByText("Plan & billing")).toBeNull();
    expect(screen.getByText("Support")).toBeTruthy();
    // store plane stays visible
    expect(screen.getByText("Products")).toBeTruthy();
  });

  it("marks plan-gated items with a lock naming the required plan", () => {
    asViewer("admin", "free");
    render(<AdminLayout><p>x</p></AdminLayout>);
    // Domain + Insights are both Pro-gated on the two-tier model.
    expect(screen.getAllByLabelText("Requires the pro plan").length).toBe(2);
  });

  it("shows no lock once the plan covers the feature", () => {
    asViewer("admin", "pro");
    render(<AdminLayout><p>x</p></AdminLayout>);
    expect(screen.queryByLabelText("Requires the pro plan")).toBeNull();
  });

  it("defaults to staff/free display when queries have not resolved", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    mockMeQuery.mockReturnValue({ data: undefined });
    render(<AdminLayout><p>x</p></AdminLayout>);
    expect(screen.getByText("Products")).toBeTruthy();
    expect(screen.queryByText("Team")).toBeNull();
  });

  it("renders German nav labels and group titles after a language change", async () => {
    asViewer("admin", "pro");
    await i18n.changeLanguage("de");
    render(<AdminLayout><p>x</p></AdminLayout>);
    // Manifest labels stay English data; the shell translates them.
    expect(screen.getByText("Produkte")).toBeTruthy();
    expect(screen.getByText("Bestellungen")).toBeTruthy();
    expect(screen.getByText("Plan & Abrechnung")).toBeTruthy();
    expect(screen.getByText("Zolto-Konto")).toBeTruthy();
    // The switcher itself is translated too, and still offers all four.
    const switcher = screen.getByLabelText(
      "Sprache wechseln",
    ) as HTMLSelectElement;
    expect(Array.from(switcher.options).map((o) => o.value)).toEqual([
      "de",
      "en",
      "fr",
      "it",
    ]);
  });

  it("ships a language switcher that switches and persists the choice", () => {
    asViewer("admin", "pro");
    render(<AdminLayout><p>x</p></AdminLayout>);
    const switcher = screen.getByLabelText(
      "Switch language",
    ) as HTMLSelectElement;
    expect(switcher.value).toBe("en");
    expect(Array.from(switcher.options).map((o) => o.value)).toEqual([
      "de",
      "en",
      "fr",
      "it",
    ]);

    fireEvent.change(switcher, { target: { value: "fr" } });
    expect(i18n.language).toBe("fr");
    // Same persistence contract as the storefront switcher.
    expect(localStorage.getItem("kalakosh_lang")).toBe("fr");
    expect(document.documentElement.lang).toBe("fr-CH");
    expect(screen.getByText("Commandes")).toBeTruthy();
  });
});
