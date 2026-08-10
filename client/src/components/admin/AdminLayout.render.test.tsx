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
  trpc: {
    tenant: { me: { useQuery: (...args: unknown[]) => mockMeQuery(...args) } },
  },
}));

function asViewer(role: string, plan: string) {
  mockUseAuth.mockReturnValue({
    user: { id: 1, role, name: "A", email: "a@b.c" },
    loading: false,
  });
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
    render(
      <AdminLayout title="Home">
        <p>page body</p>
      </AdminLayout>,
    );
    expect(screen.getByText("Shop")).toBeTruthy();
    expect(screen.getByText("Zolto account")).toBeTruthy();
    expect(screen.getByText("page body")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
  });

  it("hides admin-only account items from staff, keeping Support", () => {
    asViewer("staff", "pro");
    render(
      <AdminLayout>
        <p>x</p>
      </AdminLayout>,
    );
    expect(screen.queryByText("Team")).toBeNull();
    expect(screen.queryByText("Plan & billing")).toBeNull();
    expect(screen.getByText("Support")).toBeTruthy();
    // store plane stays visible
    expect(screen.getByText("Products")).toBeTruthy();
  });

  it("marks plan-gated items with a lock naming the required plan", () => {
    asViewer("admin", "free");
    render(
      <AdminLayout>
        <p>x</p>
      </AdminLayout>,
    );
    // Domain + Insights are both Pro-gated on the two-tier model.
    expect(screen.getAllByLabelText("Requires the pro plan").length).toBe(2);
  });

  it("shows no lock once the plan covers the feature", () => {
    asViewer("admin", "pro");
    render(
      <AdminLayout>
        <p>x</p>
      </AdminLayout>,
    );
    expect(screen.queryByLabelText("Requires the pro plan")).toBeNull();
  });

  it("defaults to staff/free display when queries have not resolved", () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });
    mockMeQuery.mockReturnValue({ data: undefined });
    render(
      <AdminLayout>
        <p>x</p>
      </AdminLayout>,
    );
    expect(screen.getByText("Products")).toBeTruthy();
    expect(screen.queryByText("Team")).toBeNull();
  });

  // The storefront Navbar is `fixed` (h-20, md:h-24) and every admin route
  // renders under it, so the shell has to start below it. It did not: the
  // sidebar's first group heading and its top entries, and the page title
  // beside them, were painted underneath the navbar and unreachable.
  it("starts the shell below the fixed storefront navbar", () => {
    asViewer("admin", "pro");
    render(
      <AdminLayout title="Domain">
        <p>x</p>
      </AdminLayout>,
    );
    const shell = screen.getByTestId("admin-shell").className;
    expect(shell).toMatch(/\bpt-20\b/);
    expect(shell).toMatch(/\bmd:pt-24\b/);
  });

  it("holds the sidebar and the page title on screen while the page scrolls", () => {
    asViewer("admin", "pro");
    render(
      <AdminLayout title="Domain">
        <p>x</p>
      </AdminLayout>,
    );
    const sidebar = screen.getByTestId("admin-sidebar").className;
    // Sticky under the navbar, one viewport tall, scrolling inside itself —
    // otherwise a long settings page carries the nav off the top of the screen.
    expect(sidebar).toMatch(/\bmd:sticky\b/);
    expect(sidebar).toMatch(/md:top-24/);
    expect(sidebar).toMatch(/md:h-\[calc\(100vh-6rem\)\]/);
    expect(sidebar).toMatch(/\boverflow-y-auto\b/);
    // The mobile drawer is the same <aside>, and it is `fixed`, so the shell's
    // padding does not move it: it needs its own offset below the navbar.
    expect(sidebar).toMatch(/\btop-20\b/);

    const header = screen.getByTestId("admin-header").className;
    expect(header).toMatch(/\bsticky\b/);
    expect(header).toMatch(/\btop-20\b/);
    expect(header).toMatch(/md:top-24/);
    // Opaque, or body content scrolls through it; below the drawer (z-40) and
    // its backdrop (z-30), or it would sit on top of the open drawer.
    expect(header).toMatch(/\bbg-background\b/);
    expect(header).toMatch(/\bz-20\b/);
  });

  it("gives the mobile drawer an opaque background", () => {
    // Caught by shooting the drawer open at 390x844: bg-muted/30 is a tint
    // beside the page and a window through it once the same <aside> is an
    // overlay — the settings form read straight through the nav labels.
    asViewer("admin", "pro");
    render(
      <AdminLayout title="Storefront">
        <p>x</p>
      </AdminLayout>,
    );
    const sidebar = screen.getByTestId("admin-sidebar").className;
    expect(sidebar).toMatch(/(^|\s)bg-muted(\s|$)/);
    expect(sidebar).toMatch(/md:bg-muted\/30/);
  });

  it("renders German nav labels and group titles after a language change", async () => {
    asViewer("admin", "pro");
    await i18n.changeLanguage("de");
    render(
      <AdminLayout>
        <p>x</p>
      </AdminLayout>,
    );
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

  // App.tsx hands the header the nav manifest's English label, so without the
  // same lookup the sidebar reads "Kategorien" while the title above it still
  // says "Categories".
  it("translates the header title it is handed from the nav manifest", async () => {
    asViewer("admin", "pro");
    await i18n.changeLanguage("de");
    render(
      <AdminLayout title="Categories">
        <p>x</p>
      </AdminLayout>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Kategorien" }),
    ).toBeTruthy();
  });

  it("passes through a title that is not a nav manifest label", async () => {
    asViewer("admin", "pro");
    await i18n.changeLanguage("de");
    render(
      <AdminLayout title="Aurora Atelier">
        <p>x</p>
      </AdminLayout>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Aurora Atelier" }),
    ).toBeTruthy();
  });

  it("ships a language switcher that switches and persists the choice", () => {
    asViewer("admin", "pro");
    render(
      <AdminLayout>
        <p>x</p>
      </AdminLayout>,
    );
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
