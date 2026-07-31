import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SignInOptions } from "./SignInOptions";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  errorMessage: "",
  // Simulates whatever the server would respond with; the mocked mutate()
  // below calls onSuccess synchronously with this, like an instant real
  // mutation would inside React Testing Library's act()-wrapped fireEvent.
  responseData: { emailed: true } as { emailed: boolean; previewUrl?: string },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      requestMagicLink: {
        useMutation: (opts?: { onSuccess?: (data: unknown) => void }) => {
          mocks.mutate.mockImplementation(() => {
            opts?.onSuccess?.(mocks.responseData);
          });
          return {
            mutate: mocks.mutate,
            isPending: mocks.isPending,
            isError: mocks.isError,
            error: { message: mocks.errorMessage },
          };
        },
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isPending = false;
  mocks.isError = false;
  mocks.errorMessage = "";
  mocks.responseData = { emailed: true };
});
afterEach(() => cleanup());

describe("SignInOptions", () => {
  it("links Google and Apple with the given return path", () => {
    render(<SignInOptions next="/onboarding?store=kalakosh" />);
    const google = screen.getByRole("link", { name: /continue with google/i });
    expect(google.getAttribute("href")).toBe(
      `/api/oauth/login?next=${encodeURIComponent("/onboarding?store=kalakosh")}`,
    );
    const apple = screen.getByRole("link", { name: /continue with apple/i });
    expect(apple.getAttribute("href")).toBe(
      `/api/oauth/apple/login?next=${encodeURIComponent("/onboarding?store=kalakosh")}`,
    );
  });

  it("omits the next param when none is given", () => {
    render(<SignInOptions />);
    expect(
      screen.getByRole("link", { name: /continue with google/i }).getAttribute("href"),
    ).toBe("/api/oauth/login");
  });

  it("reveals an email form only after 'continue with email' is clicked", () => {
    render(<SignInOptions />);
    expect(screen.queryByPlaceholderText(/you@example.com/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    expect(screen.getByPlaceholderText(/you@example.com/i)).toBeTruthy();
  });

  it("keeps the send button disabled until the email looks valid", () => {
    render(<SignInOptions />);
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    const input = screen.getByPlaceholderText(/you@example.com/i);
    const submit = screen.getByRole("button", {
      name: /send link/i,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "not-an-email" } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(input, { target: { value: "merchant@example.com" } });
    expect(submit.disabled).toBe(false);
  });

  it("requests a magic link with the email and next path on submit", () => {
    render(<SignInOptions next="/signin?from=oauth" />);
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
      target: { value: "merchant@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send link/i }));
    expect(mocks.mutate).toHaveBeenCalledWith({
      email: "merchant@example.com",
      next: "/signin?from=oauth",
    });
  });

  it("shows a check-your-email confirmation once the request succeeds", () => {
    mocks.responseData = { emailed: true };
    render(<SignInOptions />);
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
      target: { value: "merchant@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send link/i }));
    expect(screen.getByText(/check/i)).toBeTruthy();
    expect(screen.getByText("merchant@example.com")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /continue with google/i })).toBeNull();
  });

  it("surfaces the raw link when the server reports it couldn't email it", () => {
    const previewUrl = "http://localhost/api/auth/magic-link/callback?token=abc";
    mocks.responseData = { emailed: false, previewUrl };
    render(<SignInOptions />);
    fireEvent.click(screen.getByRole("button", { name: /continue with email/i }));
    fireEvent.change(screen.getByPlaceholderText(/you@example.com/i), {
      target: { value: "merchant@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send link/i }));
    expect(screen.getByRole("link", { name: previewUrl }).getAttribute("href")).toBe(
      previewUrl,
    );
  });

  it("shows a mutation error message", () => {
    mocks.isError = true;
    mocks.errorMessage = "Something went wrong.";
    render(<SignInOptions />);
    expect(screen.getByText("Something went wrong.")).toBeTruthy();
  });
});
