import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Orders from "./Orders";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  ordersData: [] as unknown[] | undefined,
  isLoading: false,
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    checkout: {
      listOrders: {
        useQuery: () => ({ data: mocks.ordersData, isLoading: mocks.isLoading }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.ordersData = [];
  mocks.isLoading = false;
});
afterEach(() => cleanup());

describe("Orders page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<Orders />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("shows an empty state with no orders", () => {
    render(<Orders />);
    expect(screen.getByText("No orders yet")).toBeTruthy();
  });

  it("renders a paid order with its total, customer and items", () => {
    mocks.ordersData = [
      {
        id: 42,
        status: "paid",
        amountTotal: 18500,
        currency: "chf",
        customerName: "Ada",
        customerEmail: "ada@example.com",
        paymentMethod: "card",
        createdAt: new Date().toISOString(),
        items: [{ id: 1, name: "Silver Ring" }],
      },
    ];
    render(<Orders />);
    expect(screen.getByText("#42")).toBeTruthy();
    expect(screen.getByText("Ada")).toBeTruthy();
    expect(screen.getByText("CHF 185.00")).toBeTruthy();
    expect(screen.getByText("Silver Ring")).toBeTruthy();
  });
});
