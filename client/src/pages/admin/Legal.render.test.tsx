import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Legal from "./Legal";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
});
afterEach(() => cleanup());

describe("Legal page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<Legal />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("points invoices at the billing page", () => {
    render(<Legal />);
    const link = screen.getByText("Manage billing & view invoices →");
    expect(link.closest("a")!.getAttribute("href")).toBe("/admin/account/plan");
  });

  it("links the legal documents in a new tab", () => {
    render(<Legal />);
    const terms = screen.getByText("Terms of Service").closest("a")!;
    expect(terms.getAttribute("href")).toBe("/legal/terms");
    expect(terms.getAttribute("target")).toBe("_blank");
    const privacy = screen.getByText("Privacy Policy").closest("a")!;
    expect(privacy.getAttribute("href")).toBe("/legal/privacy");
  });

  it("shows the AI-image disclosure", () => {
    render(<Legal />);
    expect(
      screen.getByText(/Product photos styled with Gwinn's AI/),
    ).toBeTruthy();
  });
});
