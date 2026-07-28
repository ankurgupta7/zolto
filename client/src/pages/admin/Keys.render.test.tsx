import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import Keys from "./Keys";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
  rotate: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: {
      rotatePosApiKey: {
        useMutation: () => ({ mutate: mocks.rotate, isPending: false }),
      },
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
});
afterEach(() => cleanup());

describe("Keys page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<Keys />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("requires confirmation before rotating the POS key", () => {
    render(<Keys />);
    fireEvent.click(screen.getByText("Generate a new key"));
    // Not rotated until the destructive confirm is clicked.
    expect(mocks.rotate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Yes, rotate the key"));
    expect(mocks.rotate).toHaveBeenCalledTimes(1);
  });
});
