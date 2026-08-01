import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, act } from "@testing-library/react";
import { SignOutButton } from "./SignOutButton";

const mocks = vi.hoisted(() => ({ logout: vi.fn() }));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ logout: mocks.logout, user: { id: 1 }, loading: false }),
}));

vi.mock("@/lib/navigate", () => ({ hardRedirect: vi.fn() }));
import { hardRedirect } from "@/lib/navigate";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logout.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("SignOutButton", () => {
  it("signs out and lands on the platform's front door by default", async () => {
    render(<SignOutButton />);
    await act(async () => {
      screen.getByRole("button", { name: "Sign out" }).click();
    });
    expect(mocks.logout).toHaveBeenCalled();
    expect(hardRedirect).toHaveBeenCalledWith("/");
  });

  it("honours an explicit destination", async () => {
    render(<SignOutButton to="/signin" />);
    await act(async () => {
      screen.getByRole("button").click();
    });
    expect(hardRedirect).toHaveBeenCalledWith("/signin");
  });

  // A full reload is the only way to clear surface resolution and the cached
  // auth query; without it the nav keeps insisting you are signed in.
  it("navigates even when the logout call fails", async () => {
    mocks.logout.mockRejectedValue(new Error("network"));
    render(<SignOutButton />);
    await act(async () => {
      screen.getByRole("button").click();
    });
    await waitFor(() => expect(hardRedirect).toHaveBeenCalledWith("/"));
  });

  it("disables itself while in flight so a double-click cannot double-submit", async () => {
    let release: (() => void) | undefined;
    mocks.logout.mockReturnValue(
      new Promise<void>((r) => {
        release = r;
      }),
    );
    render(<SignOutButton />);
    const button = screen.getByRole("button") as HTMLButtonElement;
    await act(async () => {
      button.click();
    });
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/signing out/i)).toBeTruthy();
    await act(async () => {
      release?.();
    });
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });

  it("accepts custom label text", () => {
    render(<SignOutButton>Use a different account</SignOutButton>);
    expect(
      screen.getByRole("button", { name: "Use a different account" }),
    ).toBeTruthy();
  });
});
