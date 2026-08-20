import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import PlatformLayout from "./PlatformLayout";

const mocks = vi.hoisted(() => ({
  role: "superadmin" as string | null,
  email: "you@gwinn.ch" as string | null,
  loading: false,
  location: "/platform",
  logout: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mocks.role ? { id: 1, role: mocks.role, email: mocks.email } : null,
    isAuthenticated: Boolean(mocks.role),
    loading: mocks.loading,
    logout: mocks.logout,
  }),
}));

vi.mock("@/lib/navigate", () => ({ hardRedirect: vi.fn() }));
import { hardRedirect } from "@/lib/navigate";

vi.mock("wouter", () => ({
  useLocation: () => [mocks.location, vi.fn()],
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "superadmin";
  mocks.email = "you@gwinn.ch";
  mocks.loading = false;
  mocks.location = "/platform";
  mocks.logout.mockResolvedValue(undefined);
});
afterEach(() => cleanup());

describe("PlatformLayout — who gets in", () => {
  it("renders the console for the platform owner", () => {
    render(
      <PlatformLayout>
        <p>secret numbers</p>
      </PlatformLayout>,
    );
    expect(screen.getByText("secret numbers")).toBeTruthy();
    expect(screen.getByText("Gwinn operator")).toBeTruthy();
  });

  // The whole point of the console being on the marketing surface is that it is
  // reachable by URL, so the refusal path is the security-relevant one.
  it.each(["admin", "staff", "customer"])(
    "refuses a %s and renders none of the children",
    (role) => {
      mocks.role = role;
      render(
        <PlatformLayout>
          <p>secret numbers</p>
        </PlatformLayout>,
      );
      expect(screen.queryByText("secret numbers")).toBeNull();
      expect(screen.getByText("Not available")).toBeTruthy();
    },
  );

  it("refuses an anonymous visitor and offers sign-in that returns here", () => {
    mocks.role = null;
    render(
      <PlatformLayout>
        <p>secret numbers</p>
      </PlatformLayout>,
    );
    expect(screen.queryByText("secret numbers")).toBeNull();
    const link = screen.getByText("Sign in") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/signin?next=/platform");
  });

  it("tells a refused merchant nothing about what the console holds", () => {
    mocks.role = "admin";
    render(
      <PlatformLayout>
        <p>secret numbers</p>
      </PlatformLayout>,
    );
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/metrics|GMV|stores|tenant/i);
  });

  it("renders nothing sensitive while the role is still unknown", () => {
    mocks.loading = true;
    render(
      <PlatformLayout>
        <p>secret numbers</p>
      </PlatformLayout>,
    );
    expect(screen.queryByText("secret numbers")).toBeNull();
    expect(screen.getByText(/Checking your access/i)).toBeTruthy();
  });
});

describe("PlatformLayout — navigation", () => {
  it("marks the store list active on a single store, not metrics", () => {
    mocks.location = "/platform/stores/7";
    render(
      <PlatformLayout>
        <p>x</p>
      </PlatformLayout>,
    );
    const stores = screen.getByText("Stores").closest("a");
    const metrics = screen.getByText("Metrics").closest("a");
    expect(stores?.getAttribute("aria-current")).toBe("page");
    expect(metrics?.getAttribute("aria-current")).toBeNull();
  });
});

// Reaching the console signed in as the wrong account is the normal way to
// get refused — the operator usually has a merchant account in the same
// browser. A refusal that does not name the account, or does not offer a way
// out of it, leaves them stuck with no idea why.
describe("PlatformLayout — escaping the wrong account", () => {
  it("names the account that was refused", () => {
    mocks.role = "admin";
    mocks.email = "anna@bergblume.ch";
    render(
      <PlatformLayout>
        <p>secret numbers</p>
      </PlatformLayout>,
    );
    expect(screen.getByText("anna@bergblume.ch")).toBeTruthy();
  });

  it("offers signing out to try another account", async () => {
    mocks.role = "admin";
    render(
      <PlatformLayout>
        <p>secret numbers</p>
      </PlatformLayout>,
    );
    await act(async () => {
      screen.getByRole("button", { name: /sign in as someone else/i }).click();
    });
    expect(mocks.logout).toHaveBeenCalled();
    expect(hardRedirect).toHaveBeenCalledWith("/signin");
  });

  it("copes with a signed-in account that has no email on file", () => {
    mocks.role = "staff";
    mocks.email = null;
    render(
      <PlatformLayout>
        <p>secret numbers</p>
      </PlatformLayout>,
    );
    expect(screen.getByText("this account")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /sign in as someone else/i }),
    ).toBeTruthy();
  });

  it("offers plain sign-in, not sign-out, to an anonymous visitor", () => {
    mocks.role = null;
    render(
      <PlatformLayout>
        <p>secret numbers</p>
      </PlatformLayout>,
    );
    expect(screen.queryByRole("button", { name: /someone else/i })).toBeNull();
    expect(screen.getByText("Sign in")).toBeTruthy();
  });

  it("lets the operator sign out from inside the console too", async () => {
    render(
      <PlatformLayout>
        <p>secret numbers</p>
      </PlatformLayout>,
    );
    expect(screen.getByText("you@gwinn.ch")).toBeTruthy();
    await act(async () => {
      screen.getByRole("button", { name: "Sign out" }).click();
    });
    expect(mocks.logout).toHaveBeenCalled();
  });
});
