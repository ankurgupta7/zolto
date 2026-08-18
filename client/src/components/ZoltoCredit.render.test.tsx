import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import ZoltoCredit from "./ZoltoCredit";

const mocks = vi.hoisted(() => ({ showsZoltoCredit: true }));

// t() echoes the key so assertions don't depend on locale files.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    slug: "bergblume",
    showsZoltoCredit: mocks.showsZoltoCredit,
  }),
}));

beforeEach(() => {
  mocks.showsZoltoCredit = true;
});
afterEach(() => cleanup());

describe("ZoltoCredit", () => {
  it("links to zolto.ch with Zolto as the link text", () => {
    render(<ZoltoCredit />);
    const link = screen.getByRole("link", { name: "Zolto" });
    expect(link.getAttribute("href")).toContain("https://zolto.ch/");
  });

  it("stays followable — a nofollow would defeat the point of the backlink", () => {
    // The credit on a merchant's own custom domain exists precisely so a search
    // engine walks it back to zolto.ch.
    render(<ZoltoCredit />);
    const rel = screen.getByRole("link", { name: "Zolto" }).getAttribute("rel");
    expect(rel).toContain("noopener");
    expect(rel).not.toContain("nofollow");
  });

  it("tags the link so storefront referrals are measurable", () => {
    render(<ZoltoCredit />);
    const href = screen
      .getByRole("link", { name: "Zolto" })
      .getAttribute("href")!;
    expect(new URL(href).searchParams.get("utm_source")).toBe(
      "storefront-footer",
    );
  });

  it("renders nothing for a store that has switched the credit off", () => {
    mocks.showsZoltoCredit = false;
    const { container } = render(<ZoltoCredit />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("link", { name: "Zolto" })).toBeNull();
  });

  it("keeps the caller's classes on the wrapper", () => {
    render(<ZoltoCredit className="text-white/40" />);
    expect(screen.getByTestId("zolto-credit").className).toContain(
      "text-white/40",
    );
  });
});
