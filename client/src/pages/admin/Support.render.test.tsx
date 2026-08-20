import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Support from "./Support";

const mocks = vi.hoisted(() => ({
  meData: { plan: "free" } as { plan: string } | undefined,
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: { role: "staff" } }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    tenant: { me: { useQuery: () => ({ data: mocks.meData }) } },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.meData = { plan: "free" };
});
afterEach(() => cleanup());

describe("Support page", () => {
  it("tells a Free merchant they have standard support", () => {
    render(<Support />);
    expect(screen.getByText("free plan")).toBeTruthy();
    expect(
      screen.getByText(
        "Community & email support, answered within a few business days.",
      ),
    ).toBeTruthy();
  });

  it("tells a Pro merchant they have priority support", () => {
    mocks.meData = { plan: "pro" };
    render(<Support />);
    expect(screen.getByText("pro plan")).toBeTruthy();
    expect(
      screen.getByText(
        "Priority human support, answered within one business day.",
      ),
    ).toBeTruthy();
  });

  // Retired plan ids must fall back to Free's level, never Pro's.
  it("treats an unknown plan as standard support", () => {
    mocks.meData = { plan: "atelier" };
    render(<Support />);
    expect(screen.getByText(/Community & email support/)).toBeTruthy();
  });

  it("defaults to the free plan while tenant.me is unresolved", () => {
    mocks.meData = undefined;
    render(<Support />);
    expect(screen.getByText("free plan")).toBeTruthy();
  });

  it("links the email and docs channels and shows platform status", () => {
    render(<Support />);
    expect(
      screen.getByText("Email us").closest("a")!.getAttribute("href"),
    ).toBe("mailto:support@gwinn.ch");
    const docs = screen.getByText("Guides & docs").closest("a")!;
    expect(docs.getAttribute("href")).toBe("https://gwinn.ch/blog");
    expect(docs.getAttribute("target")).toBe("_blank");
    expect(screen.getByText("All systems operational")).toBeTruthy();
  });
});
