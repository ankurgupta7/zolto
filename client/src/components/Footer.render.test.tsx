import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NEUTRAL_BRANDING, type Branding } from "@/lib/branding";
import Footer from "./Footer";

const mocks = vi.hoisted(() => ({
  branding: {} as Record<string, unknown>,
  products: [] as { category: string }[] | undefined,
}));

// t() echoes the key so assertions are stable without loading locale files.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    slug: "bergblume",
    branding: mocks.branding as unknown as Branding,
    isLoading: false,
    notFound: false,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    products: { list: { useQuery: () => ({ data: mocks.products }) } },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.branding = {
    ...NEUTRAL_BRANDING,
    storeName: "Bergblume",
    whatsappNumber: "41790001122",
    instagramHandle: "bergblume",
    logoUrlDark: null,
  };
  mocks.products = [{ category: "Rings" }, { category: "Earrings" }];
});
afterEach(() => cleanup());

describe("Footer", () => {
  it("renders the Instagram banner and social icons for a fully-branded tenant", () => {
    render(<Footer />);
    expect(screen.getByText("footer.instagramBanner")).toBeTruthy();
    expect(screen.getAllByText("@bergblume").length).toBeGreaterThan(0);
    const ig = screen.getByLabelText("Bergblume on Instagram");
    expect(ig.getAttribute("href")).toBe("https://www.instagram.com/bergblume");
    const wa = screen.getByLabelText("Chat on WhatsApp");
    expect(wa.getAttribute("href")).toContain("https://wa.me/41790001122");
  });

  it("hides the banner, follow block, and social icons without contact channels", () => {
    mocks.branding = {
      ...mocks.branding,
      whatsappNumber: null,
      instagramHandle: null,
    };
    render(<Footer />);
    expect(screen.queryByText("footer.instagramBanner")).toBeNull();
    expect(screen.queryByText("footer.followUs")).toBeNull();
    expect(screen.queryByLabelText("Chat on WhatsApp")).toBeNull();
  });

  it("only lists collections the catalogue actually has", () => {
    render(<Footer />);
    const rings = screen.getByText("categories.rings");
    expect(rings.closest("a")!.getAttribute("href")).toBe(
      "/shop?category=Rings",
    );
    expect(screen.getByText("categories.earrings")).toBeTruthy();
    expect(screen.queryByText("categories.necklaces")).toBeNull();
    expect(screen.queryByText("categories.brooches")).toBeNull();
  });

  it("links the main navigation and legal pages", () => {
    render(<Footer />);
    expect(
      screen.getByText("nav.shop").closest("a")!.getAttribute("href"),
    ).toBe("/shop");
    expect(
      screen.getByText("footer.policy").closest("a")!.getAttribute("href"),
    ).toBe("/policy");
    expect(
      screen.getByText("footer.impressum").closest("a")!.getAttribute("href"),
    ).toBe("/impressum");
  });

  it("falls back to the store name in text when there is no dark logo", () => {
    render(<Footer />);
    expect(screen.getByText("Bergblume")).toBeTruthy();
    expect(screen.queryByAltText("Bergblume")).toBeNull();
  });

  it("uses the dark logo image when one is configured", () => {
    mocks.branding = {
      ...mocks.branding,
      logoUrlDark: "https://cdn/logo-dark.png",
    };
    render(<Footer />);
    const img = screen.getByAltText("Bergblume") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn/logo-dark.png");
  });
});
