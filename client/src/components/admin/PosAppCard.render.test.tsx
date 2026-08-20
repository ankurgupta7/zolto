import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("wouter", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

interface Download {
  url: string;
  requiresSideload: boolean;
  sizeBytes?: number;
  builtAt?: string;
  commit?: string;
}

const mocks = vi.hoisted(() => ({
  downloads: undefined as { android: unknown; ios: unknown } | undefined,
  isLoading: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      posDownloads: {
        useQuery: () => ({
          data: mocks.downloads,
          isLoading: mocks.isLoading,
        }),
      },
    },
  },
}));

import PosAppCard from "./PosAppCard";

const APK: Download = {
  url: "https://github.com/ankurgupta7/gwinn/releases/download/pos-latest/GwinnPOS-latest.apk",
  requiresSideload: false,
  sizeBytes: 9_200_000,
  builtAt: "2026-08-09T10:00:00Z",
  commit: "3f2a1bc",
};
const IPA: Download = {
  url: "https://github.com/ankurgupta7/gwinn/releases/download/pos-latest/GwinnPOS-latest-unsigned.ipa",
  requiresSideload: true,
  sizeBytes: 21_000_000,
  builtAt: "2026-08-09T10:00:00Z",
  commit: "3f2a1bc",
};

beforeEach(() => {
  mocks.downloads = { android: APK, ios: IPA };
  mocks.isLoading = false;
});
afterEach(() => cleanup());

// The published build is what a merchant standing at a stall actually needs, so
// the link has to be real and has to say which build it is.
describe("PosAppCard — published build", () => {
  it("links both platforms at the rolling main build", () => {
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    const links = screen
      .getAllByText(/Get it for/)
      .map((el) => el.closest("a")?.getAttribute("href"));
    expect(links).toContain(APK.url);
    expect(links).toContain(IPA.url);
  });

  it("stamps each link with size, build date and commit", () => {
    // Which build a merchant is running is the first thing support needs.
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    const stamps = screen.getAllByText(/3f2a1bc/);
    expect(stamps.length).toBe(2);
    expect(stamps[0].textContent).toMatch(/9\.2 MB/);
  });

  it("says plainly that the iPhone build must be sideloaded", () => {
    // The IPA is unsigned, so it cannot install from a tap. Implying an App
    // Store install would leave a merchant with a file they can't open.
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    expect(screen.getByText(/not signed by Apple/)).toBeTruthy();
    expect(screen.getByText(/AltStore or Sideloadly/)).toBeTruthy();
  });

  it("does not claim the Android build needs sideloading", () => {
    mocks.downloads = { android: APK, ios: null };
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    expect(screen.queryByText(/AltStore or Sideloadly/)).toBeNull();
  });

  it("points at one-tap pairing as the way to skip the manual steps", () => {
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    expect(screen.getByText(/generate a pairing link/i)).toBeTruthy();
  });
});

// A merchant who taps a broken store link concludes the POS does not exist, so
// an absent build must never render as a button.
describe("PosAppCard — before a platform is published", () => {
  it("says so instead of linking nowhere", () => {
    mocks.downloads = { android: null, ios: null };
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    expect(screen.getByText(/Android — not published yet/)).toBeTruthy();
    expect(screen.getByText(/iPhone — not published yet/)).toBeTruthy();
    expect(screen.queryByText(/Get it for/)).toBeNull();
  });

  it("tells the merchant the rest of the page still works", () => {
    mocks.downloads = { android: null, ios: null };
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    expect(screen.getByText(/still in testing/i)).toBeTruthy();
  });

  it("handles one platform published and the other not", () => {
    mocks.downloads = { android: APK, ios: null };
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    expect(screen.getByText(/Get it for Android/)).toBeTruthy();
    expect(screen.getByText(/iPhone — not published yet/)).toBeTruthy();
    // The "still in testing" note is about having nothing at all.
    expect(screen.queryByText(/still in testing/i)).toBeNull();
  });

  it("shows a checking state rather than a wrong answer while loading", () => {
    mocks.downloads = undefined;
    mocks.isLoading = true;
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    expect(screen.getByText(/Checking for a Android build/)).toBeTruthy();
    expect(screen.queryByText(/not published yet/)).toBeNull();
  });
});

describe("PosAppCard — manual pairing details", () => {
  it("shows the server address the app asks for on first launch", () => {
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    expect(screen.getByText("https://bergblume.gwinn.ch")).toBeTruthy();
    expect(screen.getByLabelText("Copy server address")).toBeTruthy();
  });

  it("sends the merchant to Keys & access for the credential, not this page", () => {
    // The POS API key is a bearer credential; it belongs on the keys page,
    // which is where rotation and one-time reveal already live.
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    // By role, not by text: the one-tap pairing hint below also names
    // "Keys & access", and only one of the two is the actual link.
    const link = screen.getByRole("link", { name: /Keys & access/ });
    expect(link.getAttribute("href")).toBe("/admin/account/keys");
  });

  it("never renders the key itself", () => {
    render(<PosAppCard serverUrl="https://bergblume.gwinn.ch" />);
    expect(document.body.textContent).not.toMatch(/pos_[A-Za-z0-9]/);
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{64}/);
  });
});
