import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Team from "./Team";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  listData: {
    staff: [
      { id: 1, name: "Owner", email: "owner@a.example", role: "admin" },
      { id: 2, name: "Sam", email: "sam@a.example", role: "staff" },
    ],
    pendingInvites: [
      { id: 5, email: "pending@a.example", expiresAt: new Date() },
    ],
    seatsUsed: 3,
    seatLimit: 3,
  } as Record<string, unknown>,
  invite: vi.fn(),
  revoke: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ staff: { list: { invalidate: vi.fn() } } }),
    staff: {
      list: { useQuery: () => ({ data: mocks.listData }) },
      invite: {
        useMutation: () => ({ mutate: mocks.invite, isPending: false }),
      },
      revokeInvite: {
        useMutation: () => ({ mutate: mocks.revoke, isPending: false }),
      },
      removeStaff: {
        useMutation: () => ({ mutate: mocks.remove, isPending: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
  mocks.listData = {
    staff: [
      { id: 1, name: "Owner", email: "owner@a.example", role: "admin" },
      { id: 2, name: "Sam", email: "sam@a.example", role: "staff" },
    ],
    pendingInvites: [
      { id: 5, email: "pending@a.example", expiresAt: new Date() },
    ],
    seatsUsed: 3,
    seatLimit: 3,
  };
});
afterEach(() => cleanup());

describe("Team page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<Team />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("shows seat usage, members and pending invites", () => {
    render(<Team />);
    expect(screen.getByText("3 / 3 seats used")).toBeTruthy();
    expect(screen.getByText("Sam")).toBeTruthy();
    expect(screen.getByText("pending@a.example")).toBeTruthy();
  });

  it("upsells instead of inviting when seats are full", () => {
    render(<Team />);
    expect(screen.getByText("View plans")).toBeTruthy();
    expect(screen.queryByText("Send invite")).toBeNull();
  });

  it("invites a teammate when a seat is free", () => {
    mocks.listData = { ...mocks.listData, seatsUsed: 1, seatLimit: 3 };
    render(<Team />);
    fireEvent.change(screen.getByPlaceholderText("teammate@example.com"), {
      target: { value: "new@a.example" },
    });
    fireEvent.click(screen.getByText("Send invite"));
    expect(mocks.invite).toHaveBeenCalledWith({ email: "new@a.example" });
  });
});
