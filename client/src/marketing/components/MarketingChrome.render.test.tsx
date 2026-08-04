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
import { MarketingNav, StoreShortcut, SIGN_IN_PATH } from "./MarketingChrome";
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
    expect(options.map((o) => o.textContent)).toEqual([
      "DE",
      "EN",
      "FR",
      "IT",
    ]);
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
