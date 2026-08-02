import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Import from "./Import";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authState.user = { role: "admin" };
});
afterEach(() => cleanup());

describe("Import page", () => {
  it("blocks non-admins", () => {
    mocks.authState.user = { role: "staff" };
    render(<Import />);
    expect(screen.getByText("Admins only")).toBeTruthy();
  });

  it("lets a superadmin through", () => {
    mocks.authState.user = { role: "superadmin" };
    render(<Import />);
    expect(screen.getByText("CSV import")).toBeTruthy();
  });

  it("links each import tool to its full-screen flow", () => {
    render(<Import />);
    const linkFor = (title: string) =>
      screen.getByText(title).closest("a") as HTMLAnchorElement;
    expect(linkFor("CSV import").getAttribute("href")).toBe(
      "/admin/csv-import",
    );
    expect(linkFor("Bulk photo upload").getAttribute("href")).toBe(
      "/admin/bulk-upload",
    );
    expect(linkFor("Duplicate cleanup").getAttribute("href")).toBe(
      "/admin/duplicates",
    );
    expect(screen.getAllByText("Open")).toHaveLength(3);
  });
});
