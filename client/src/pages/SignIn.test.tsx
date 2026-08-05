import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import SignIn from "./SignIn";

const mocks = vi.hoisted(() => ({
  meData: undefined as unknown,
  meLoading: false,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({ data: mocks.meData, isLoading: mocks.meLoading }),
      },
      requestMagicLink: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
        }),
      },
    },
  },
}));

vi.mock("@/lib/navigate", () => ({ hardRedirect: vi.fn() }));

import { hardRedirect } from "@/lib/navigate";

// jsdom's origin.
const ORIGIN = "http://localhost:3000";

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.meData = undefined;
  mocks.meLoading = false;
  await i18n.changeLanguage("en");
});
afterEach(() => cleanup());

function renderSignIn(path = "/signin") {
  const { hook, searchHook } = memoryLocation({ path, static: true });
  return render(
    <Router hook={hook} searchHook={searchHook}>
      <SignIn />
    </Router>,
  );
}

describe("SignIn (storefront) — offering every method", () => {
  it("shows Google, Apple, and email rather than bouncing to one provider", () => {
    renderSignIn();
    expect(hardRedirect).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: /continue with google/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /continue with apple/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /continue with email/i }),
    ).toBeTruthy();
  });

  it("carries the requested page through as an absolute return url", () => {
    renderSignIn("/signin?next=%2Fadmin%2Fbilling");
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).toContain(
      `next=${encodeURIComponent(`${ORIGIN}/admin/billing`)}`,
    );
  });

  it("falls back to the admin panel when no next is given", () => {
    renderSignIn();
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).toContain(
      `next=${encodeURIComponent(`${ORIGIN}/admin`)}`,
    );
  });

  it("ignores an off-origin next instead of forwarding it to the provider", () => {
    renderSignIn("/signin?next=https%3A%2F%2Fevil.example.com%2F");
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).not.toContain("evil.example.com");
    expect(google.getAttribute("href")).toContain(
      `next=${encodeURIComponent(`${ORIGIN}/admin`)}`,
    );
  });

  it("waits for the auth check rather than flashing the form", () => {
    mocks.meLoading = true;
    renderSignIn();
    expect(
      screen.queryByRole("link", { name: /continue with google/i }),
    ).toBeNull();
  });
});

// The page's own copy is one `admin`-namespace lookup away from a raw key, so
// pin that the account fragment actually resolves in a non-default language
// rather than falling back to English (or rendering "catalog.account.…").
describe("SignIn (storefront) — translated", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("renders its heading and blurb in German", async () => {
    await act(async () => {
      await i18n.changeLanguage("de");
    });
    renderSignIn();
    expect(screen.getByText("Zum Fortfahren anmelden")).toBeTruthy();
    expect(
      screen.getByText(
        "Ihre Sitzung ist abgelaufen. Melden Sie sich an, und wir bringen Sie zurück zu dem, was Sie gerade getan haben.",
      ),
    ).toBeTruthy();
  });
});

describe("SignIn (storefront) — an already-valid session", () => {
  it("returns a signed-in visitor to where they came from", async () => {
    mocks.meData = { id: 1 };
    renderSignIn("/signin?next=%2Fadmin%2Fbilling");
    await waitFor(() =>
      expect(hardRedirect).toHaveBeenCalledWith(`${ORIGIN}/admin/billing`, {
        replace: true,
      }),
    );
  });

  it("never redirects a signed-in visitor off-origin", async () => {
    mocks.meData = { id: 1 };
    renderSignIn("/signin?next=https%3A%2F%2Fevil.example.com%2F");
    await waitFor(() => expect(hardRedirect).toHaveBeenCalled());
    expect(hardRedirect).toHaveBeenCalledWith(`${ORIGIN}/admin`, {
      replace: true,
    });
  });
});
