import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Import from "./Import";

const mocks = vi.hoisted(() => ({
  authState: { user: { role: "admin" } as { role: string } | null },
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));

// The paid site importer has its own render test (SiteImportCard.render.test)
// and needs a tRPC provider; here we only care that the page mounts it.
vi.mock("@/components/admin/SiteImportCard", () => ({
  default: () => <div>SITE IMPORT CARD</div>,
}));

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

  it("leads with the one-address import, above the manual tools", () => {
    const { container } = render(<Import />);
    const card = screen.getByText("SITE IMPORT CARD");
    const csv = screen.getByText("CSV import");
    // Source order is reading order: the fastest way in comes first.
    expect(
      card.compareDocumentPosition(csv) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.textContent).toContain("SITE IMPORT CARD");
  });
});
