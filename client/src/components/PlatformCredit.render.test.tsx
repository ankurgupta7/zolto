import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import PlatformCredit from "./PlatformCredit";

const mocks = vi.hoisted(() => ({ showsPlatformCredit: true }));

// t() echoes the key so assertions don't depend on locale files.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    slug: "bergblume",
    showsPlatformCredit: mocks.showsPlatformCredit,
  }),
}));

beforeEach(() => {
  mocks.showsPlatformCredit = true;
});
afterEach(() => cleanup());

describe("PlatformCredit", () => {
  it("links to gwinn.ch with Gwinn as the link text", () => {
    render(<PlatformCredit />);
    const link = screen.getByRole("link", { name: "Gwinn" });
    expect(link.getAttribute("href")).toContain("https://gwinn.ch/");
  });

  it("stays followable — a nofollow would defeat the point of the backlink", () => {
    // The credit on a merchant's own custom domain exists precisely so a search
    // engine walks it back to gwinn.ch.
    render(<PlatformCredit />);
    const rel = screen.getByRole("link", { name: "Gwinn" }).getAttribute("rel");
    expect(rel).toContain("noopener");
    expect(rel).not.toContain("nofollow");
  });

  it("tags the link so storefront referrals are measurable", () => {
    render(<PlatformCredit />);
    const href = screen
      .getByRole("link", { name: "Gwinn" })
      .getAttribute("href")!;
    expect(new URL(href).searchParams.get("utm_source")).toBe(
      "storefront-footer",
    );
  });

  it("renders nothing for a store that has switched the credit off", () => {
    mocks.showsPlatformCredit = false;
    const { container } = render(<PlatformCredit />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("link", { name: "Gwinn" })).toBeNull();
  });

  it("keeps the caller's classes on the wrapper", () => {
    render(<PlatformCredit className="text-white/40" />);
    expect(screen.getByTestId("platform-credit").className).toContain(
      "text-white/40",
    );
  });
});
