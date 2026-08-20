import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Onboarding from "./Onboarding";

/**
 * The claim step is where the signup catch-22 used to live: the claim token
 * only exists in the signup tab's sessionStorage, so a failed sign-in or a
 * second device lost it — the store existed, signup refused the email as
 * already taken, and signing in attached the merchant to nothing. These tests
 * pin both halves: the token happy path, and the email-match recovery
 * (tenant.pendingClaim / tenant.resumeClaim) that makes a lost token
 * survivable.
 */

const CLAIM_TOKEN_KEY = "gwinn_claim_token";

const mocks = vi.hoisted(() => ({
  meData: undefined as unknown,
  pendingData: undefined as unknown,
  pendingLoading: false,
  claimMutate: vi.fn(),
  resumeMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: mocks.meData, isLoading: false }) },
      requestMagicLink: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
        }),
      },
    },
    tenant: {
      claimAdmin: { useMutation: () => ({ mutate: mocks.claimMutate }) },
      resumeClaim: { useMutation: () => ({ mutate: mocks.resumeMutate }) },
      pendingClaim: {
        useQuery: () => ({
          data: mocks.pendingData,
          isLoading: mocks.pendingLoading,
        }),
      },
      onboardingStatus: {
        useQuery: () => ({
          data: {
            tasks: [],
            doneCount: 0,
            totalCount: 1,
            allDone: false,
            cursor: 2,
          },
        }),
      },
      setOnboardingCursor: { useMutation: () => ({ mutate: vi.fn() }) },
    },
  },
}));

type MutateCbs<T> = {
  onSuccess?: (data: T) => void;
  onError?: (err: unknown) => void;
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  mocks.meData = undefined;
  mocks.pendingData = undefined;
  mocks.pendingLoading = false;
});
afterEach(() => cleanup());

function renderOnboarding(path = "/onboarding?store=kalakosh") {
  const { hook, searchHook } = memoryLocation({ path, static: true });
  return render(
    <Router hook={hook} searchHook={searchHook}>
      <Onboarding />
    </Router>,
  );
}

