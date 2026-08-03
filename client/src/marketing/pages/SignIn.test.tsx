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
  pendingData: undefined as unknown,
  pendingLoading: false,
  logout: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    // SignOutButton → useAuth needs these; the page itself uses neither.
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
      requestMagicLink: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
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
      pendingClaim: {
        useQuery: () => ({
          data: mocks.pendingData,
          isLoading: mocks.pendingLoading,
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
  mocks.pendingData = undefined;
  mocks.pendingLoading = false;
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

describe("SignIn — leg 1: offering every sign-in method", () => {
  it("waits for the auth check rather than showing options on first paint", () => {
    mocks.meLoading = true;
    renderSignIn();
    expect(hardRedirect).not.toHaveBeenCalled();
    expect(screen.getByText(/signing you in/i)).toBeTruthy();
  });

  it("offers Google, Apple, and email to a logged-out visitor, each returning here", () => {
    renderSignIn();
    expect(hardRedirect).not.toHaveBeenCalled();
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).toContain("/api/oauth/login");
    expect(google.getAttribute("href")).toContain(
      `next=${encodeURIComponent(SIGNIN_RETURN_PATH)}`,
    );
    const apple = screen.getByRole("link", { name: /continue with apple/i });
    expect(apple.getAttribute("href")).toContain("/api/oauth/apple/login");
    expect(apple.getAttribute("href")).toContain(
      `next=${encodeURIComponent(SIGNIN_RETURN_PATH)}`,
    );
    expect(
      screen.getByRole("button", { name: /continue with email/i }),
    ).toBeTruthy();
  });
});

// Leg 2 fires only on the return leg of a handshake the visitor just performed
// — see "the OAuth round-trip" below. Arriving with a session that ALREADY
// existed is a different intent and must not be redirected silently.
describe("SignIn — leg 2: landing in the merchant's own admin", () => {
  it("holds steady while the store lookup is in flight", () => {
    mocks.meData = { id: 1 };
    mocks.storeLoading = true;
    renderSignIn(SIGNIN_RETURN_PATH);
    expect(hardRedirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("signin-progress")).toBeTruthy();
  });

  it("names the destination once the store is known", () => {
    mocks.meData = { id: 1 };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
    renderSignIn(SIGNIN_RETURN_PATH);
    expect(screen.getByText(/Taking you to Kalakosh/i)).toBeTruthy();
  });
});

// The reported bug: a browser carrying somebody's Google session could never
// be used to sign in as anyone else, because /signin saw the existing session
// and bounced onward before offering any choice.
describe("SignIn — arriving with a session that already existed", () => {
  beforeEach(() => {
    mocks.meData = { id: 1, email: "anna@bergblume.ch" };
    mocks.storeData = { slug: "kalakosh", name: "Kalakosh" };
  });

  it("does not redirect — signing in is the visitor's decision to make", async () => {
    renderSignIn();
    await waitFor(() =>
      expect(screen.getByText(/already signed in/i)).toBeTruthy(),
    );
    expect(hardRedirect).not.toHaveBeenCalled();
  });

  it("names the account, so a wrong one is visible rather than invisible", () => {
    renderSignIn();
    expect(screen.getByText("anna@bergblume.ch")).toBeTruthy();
  });

  it("offers continuing on, naming where that goes", () => {
    renderSignIn();
    const go = screen.getByRole("link", { name: /continue to kalakosh/i });
    expect(go.getAttribute("href")).toBe(
      "/admin?surface=storefront&tenant=kalakosh",
    );
  });

  it("offers signing out to use a different account", async () => {
    renderSignIn();
    screen.getByRole("button", { name: /use a different account/i }).click();
    await waitFor(() => expect(mocks.logout).toHaveBeenCalled());
  });

  it("returns to sign-in after signing out, not to the marketing home", async () => {
    renderSignIn();
    screen.getByRole("button", { name: /use a different account/i }).click();
    await waitFor(() => expect(hardRedirect).toHaveBeenCalledWith("/signin"));
  });
});

describe("SignIn — a signed-in account with no store", () => {
  beforeEach(() => {
    mocks.meData = { id: 1, email: "anna@bergblume.ch" };
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

  // Reached by completing a handshake with an account that owns nothing yet.
  it("does not present this as a failure on the OAuth return leg", () => {
    renderSignIn(SIGNIN_RETURN_PATH);
    expect(screen.getByText(/You're signed in/i)).toBeTruthy();
    expect(screen.queryByText(/couldn.t sign you in/i)).toBeNull();
  });
});

// The lost-claim-token recovery: signup created the store, but the sign-in
// that was meant to claim it failed (or happened on another device), so the
// sessionStorage token is gone. Signing in with the signup email must surface
// the waiting store — not a "create your store" dead end whose signup would
// only refuse the email as already taken.
describe("SignIn — a signed-in account with an unclaimed store waiting", () => {
  beforeEach(() => {
    mocks.meData = { id: 1, email: "anna@bergblume.ch" };
    mocks.storeData = null;
    mocks.pendingData = { slug: "bergblume", name: "Bergblume" };
  });

  it("offers finishing setup instead of a second signup, on the OAuth return leg", () => {
    renderSignIn(SIGNIN_RETURN_PATH);
    expect(screen.getByText(/your store is waiting/i)).toBeTruthy();
    const finish = screen.getByRole("link", {
      name: /finish setting up Bergblume/i,
    });
    expect(finish.getAttribute("href")).toBe("/onboarding?store=bergblume");
    expect(
      screen.queryByRole("link", { name: /create your store/i }),
    ).toBeNull();
  });

  it("offers finishing setup on a deliberate visit too", () => {
    renderSignIn();
    expect(screen.getByText(/already signed in/i)).toBeTruthy();
    const finish = screen.getByRole("link", {
      name: /finish setting up Bergblume/i,
    });
    expect(finish.getAttribute("href")).toBe("/onboarding?store=bergblume");
  });

  it("holds the spinner while the pending lookup is in flight, rather than flashing the wrong door", () => {
    mocks.pendingData = undefined;
    mocks.pendingLoading = true;
    renderSignIn(SIGNIN_RETURN_PATH);
    expect(screen.getByTestId("signin-progress")).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: /create your store/i }),
    ).toBeNull();
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

  it("explains the usual cause and offers every method again", () => {
    renderSignIn(SIGNIN_RETURN_PATH);
    expect(screen.getByText(/blocking cookies/i)).toBeTruthy();
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).toContain("/api/oauth/login");
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
