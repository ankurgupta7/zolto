import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import Onboarding from "./Onboarding";

const mocks = vi.hoisted(() => ({
  meData: undefined as unknown,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: { useQuery: () => ({ data: mocks.meData }) },
      requestMagicLink: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
      },
    },
    tenant: {
      claimAdmin: { useMutation: () => ({ mutate: vi.fn() }) },
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

beforeEach(() => {
  mocks.meData = undefined;
  vi.spyOn(Storage.prototype, "getItem").mockReturnValue("a-claim-token");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderOnboarding() {
  const { hook, searchHook } = memoryLocation({
    path: "/onboarding?store=kalakosh",
    static: true,
  });
  return render(
    <Router hook={hook} searchHook={searchHook}>
      <Onboarding />
    </Router>,
  );
}

describe("Onboarding — claiming a fresh store", () => {
  it("offers Google, Apple, and email instead of a Google-only dead end", () => {
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
});
