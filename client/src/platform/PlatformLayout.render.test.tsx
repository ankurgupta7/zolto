import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PlatformLayout from "./PlatformLayout";

const mocks = vi.hoisted(() => ({
  role: "superadmin" as string | null,
  loading: false,
  location: "/platform",
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({
    user: mocks.role ? { id: 1, role: mocks.role } : null,
    isAuthenticated: Boolean(mocks.role),
    loading: mocks.loading,
  }),
}));

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
  mocks.loading = false;
  mocks.location = "/platform";
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
    expect(screen.getByText("Zolto operator")).toBeTruthy();
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
