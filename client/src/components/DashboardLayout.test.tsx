import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import DashboardLayout from "./DashboardLayout";

const mocks = vi.hoisted(() => ({
  authState: {
    user: { name: "Ada Admin", email: "ada@example.com" } as {
      name: string;
      email: string;
    } | null,
    loading: false,
    logout: vi.fn(),
  },
  location: "/",
  setLocation: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => mocks.authState,
}));

vi.mock("wouter", () => ({
  useLocation: () => [mocks.location, mocks.setLocation],
}));

// Only needed by the signed-out state's SignInOptions.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      requestMagicLink: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.authState.user = { name: "Ada Admin", email: "ada@example.com" };
  mocks.authState.loading = false;
  mocks.location = "/";
  // jsdom lacks matchMedia (useIsMobile) and ResizeObserver (radix popper).
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => cleanup());

describe("DashboardLayout", () => {
  it("shows the skeleton while auth is loading", () => {
    mocks.authState.loading = true;
    const { container } = render(
      <DashboardLayout>
        <p>dashboard body</p>
      </DashboardLayout>,
    );
    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.queryByText("dashboard body")).toBeNull();
  });

  it("offers all sign-in options in place when signed out", () => {
    mocks.authState.user = null;
    render(
      <DashboardLayout>
        <p>dashboard body</p>
      </DashboardLayout>,
    );
    expect(screen.getByText("Sign in to continue")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /continue with google/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /continue with apple/i }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /continue with email/i }),
    ).toBeTruthy();
    expect(screen.queryByText("dashboard body")).toBeNull();
  });

  it("renders children, nav items and the user identity when signed in", () => {
    render(
      <DashboardLayout>
        <p>dashboard body</p>
      </DashboardLayout>,
    );
    expect(screen.getByText("dashboard body")).toBeTruthy();
    expect(screen.getByText("Page 1")).toBeTruthy();
    expect(screen.getByText("Page 2")).toBeTruthy();
    expect(screen.getByText("Ada Admin")).toBeTruthy();
    expect(screen.getByText("ada@example.com")).toBeTruthy();
  });

  it("navigates when a menu item is clicked", () => {
    render(
      <DashboardLayout>
        <p>dashboard body</p>
      </DashboardLayout>,
    );
    fireEvent.click(screen.getByText("Page 2"));
    expect(mocks.setLocation).toHaveBeenCalledWith("/some-path");
  });

  it("collapses the sidebar via the toggle button", () => {
    render(
      <DashboardLayout>
        <p>dashboard body</p>
      </DashboardLayout>,
    );
    expect(screen.getByText("Navigation")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Toggle navigation"));
    expect(screen.queryByText("Navigation")).toBeNull();
    fireEvent.click(screen.getByLabelText("Toggle navigation"));
    expect(screen.getByText("Navigation")).toBeTruthy();
  });

  it("signs out from the footer dropdown", async () => {
    render(
      <DashboardLayout>
        <p>dashboard body</p>
      </DashboardLayout>,
    );
    const trigger = screen.getByText("Ada Admin").closest("button");
    expect(trigger).toBeTruthy();
    fireEvent.pointerDown(trigger as HTMLButtonElement);
    const item = await screen.findByText("Sign out");
    fireEvent.click(item);
    await waitFor(() => expect(mocks.authState.logout).toHaveBeenCalled());
  });

  it("persists the sidebar width to localStorage", () => {
    render(
      <DashboardLayout>
        <p>dashboard body</p>
      </DashboardLayout>,
    );
    expect(localStorage.getItem("sidebar-width")).toBe("280");
  });
});
