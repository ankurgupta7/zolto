import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  within,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { DATA_RESIDENCY, SOVEREIGNTY } from "@shared/platform";
import {
  MarketingNav,
  MarketingFooter,
  MarketingShell,
  StoreShortcut,
  BrushMark,
  SIGN_IN_PATH,
} from "./MarketingChrome";
import i18n from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  meData: undefined as unknown,
  meLoading: false,
  storeData: undefined as unknown,
  storeLoading: false,
  logout: vi.fn(),
}));

vi.mock("@/lib/navigate", () => ({ hardRedirect: vi.fn() }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    // The signed-in nav renders SignOutButton, which goes through useAuth.
    useUtils: () => ({
      auth: { me: { setData: vi.fn(), invalidate: vi.fn() } },
    }),
    auth: {
      me: {
        useQuery: () => ({ data: mocks.meData, isLoading: mocks.meLoading }),
      },
      logout: {
        useMutation: () => ({
          mutateAsync: mocks.logout,
          isPending: false,
          error: null,
        }),
      },
    },
    tenant: {
      myStore: {
        useQuery: () => ({
          data: mocks.storeData,
          isLoading: mocks.storeLoading,
        }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.meData = undefined;
  mocks.meLoading = false;
  mocks.storeData = undefined;
  mocks.storeLoading = false;
});
afterEach(() => cleanup());

function renderNav(path = "/") {
  const { hook } = memoryLocation({ path, static: true });
  return render(
    <Router hook={hook}>
      <MarketingNav />
    </Router>,
  );
}

describe("StoreShortcut (marketing 'go to your store')", () => {
  it("renders nothing for a logged-out visitor", () => {
    const { container } = render(<StoreShortcut />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the user has no store", () => {
    mocks.meData = { id: 1 };
    mocks.storeData = null;
    const { container } = render(<StoreShortcut />);
    expect(container.firstChild).toBeNull();
  });

  it("links a signed-in merchant back to their store admin", () => {
    mocks.meData = { id: 1 };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
    render(<StoreShortcut />);
    const link = screen.getByText("Go to your store").closest("a");
    expect(link).toBeTruthy();
    // jsdom host is localhost → same-origin, surface-forced form.
    expect(link?.getAttribute("href")).toBe(
      "/admin?surface=storefront&tenant=kalakosh",
    );
  });

  it("holds the slot while the store lookup is still in flight", () => {
    mocks.meData = { id: 1 };
    mocks.storeLoading = true;
    render(<StoreShortcut />);
    // Signed in but slug unknown: a placeholder, not a gap that pops.
    expect(screen.getByTestId("auth-slot-loading")).toBeTruthy();
    expect(screen.queryByText("Go to your store")).toBeNull();
  });
});

describe("SIGN_IN_PATH", () => {
  it("sends a returning merchant to the sign-in bounce, not the signup form", () => {
    // /signup only ever creates a *new* tenant — the bug this replaced.
    expect(SIGN_IN_PATH).toBe("/signin");
  });
});

describe("MarketingNav — auth slot", () => {
  it("commits to neither CTA while auth is resolving", () => {
    mocks.meLoading = true;
    renderNav();
    // Rendering "Start free" here would flip to "Go to your store" a moment
    // later for an already-signed-in merchant.
    expect(screen.queryByText("Start free")).toBeNull();
    expect(screen.getAllByTestId("auth-slot-loading").length).toBeGreaterThan(
      0,
    );
  });

  it("offers sign-in and signup to a logged-out visitor", () => {
    renderNav();
    const signIn = screen.getByRole("link", { name: "Sign in" });
    expect(signIn.getAttribute("href")).toBe(SIGN_IN_PATH);
    expect(
      screen.getAllByRole("link", { name: "Start free" }).length,
    ).toBeGreaterThan(0);
  });

  it("replaces the acquisition CTA with the store shortcut once signed in", () => {
    mocks.meData = { id: 1 };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
    renderNav();
    expect(screen.queryByText("Start free")).toBeNull();
    // "Sign in" is meaningless for a signed-in merchant.
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    // The shortcut sits in both the desktop and the mobile slot; each is hidden
    // at the other's breakpoint, so only one is ever on screen.
    expect(screen.getAllByText("Go to your store").length).toBe(2);
  });
});

describe("MarketingNav — mobile navigation", () => {
  it("exposes a menu trigger so the nav links are reachable on a phone", () => {
    renderNav();
    expect(screen.getByRole("button", { name: "Open menu" })).toBeTruthy();
  });

  it("reveals every nav destination when the menu is opened", async () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    const sheet = screen.getByRole("dialog");
    const nav = within(sheet).getByRole("navigation", { name: "Mobile" });
    expect(
      within(nav).getByRole("link", { name: "Pricing" }).getAttribute("href"),
    ).toBe("/pricing");
    expect(
      within(nav)
        .getByRole("link", { name: "Launch Diary" })
        .getAttribute("href"),
    ).toBe("/blog");
    expect(
      within(nav).getByRole("link", { name: "Product" }).getAttribute("href"),
    ).toBe("/#product");
    // Returning merchants get their way back in from the sheet too.
    expect(
      within(nav).getByRole("link", { name: "Sign in" }).getAttribute("href"),
    ).toBe(SIGN_IN_PATH);
  });

  it("omits sign-in from the menu for an already-signed-in merchant", async () => {
    mocks.meData = { id: 1 };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("closes the menu after a destination is chosen", async () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());

    const nav = within(screen.getByRole("dialog")).getByRole("navigation", {
      name: "Mobile",
    });
    fireEvent.click(within(nav).getByRole("link", { name: "Pricing" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("MarketingNav — language picker", () => {
  afterEach(async () => {
    // Leave the suite in its jsdom baseline language (en) with no saved choice.
    await i18n.changeLanguage("en");
    localStorage.removeItem("kalakosh_lang");
    document.documentElement.lang = "";
  });

  it("offers the four languages as uppercase codes", () => {
    renderNav();
    const picker = screen.getAllByLabelText(
      "Switch language",
    )[0] as HTMLSelectElement;
    const options = Array.from(picker.options);
    expect(options.map((o) => o.value)).toEqual(["de", "en", "fr", "it"]);
    expect(options.map((o) => o.textContent)).toEqual(["DE", "EN", "FR", "IT"]);
  });

  it("switches the UI language, persists it, and updates <html lang>", async () => {
    renderNav();
    const picker = screen.getAllByLabelText(
      "Switch language",
    )[0] as HTMLSelectElement;
    fireEvent.change(picker, { target: { value: "fr" } });

    // Same persistence contract as the storefront switcher.
    expect(localStorage.getItem("kalakosh_lang")).toBe("fr");
    expect(document.documentElement.lang).toBe("fr-CH");
    // The nav itself re-renders in French.
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Tarifs" })).toBeTruthy(),
    );
    expect(screen.queryByRole("link", { name: "Pricing" })).toBeNull();
  });

  it("is reachable from the mobile sheet too", async () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByLabelText("Switch language")).toBeTruthy();
  });
});

// Before this, the nav showed "Go to your store" and nothing else once a
// session existed — so a visitor whose browser carried somebody's Google
// session could not tell who they were, nor become anyone else.
describe("MarketingNav — the signed-in account is visible and escapable", () => {
  beforeEach(() => {
    mocks.meData = { id: 1, email: "anna@bergblume.ch" };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
  });

  it("names the signed-in account", () => {
    renderNav();
    expect(screen.getAllByText("anna@bergblume.ch").length).toBeGreaterThan(0);
  });

  it("offers sign out alongside the store shortcut", () => {
    renderNav();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    // The shortcut sits in both the desktop and the mobile slot; each is
    // hidden at the other's breakpoint, so only one is ever on screen.
    expect(
      screen.getAllByRole("link", { name: /go to your store|my store/i })
        .length,
    ).toBe(2);
  });

  it("still offers sign out when the account owns no store", () => {
    // StoreShortcut renders nothing here; the way out must not vanish with it.
    mocks.storeData = null;
    renderNav();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("shows neither account nor sign out while auth is still resolving", () => {
    mocks.meData = undefined;
    mocks.meLoading = true;
    renderNav();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  it("shows no sign out to a logged-out visitor", () => {
    mocks.meData = undefined;
    mocks.storeData = undefined;
    renderNav();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
    expect(
      screen.getAllByRole("link", { name: /sign in/i }).length,
    ).toBeGreaterThan(0);
  });

  it("reaches sign out from the mobile drawer, where the bar is compact", () => {
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /open menu|menu/i }));
    const drawerText = document.body.textContent ?? "";
    expect(drawerText).toMatch(/Signed in as anna@bergblume\.ch/);
  });
});

describe("MarketingFooter", () => {
  function renderFooter() {
    const { hook } = memoryLocation({ path: "/", static: true });
    return render(
      <Router hook={hook}>
        <MarketingFooter />
      </Router>,
    );
  }

  it("carries the origin and hosting location on every page", () => {
    // The footer is the one surface a visitor sees regardless of route, so
    // where Zolto is from — and where it runs — lives here as well as on the
    // landing band, with a link to the row-by-row version.
    const { container } = renderFooter();
    const text = container.textContent ?? "";
    expect(text).toContain(SOVEREIGNTY.headline);
    expect(text).toContain(DATA_RESIDENCY.region);
    expect(text).toContain(DATA_RESIDENCY.primaryCountry);
    expect(
      screen
        .getByRole("link", { name: /what runs where/i })
        .getAttribute("href"),
    ).toBe(SOVEREIGNTY.href);
  });

  it("offers the Swissness page from the main nav too", () => {
    // Prominence is the point: a claim reachable only from the homepage band
    // is not a claim a returning visitor can find again.
    renderNav();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(
      within(nav).getByRole("link", { name: /swiss/i }).getAttribute("href"),
    ).toBe(SOVEREIGNTY.href);
  });

  it("still links the legal pages", () => {
    renderFooter();
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/legal/privacy");
    expect(hrefs).toContain("/legal/terms");
  });
});

describe("MarketingShell", () => {
  function renderShell(path: string) {
    const { hook } = memoryLocation({ path, static: true });
    return render(
      <Router hook={hook}>
        <MarketingShell>
          <p>the page</p>
        </MarketingShell>
      </Router>,
    );
  }

  it("gives every page a main landmark and the footer, homepage included", () => {
    // The homepage reel briefly rendered its own copy of both, because it
    // snapped inside a nested scroller whose overscroll-contain made an outside
    // footer unreachable. Snapping moved to the document scroller, so the
    // footer is ordinary content below the last chapter again.
    for (const path of ["/", "/pricing"]) {
      const { container, unmount } = renderShell(path);
      expect(container.querySelectorAll("main").length, path).toBe(1);
      expect(container.querySelectorAll("footer").length, path).toBe(1);
      expect(screen.getByText("the page")).toBeTruthy();
      unmount();
    }
  });

  it("sizes the nav from the token the reel measures against", () => {
    // A bar that grew without --nav-height following would leave every panel
    // short by the difference, and a second panel peeking in at the bottom.
    const { container } = renderShell("/pricing");
    expect(container.querySelector("header div")?.className).toContain(
      "h-[var(--nav-height)]",
    );
  });
});

describe("theme switch", () => {
  /**
   * The shipped default is "system", so what the bar opens on is decided by the
   * OS — and jsdom has no matchMedia at all. Stub it deliberately rather than
   * leaning on the fallback, or these tests silently re-assert whatever
   * `window.matchMedia?.(…) ?? false` happens to mean today.
   */
  function stubOsPrefersDark(prefersDark: boolean) {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: prefersDark,
        media: "(prefers-color-scheme: dark)",
        addEventListener: () => {},
        removeEventListener: () => {},
      })),
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("data-light");
  });

  function renderShellWithTheme() {
    const { hook } = memoryLocation({ path: "/pricing", static: true });
    return render(
      <Router hook={hook}>
        <MarketingShell>
          <p>the page</p>
        </MarketingShell>
      </Router>,
    );
  }

  it("puts a switch in the bar that repaints the document", () => {
    stubOsPrefersDark(true);
    renderShellWithTheme();
    const toggle = screen.getAllByTestId("theme-toggle")[0];
    expect(toggle.getAttribute("data-theme-state")).toBe("dark");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);

    fireEvent.click(toggle);
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(
      screen.getAllByTestId("theme-toggle")[0].getAttribute("data-theme-state"),
    ).toBe("light");
  });

  /**
   * The bar is the one place the default is visible, so it is worth asserting
   * here as well as in theme.test.ts: a visitor arriving with an ordinary
   * light-mode OS gets the light surface without touching anything.
   */
  it("opens light, unasked, for a visitor whose OS is not in dark mode", () => {
    stubOsPrefersDark(false);
    renderShellWithTheme();
    expect(
      screen.getAllByTestId("theme-toggle")[0].getAttribute("data-theme-state"),
    ).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  /**
   * The label names the theme the button switches *to*, and the icon says the
   * same thing — an unlabelled sun is ambiguous to a screen reader in a way it
   * isn't to an eye, so the label is the whole affordance for some visitors.
   */
  it("labels itself with the theme it will switch to", () => {
    stubOsPrefersDark(true);
    renderShellWithTheme();
    const toggle = screen.getAllByTestId("theme-toggle")[0];
    expect(toggle.getAttribute("aria-label")).toMatch(/light/i);
    fireEvent.click(toggle);
    expect(
      screen.getAllByTestId("theme-toggle")[0].getAttribute("aria-label"),
    ).toMatch(/dark/i);
  });

  /**
   * The phone bar collapses its links into the sheet, and a control that is
   * only in the desktop row is a control a phone cannot reach — which is how
   * the language picker was unreachable before it moved into the drawer too.
   */
  it("is reachable from the mobile sheet as well as the bar", async () => {
    stubOsPrefersDark(false);
    renderNav();
    fireEvent.click(screen.getByRole("button", { name: /menu/i }));
    await waitFor(() =>
      expect(screen.getAllByTestId("theme-toggle").length).toBeGreaterThan(1),
    );
  });
});

describe("BrushMark", () => {
  /**
   * The lockup is one shape in three themeable fills rather than one SVG per
   * theme; hardcoding a hex back in would silently pin the mark to mahogany
   * while every palette around it moved.
   */
  it("takes its colours from the logo tokens, with today's as fallbacks", () => {
    const { container } = render(<BrushMark className="h-8 w-8" />);
    const svg = container.querySelector("svg")!;
    expect(svg.querySelector("rect")?.getAttribute("fill")).toBe(
      "var(--logo-tile, #2D2620)",
    );
    expect(svg.querySelector("path")?.getAttribute("fill")).toBe(
      "var(--logo-mark, #B8963E)",
    );
    expect(svg.querySelector("circle")?.getAttribute("fill")).toBe(
      "var(--logo-dot, #F0EBE3)",
    );
  });

  it("keeps the ring inside the 200×200 box so it cannot bleed", () => {
    // A stroke straddles the path, so a rect at 0,0/200×200 would lose half its
    // hairline to the viewBox edge — visible as a ring open on all four sides.
    const { container } = render(<BrushMark />);
    const rect = container.querySelector("rect")!;
    expect(rect.getAttribute("x")).toBe("0.75");
    expect(Number(rect.getAttribute("width"))).toBeLessThan(200);
  });
});
