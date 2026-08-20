import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  downloads: undefined as { android: unknown; ios: unknown } | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      posDownloads: {
        useQuery: () => ({ data: mocks.downloads, isLoading: false }),
      },
    },
  },
}));

import PosPair from "./PosPair";

// jsdom logs "Not implemented: navigation to another Document" for each render
// here. That is the page's deliberate auto-open of the gwinn:// scheme, which
// jsdom cannot follow — expected noise, not a failure.

/** The page reads the token straight off the URL, so tests set the URL. */
function visit(search: string) {
  window.history.replaceState({}, "", `/pos/pair${search}`);
}

beforeEach(() => {
  mocks.downloads = {
    android: {
      url: "https://x.test/GwinnPOS-latest.apk",
      requiresSideload: false,
    },
    ios: {
      url: "https://x.test/GwinnPOS-latest-unsigned.ipa",
      requiresSideload: true,
    },
  };
  visit("?t=tok123");
});
afterEach(() => {
  cleanup();
  visit("");
});

// This page exists for the case that matters most: the merchant taps the pairing
// link on a till phone that doesn't have the app yet. Without it, that tap does
// nothing and reads as a broken link.
describe("PosPair", () => {
  it("offers to open the app via the gwinn:// scheme", () => {
    render(<PosPair />);
    const link = screen.getByText(/Open in Gwinn POS/).closest("a");
    const href = link?.getAttribute("href") ?? "";
    expect(href.startsWith("gwinn://pair?t=tok123")).toBe(true);
  });

  it("passes the server origin along, since a fresh install knows no host", () => {
    render(<PosPair />);
    const href =
      screen
        .getByText(/Open in Gwinn POS/)
        .closest("a")
        ?.getAttribute("href") ?? "";
    expect(href).toContain(`url=${encodeURIComponent(window.location.origin)}`);
  });

  it("offers the downloads for a device without the app", () => {
    render(<PosPair />);
    const hrefs = screen
      .getAllByText(/Get it for/)
      .map((el) => el.closest("a")?.getAttribute("href"));
    expect(hrefs).toContain("https://x.test/GwinnPOS-latest.apk");
    expect(hrefs).toContain("https://x.test/GwinnPOS-latest-unsigned.ipa");
  });

  it("warns that a link will have expired by the time the app is installed", () => {
    render(<PosPair />);
    expect(screen.getByText(/expire after a few minutes/)).toBeTruthy();
  });

  it("renders without downloads, since the till phone is not signed in", () => {
    // tenant.posDownloads sits behind auth, so an unauthenticated visit gets
    // nothing back — the page must still show the open-app button.
    mocks.downloads = undefined;
    render(<PosPair />);
    expect(screen.getByText(/Open in Gwinn POS/)).toBeTruthy();
    expect(screen.queryByText(/Get it for/)).toBeNull();
  });

  it("explains a link with no token instead of offering a broken button", () => {
    visit("");
    render(<PosPair />);
    expect(screen.getByText(/pairing link is incomplete/)).toBeTruthy();
    expect(screen.queryByText(/Open in Gwinn POS/)).toBeNull();
  });

  it("never displays the token itself", () => {
    // The token is a credential in transit: hand it to the app, don't print it.
    render(<PosPair />);
    const visible = document.body.innerText ?? document.body.textContent ?? "";
    expect(visible).not.toContain("tok123");
  });
});
