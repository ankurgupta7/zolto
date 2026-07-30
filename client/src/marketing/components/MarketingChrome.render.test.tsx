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
import { MarketingNav, StoreShortcut, signInHref } from "./MarketingChrome";

const mocks = vi.hoisted(() => ({
  meData: undefined as unknown,
  meLoading: false,
  storeData: undefined as unknown,
  storeLoading: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({ data: mocks.meData, isLoading: mocks.meLoading }),
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

describe("signInHref", () => {
  it("points at the server OAuth route, not the new-store signup form", () => {
    const href = signInHref();
    expect(href.startsWith("/api/oauth/login")).toBe(true);
    expect(href).not.toContain("/signup");
  });

  it("asks to return the visitor to the page they started from", () => {
    const href = signInHref();
    expect(href).toContain(`next=${encodeURIComponent(window.location.href)}`);
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
    expect(signIn.getAttribute("href")).toBe(signInHref());
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
    ).toBe(signInHref());
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
