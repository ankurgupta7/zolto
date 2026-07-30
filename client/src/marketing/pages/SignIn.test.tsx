import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import SignIn, { SIGNIN_RETURN_PATH } from "./SignIn";

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

// jsdom's window.location is non-configurable, so the redirect goes through an
// injectable helper (see lib/navigate) that we can assert on here.
vi.mock("@/lib/navigate", () => ({ hardRedirect: vi.fn() }));

import { hardRedirect } from "@/lib/navigate";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.meData = undefined;
  mocks.meLoading = false;
  mocks.storeData = undefined;
  mocks.storeLoading = false;
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

describe("SignIn — leg 1: handing off to the identity provider", () => {
  it("waits for the auth check rather than bouncing on first paint", () => {
    mocks.meLoading = true;
    renderSignIn();
    expect(hardRedirect).not.toHaveBeenCalled();
    expect(screen.getByText(/signing you in/i)).toBeTruthy();
  });

  it("sends a logged-out visitor to OAuth, asking to come back here", async () => {
    renderSignIn();
    await waitFor(() => expect(hardRedirect).toHaveBeenCalledTimes(1));
    const [url, opts] = vi.mocked(hardRedirect).mock.calls[0];
    expect(url).toContain("/api/oauth/login");
    expect(url).toContain(`next=${encodeURIComponent(SIGNIN_RETURN_PATH)}`);
    // A bounce page must not linger in the back stack.
    expect(opts).toEqual({ replace: true });
  });
});

describe("SignIn — leg 2: landing in the merchant's own admin", () => {
  it("redirects a signed-in merchant straight to their store admin", async () => {
    mocks.meData = { id: 1 };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
    renderSignIn();
    await waitFor(() =>
      expect(hardRedirect).toHaveBeenCalledWith(
        // jsdom host is localhost → same-origin, surface-forced form.
        "/admin?surface=storefront&tenant=kalakosh",
        { replace: true },
      ),
    );
  });

  it("holds steady while the store lookup is in flight", () => {
    mocks.meData = { id: 1 };
    mocks.storeLoading = true;
    renderSignIn();
    expect(hardRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("signin-progress")).toBeTruthy();
  });

  it("names the destination once the store is known", () => {
    mocks.meData = { id: 1 };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
    renderSignIn();
    expect(screen.getByText(/Taking you to Kalakosh/i)).toBeTruthy();
  });
});

describe("SignIn — a signed-in account with no store", () => {
  beforeEach(() => {
    mocks.meData = { id: 1 };
    mocks.storeData = null;
  });

  it("offers store creation instead of redirecting nowhere", () => {
    renderSignIn();
    expect(hardRedirect).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole("link", { name: /create your store/i })
        .getAttribute("href"),
    ).toBe("/signup");
  });

  it("does not present this as a failure", () => {
    renderSignIn();
    expect(screen.getByText(/You're signed in/i)).toBeTruthy();
    expect(screen.queryByText(/couldn.t sign you in/i)).toBeNull();
  });
});

describe("SignIn — the OAuth round-trip guard", () => {
  it("does not bounce again after returning from a failed handshake", async () => {
    // Without the ?from=oauth marker this state would redirect to the provider
    // forever, since each return re-enters the page unauthenticated.
    renderSignIn(SIGNIN_RETURN_PATH);
    await waitFor(() =>
      expect(screen.getByText(/couldn.t sign you in/i)).toBeTruthy(),
    );
    expect(hardRedirect).not.toHaveBeenCalled();
  });

  it("explains the usual cause and offers a manual retry", () => {
    renderSignIn(SIGNIN_RETURN_PATH);
    expect(screen.getByText(/blocking cookies/i)).toBeTruthy();
    const retry = screen.getByRole("link", { name: /try again/i });
    expect(retry.getAttribute("href")).toContain("/api/oauth/login");
  });

  it("still completes the trip when the handshake did work", async () => {
    // Same marked URL, but the session landed — the marker must not block leg 2.
    mocks.meData = { id: 1 };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
    renderSignIn(SIGNIN_RETURN_PATH);
    await waitFor(() =>
      expect(hardRedirect).toHaveBeenCalledWith(
        "/admin?surface=storefront&tenant=kalakosh",
        { replace: true },
      ),
    );
  });
});
