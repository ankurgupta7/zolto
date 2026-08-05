import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import MyAccount from "./MyAccount";

const mocks = vi.hoisted(() => ({
  user: {
    id: 1,
    name: "Anna Brunner",
    email: "anna@bergblume.ch",
    role: "admin",
    loginMethod: "google",
  } as Record<string, unknown> | null,
  logout: vi.fn(),
  refresh: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mocks.user,
    isAuthenticated: Boolean(mocks.user),
    loading: false,
    logout: mocks.logout,
    refresh: mocks.refresh,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      updateProfile: {
        useMutation: () => ({ mutate: mocks.save, isPending: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = {
    id: 1,
    name: "Anna Brunner",
    email: "anna@bergblume.ch",
    role: "admin",
    loginMethod: "google",
  };
});
afterEach(() => cleanup());

describe("MyAccount — display name", () => {
  it("prefills the signed-in user's name and saves an edit", () => {
    render(<MyAccount />);
    const input = screen.getByLabelText("Display name") as HTMLInputElement;
    expect(input.value).toBe("Anna Brunner");
    fireEvent.change(input, { target: { value: "Anna B." } });
    fireEvent.click(screen.getByText("Save changes"));
    expect(mocks.save).toHaveBeenCalledWith({ name: "Anna B." });
  });

  it("trims whitespace rather than saving a padded name", () => {
    render(<MyAccount />);
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "  Anna  " },
    });
    fireEvent.click(screen.getByText("Save changes"));
    expect(mocks.save).toHaveBeenCalledWith({ name: "Anna" });
  });

  it("refuses to save an empty name", () => {
    render(<MyAccount />);
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByText("Save changes"));
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

// The email is the identity the session was minted against, so it must be
// shown but never presented as editable — a disabled box with no reason is
// what sends merchants to support.
describe("MyAccount — sign-in identity", () => {
  it("shows the email and method without offering to edit them", () => {
    render(<MyAccount />);
    expect(screen.getByText("anna@bergblume.ch")).toBeTruthy();
    expect(screen.getByText("Google")).toBeTruthy();
    expect(screen.queryByLabelText(/sign-in email/i)).toBeNull();
  });

  it("explains why the email cannot be changed here", () => {
    render(<MyAccount />);
    expect(screen.getByText(/has to be proved/i)).toBeTruthy();
  });

  it("names the magic-link method in merchant language", () => {
    mocks.user = { ...mocks.user, loginMethod: "magic-link" };
    render(<MyAccount />);
    expect(screen.getByText("Email link")).toBeTruthy();
  });

  it("calls the platform owner what they are, not 'superadmin'", () => {
    mocks.user = { ...mocks.user, role: "superadmin" };
    render(<MyAccount />);
    expect(screen.getByText("Platform owner")).toBeTruthy();
  });
});

describe("MyAccount — session", () => {
  it("signs out", () => {
    render(<MyAccount />);
    fireEvent.click(screen.getByText("Sign out"));
    expect(mocks.logout).toHaveBeenCalled();
  });

  it("offers a sign-in link that returns here when signed out", () => {
    mocks.user = null;
    render(<MyAccount />);
    const link = screen.getByText("Sign in") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/signin?next=/admin/account/me");
  });
});