describe("Onboarding — claiming a fresh store", () => {
  it("offers Google, Apple, and email instead of a Google-only dead end", () => {
    sessionStorage.setItem(CLAIM_TOKEN_KEY, "a-claim-token");
    renderOnboarding();
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).toContain(
      `next=${encodeURIComponent("/onboarding?store=kalakosh")}`,
    );
    expect(
      screen.getByRole("link", { name: /continue with apple/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /continue with email/i }),
    ).toBeTruthy();
  });

  it("redeems the token automatically once signed in, then clears it", async () => {
    sessionStorage.setItem(CLAIM_TOKEN_KEY, "tok-abc");
    mocks.meData = { id: 1, email: "owner@kalakosh.example" };
    mocks.claimMutate.mockImplementation(
      (_vars: { token: string }, cbs: MutateCbs<{ slug: string | null }>) =>
        cbs.onSuccess?.({ slug: "kalakosh" }),
    );

    renderOnboarding();

    await waitFor(() =>
      expect(screen.getByText(/you're the store admin/i)).toBeTruthy(),
    );
    expect(mocks.claimMutate).toHaveBeenCalledWith(
      { token: "tok-abc" },
      expect.anything(),
    );
    expect(sessionStorage.getItem(CLAIM_TOKEN_KEY)).toBeNull();
    expect(
      screen
        .getByRole("link", { name: /go to your dashboard/i })
        .getAttribute("href"),
    ).toContain("kalakosh");
  });

  // The emailed claim link (tenant.create step 8) carries the token in the
  // URL, so it works in a tab with no sessionStorage — the durable copy.
  it("redeems a token carried by the emailed claim link", async () => {
    mocks.meData = { id: 1, email: "owner@kalakosh.example" };
    mocks.claimMutate.mockImplementation(
      (_vars: { token: string }, cbs: MutateCbs<{ slug: string | null }>) =>
        cbs.onSuccess?.({ slug: "kalakosh" }),
    );

    renderOnboarding("/onboarding?store=kalakosh&claim=tok-from-email");

    await waitFor(() =>
      expect(screen.getByText(/you're the store admin/i)).toBeTruthy(),
    );
    expect(mocks.claimMutate).toHaveBeenCalledWith(
      { token: "tok-from-email" },
      expect.anything(),
    );
  });

  it("carries the emailed token through the sign-in round-trip", () => {
    renderOnboarding("/onboarding?store=kalakosh&claim=tok-from-email");
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).toContain(
      encodeURIComponent("/onboarding?store=kalakosh&claim=tok-from-email"),
    );
  });
});

describe("Onboarding — recovery when the token is refused", () => {
  it("falls back to the email-matched store and resumes on click", async () => {
    sessionStorage.setItem(CLAIM_TOKEN_KEY, "tok-stale");
    mocks.meData = { id: 1, email: "owner@kalakosh.example" };
    mocks.pendingData = { slug: "kalakosh", name: "Kalakosh" };
    mocks.claimMutate.mockImplementation(
      (_vars: unknown, cbs: MutateCbs<never>) =>
        cbs.onError?.(new Error("Invalid or already-claimed invitation")),
    );
    mocks.resumeMutate.mockImplementation(
      (_vars: unknown, cbs: MutateCbs<{ slug: string | null }>) =>
        cbs.onSuccess?.({ slug: "kalakosh" }),
    );

    renderOnboarding();

    const finish = await screen.findByRole("button", {
      name: /finish setting up Kalakosh/i,
    });
    expect(screen.getByText(/didn't work/i)).toBeTruthy();
    fireEvent.click(finish);
    await waitFor(() =>
      expect(screen.getByText(/you're the store admin/i)).toBeTruthy(),
    );
    expect(mocks.resumeMutate).toHaveBeenCalled();
  });

  it("shows the dead-end card only when no store matches the email either", async () => {
    sessionStorage.setItem(CLAIM_TOKEN_KEY, "tok-stale");
    mocks.meData = { id: 1, email: "owner@kalakosh.example" };
    mocks.pendingData = null;
    mocks.claimMutate.mockImplementation(
      (_vars: unknown, cbs: MutateCbs<never>) =>
        cbs.onError?.(new Error("Invalid or already-claimed invitation")),
    );

    renderOnboarding();

    await waitFor(() =>
      expect(screen.getByText(/couldn't finish setting you up/i)).toBeTruthy(),
    );
    expect(
      screen.queryByRole("button", { name: /finish setting up/i }),
    ).toBeNull();
  });

  // The server's actual refusal must reach the merchant. The production bug
  // where every fresh sign-in was parked on the platform tenant surfaced as a
  // CONFLICT ("already manages a store") but rendered as "claim link is
  // invalid" — undiagnosable from the phone it happened on.
  it("surfaces the server's refusal instead of generic invalid-link copy", async () => {
    sessionStorage.setItem(CLAIM_TOKEN_KEY, "tok-abc");
    mocks.meData = { id: 1, email: "owner@kalakosh.example" };
    mocks.pendingData = null;
    mocks.claimMutate.mockImplementation(
      (_vars: unknown, cbs: MutateCbs<never>) =>
        cbs.onError?.(
          new Error(
            "This account already manages a store. Sign in with a different account to claim this one.",
          ),
        ),
    );

    renderOnboarding();

    await waitFor(() =>
      expect(
        screen.getByText(/this account already manages a store/i),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/claim link is invalid/i)).toBeNull();
  });
});

describe("Onboarding — recovery when the token never made it here", () => {
  // New tab, new device, cleared storage: the store exists, the token doesn't.
  it("offers to resume the email-matched store for a signed-in owner", async () => {
    mocks.meData = { id: 1, email: "owner@kalakosh.example" };
    mocks.pendingData = { slug: "kalakosh", name: "Kalakosh" };
    mocks.resumeMutate.mockImplementation(
      (_vars: unknown, cbs: MutateCbs<{ slug: string | null }>) =>
        cbs.onSuccess?.({ slug: "kalakosh" }),
    );

    renderOnboarding();

    expect(screen.getByText(/your store is waiting/i)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /finish setting up Kalakosh/i }),
    );
    await waitFor(() =>
      expect(screen.getByText(/you're the store admin/i)).toBeTruthy(),
    );
  });

  it("stays quiet for a signed-in visitor with nothing pending", () => {
    mocks.meData = { id: 1, email: "browsing@a.example" };
    mocks.pendingData = null;
    renderOnboarding();
    expect(screen.queryByText(/your store is waiting/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /finish setting up/i }),
    ).toBeNull();
  });

  it("asks a signed-out visitor on a store's onboarding URL to sign in with the signup email", () => {
    renderOnboarding("/onboarding?store=kalakosh");
    expect(
      screen.getByText(/sign in with the email you used at signup/i),
    ).toBeTruthy();
  });

  it("shows no claim card at all on a bare /onboarding visit", () => {
    renderOnboarding("/onboarding");
    expect(screen.queryByText(/one more step/i)).toBeNull();
    expect(screen.queryByText(/sign in with the email/i)).toBeNull();
  });
});
