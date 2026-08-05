import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import i18n from "@/lib/i18n";
import ClaimStaff from "./ClaimStaff";
import { hardRedirect } from "@/lib/navigate";

type ClaimOpts = {
  onSuccess?: () => void;
  onError?: (e: Error) => void;
};

const VALID_TOKEN = "a".repeat(48);

const mocks = vi.hoisted(() => ({
  authState: { isAuthenticated: true, loading: false },
  claim: vi.fn(),
  claimOpts: null as ClaimOpts | null,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/lib/navigate", () => ({ hardRedirect: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    staff: {
      claimInvite: {
        useMutation: (opts: ClaimOpts) => {
          mocks.claimOpts = opts;
          return { mutate: mocks.claim, isPending: false };
        },
      },
    },
  },
}));

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.authState.isAuthenticated = true;
  mocks.authState.loading = false;
  mocks.claimOpts = null;
  window.history.replaceState({}, "", `/claim-staff?token=${VALID_TOKEN}`);
  await i18n.changeLanguage("en");
});
afterEach(() => cleanup());

describe("ClaimStaff page", () => {
  it("waits while auth is resolving", () => {
    mocks.authState.loading = true;
    render(<ClaimStaff />);
    expect(screen.getByText("Accepting invite…")).toBeTruthy();
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(hardRedirect).not.toHaveBeenCalled();
  });

  it("bounces a signed-out visitor to sign-in with the full invite url as next", () => {
    mocks.authState.isAuthenticated = false;
    render(<ClaimStaff />);
    expect(hardRedirect).toHaveBeenCalledWith(
      `/signin?next=${encodeURIComponent(window.location.href)}`,
      { replace: true },
    );
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it("claims a well-formed token exactly once", () => {
    render(<ClaimStaff />);
    expect(mocks.claim).toHaveBeenCalledTimes(1);
    expect(mocks.claim).toHaveBeenCalledWith({ token: VALID_TOKEN });
    expect(screen.getByText("Accepting invite…")).toBeTruthy();
  });

  it("rejects a malformed token without calling the server", () => {
    window.history.replaceState({}, "", "/claim-staff?token=short");
    render(<ClaimStaff />);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(screen.getByText("Invite couldn't be used")).toBeTruthy();
    expect(screen.getByText("This invite link is invalid.")).toBeTruthy();
  });

  it("welcomes the new teammate on success", () => {
    render(<ClaimStaff />);
    act(() => mocks.claimOpts!.onSuccess!());
    expect(screen.getByText("Welcome to the team!")).toBeTruthy();
    expect(screen.getByText("Taking you to the admin panel…")).toBeTruthy();
  });

  it("shows the server's reason when the claim fails", () => {
    render(<ClaimStaff />);
    act(() => mocks.claimOpts!.onError!(new Error("Invite expired")));
    expect(screen.getByText("Invite couldn't be used")).toBeTruthy();
    expect(screen.getByText("Invite expired")).toBeTruthy();
  });
});

// Every line on this page is one `admin`-namespace lookup away from a raw key,
// so pin that the account fragment resolves in a non-default language rather
// than falling back to English (or rendering "catalog.account.…").
describe("ClaimStaff page — translated", () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("renders the welcome and the invalid-link error in German", async () => {
    await act(async () => {
      await i18n.changeLanguage("de");
    });
    render(<ClaimStaff />);
    expect(screen.getByText("Einladung wird angenommen…")).toBeTruthy();
    act(() => mocks.claimOpts!.onSuccess!());
    expect(screen.getByText("Willkommen im Team!")).toBeTruthy();
    expect(
      screen.getByText("Sie werden in den Adminbereich weitergeleitet…"),
    ).toBeTruthy();

    cleanup();
    window.history.replaceState({}, "", "/claim-staff?token=short");
    render(<ClaimStaff />);
    expect(
      screen.getByText("Einladung konnte nicht verwendet werden"),
    ).toBeTruthy();
    expect(
      screen.getByText("Dieser Einladungslink ist ungültig."),
    ).toBeTruthy();
  });
});
