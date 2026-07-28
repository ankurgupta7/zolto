import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Pos from "./Pos";

const mocks = vi.hoisted(() => ({
  meData: { terminalLocationId: null } as Record<string, unknown> | undefined,
  connectData: { connected: false, url: "https://connect.stripe.test/x" } as
    | Record<string, unknown>
    | undefined,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      me: { useQuery: () => ({ data: mocks.meData, isLoading: false }) },
      getStripeConnectUrl: {
        useQuery: () => ({ data: mocks.connectData, isLoading: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.meData = { terminalLocationId: null };
  mocks.connectData = { connected: false, url: "https://connect.stripe.test/x" };
});
afterEach(() => cleanup());

describe("POS page", () => {
  it("shows payments as not set up until Stripe is connected", () => {
    render(<Pos />);
    expect(screen.getByText("Point of sale")).toBeTruthy();
    expect(screen.getAllByText("Not set up").length).toBeGreaterThanOrEqual(2); // Tap to Pay + TWINT
    expect(screen.getByText("Connect Stripe")).toBeTruthy();
  });

  it("reflects a connected account and a pending terminal", () => {
    mocks.connectData = { connected: true, url: null };
    render(<Pos />);
    expect(screen.getAllByText("Ready").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Pending first use")).toBeTruthy();
    expect(screen.queryByText("Connect Stripe")).toBeNull();
  });

  it("marks the terminal provisioned once a location exists", () => {
    mocks.connectData = { connected: true, url: null };
    mocks.meData = { terminalLocationId: "tml_123" };
    render(<Pos />);
    expect(screen.getByText("Provisioned")).toBeTruthy();
  });

  it("sends the merchant to Stripe when Connect is clicked", () => {
    const orig = Object.getOwnPropertyDescriptor(window, "location");
    const stub = { href: "" };
    Object.defineProperty(window, "location", {
      value: stub,
      writable: true,
      configurable: true,
    });
    render(<Pos />);
    fireEvent.click(screen.getByText("Connect Stripe"));
    expect(stub.href).toBe("https://connect.stripe.test/x");
    if (orig) Object.defineProperty(window, "location", orig);
  });
});
