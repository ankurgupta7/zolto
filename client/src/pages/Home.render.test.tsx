import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import type { ProductItem } from "@shared/types";
import i18n from "@/lib/i18n";
import Home from "./Home";

const mocks = vi.hoisted(() => ({
  products: [] as unknown[] | undefined,
  branding: {
    storeName: "Aurora Atelier",
    shortName: "Aurora",
    whatsappNumber: null as string | null,
    instagramHandle: "aurora.atelier" as string | null,
    contactEmail: null,
    logoUrl: null,
    logoUrlDark: null,
    currency: "chf",
    primaryColor: "#2D2620",
  },
  content: {
    heroImageUrl: null as string | null,
    heroHeadline: null as string | null,
    heroSubtitle: null as string | null,
    aboutBody: null,
    companyLegalName: null,
    companyAddress: null,
    vatNumber: null,
    companyRegistration: null,
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    products: {
      list: { useQuery: () => ({ data: mocks.products }) },
    },
    // The trust band at the foot of the page (CustomerTrust, covered by its own
    // render test). Empty here: this store has published no quotes and
    // connected no Trustpilot profile, so the section renders nothing and the
    // assertions below are about the page it has always been.
    testimonials: { list: { useQuery: () => ({ data: [] }) } },
    trustpilot: {
      summary: { useQuery: () => ({ data: { connected: false } }) },
    },
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    slug: "aurora",
    branding: mocks.branding,
    content: mocks.content,
    isLoading: false,
    notFound: false,
  }),
}));

// Owned by their own test files; stubbed here so Home's sections stay the unit
// under test (ParticleField needs a canvas context jsdom does not provide).
vi.mock("@/components/ParticleField", () => ({ default: () => null }));
vi.mock("@/components/ProductCard", () => ({
  default: ({ product }: { product: ProductItem }) => (
    <div data-testid="product-card">{product.name}</div>
  ),
}));

type TestProduct = ProductItem & {
  nameIt?: string | null;
  descriptionIt?: string | null;
};

function makeProduct(overrides: Partial<TestProduct> = {}): TestProduct {
  return {
    id: 1,
    name: "Silver Ring",
    description: "A ring",
    nameEn: "Silver Ring",
    descriptionEn: "A ring",
    nameDe: null,
    descriptionDe: null,
    nameFr: null,
    descriptionFr: null,
    nameIt: null,
    descriptionIt: null,
    price: "185.00",
    category: "Rings",
    imageKey: null,
    imageUrl: "https://example.com/ring.jpg",
    visible: true,
    sold: false,
    quantity: 1,
    source: "manual",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function renderHome() {
  const { hook, history } = memoryLocation({ path: "/", record: true });
  const view = render(
    <Router hook={hook}>
      <Home />
    </Router>,
  );
  return { ...view, history };
}

beforeEach(async () => {
  vi.clearAllMocks();
  // The storefront defaults to German (see lib/i18n); pin English per test so
  // copy assertions are deterministic.
  await i18n.changeLanguage("en");
  mocks.products = [];
  mocks.branding.instagramHandle = "aurora.atelier";
  mocks.content.heroImageUrl = null;
  mocks.content.heroHeadline = null;
  mocks.content.heroSubtitle = null;
  // jsdom ships none of these; framer-motion's whileInView and embla need them.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Home page", () => {
  it("renders the tenant-branded hero with a shop CTA", () => {
    renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: "Aurora Atelier" }),
    ).toBeTruthy();
    const cta = screen.getByRole("link", { name: /explore the shop/i });
    expect(cta.getAttribute("href")).toBe("/shop");
  });

  it("links the hero Instagram CTA to the tenant's handle", () => {
    renderHome();
    const ig = screen.getByRole("link", { name: /@aurora\.atelier/i });
    expect(ig.getAttribute("href")).toBe(
      "https://www.instagram.com/aurora.atelier",
    );
  });

  it("hides the Instagram CTA when the tenant has no handle", () => {
    mocks.branding.instagramHandle = null;
    renderHome();
    expect(screen.queryByRole("link", { name: /instagram/i })).toBeNull();
  });

  it("renders the three value props", () => {
    renderHome();
    expect(screen.getByText("Curated")).toBeTruthy();
    expect(screen.getByText("Secure checkout")).toBeTruthy();
    expect(screen.getByText("In person too")).toBeTruthy();
  });

  it("derives the category strip from the catalogue without duplicates", () => {
    mocks.products = [
      makeProduct({ id: 1, category: "Rings" }),
      makeProduct({ id: 2, category: "Earrings" }),
      makeProduct({ id: 3, category: "Rings" }),
    ];
    renderHome();
    expect(screen.getByText("Shop by category")).toBeTruthy();
    const rings = screen.getByRole("link", { name: /Rings/ });
    expect(rings.getAttribute("href")).toBe("/shop?category=Rings");
    expect(screen.getAllByRole("link", { name: /Earrings/ })).toHaveLength(1);
  });

  it("navigates to the filtered shop when a category chip is clicked", () => {
    mocks.products = [makeProduct({ id: 1, category: "Rings" })];
    const { history } = renderHome();
    fireEvent.click(screen.getByRole("link", { name: /Rings/ }));
    expect(history).toContain("/shop?category=Rings");
  });

  it("features at most six products in the arrivals carousel", () => {
    mocks.products = Array.from({ length: 7 }, (_, i) =>
      makeProduct({ id: i + 1, name: `Piece ${i + 1}` }),
    );
    renderHome();
    expect(screen.getByText("New in the shop")).toBeTruthy();
    expect(screen.getAllByTestId("product-card")).toHaveLength(6);
    const viewAll = screen.getByRole("link", { name: /view all/i });
    expect(viewAll.getAttribute("href")).toBe("/shop");
  });

  it("hides the category strip and arrivals for an empty catalogue", () => {
    mocks.products = [];
    renderHome();
    expect(screen.queryByText("Shop by category")).toBeNull();
    expect(screen.queryByText("New in the shop")).toBeNull();
  });

  // Until these fields existed, every Zolto storefront showed the same hero:
  // the same background image, the same "Welcome", the same sentence.
  it("shows the platform banner and the store name when nothing is authored", () => {
    renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: "Aurora Atelier" }),
    ).toBeTruthy();
    const banner = document.querySelector("section img");
    expect(banner?.getAttribute("src")).toBe("/hero-bg.svg");
  });

  it("renders the merchant's own banner, headline and intro", () => {
    mocks.content.heroImageUrl = "https://cdn.example/shopfront.jpg";
    mocks.content.heroHeadline = "Made by hand";
    mocks.content.heroSubtitle = "In the old town since 2018";
    renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: "Made by hand" }),
    ).toBeTruthy();
    expect(screen.getByText("In the old town since 2018")).toBeTruthy();
    expect(document.querySelector("section img")?.getAttribute("src")).toBe(
      "https://cdn.example/shopfront.jpg",
    );
  });

  it("keeps the template intro when only a headline is authored", () => {
    mocks.content.heroHeadline = "Made by hand";
    renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: "Made by hand" }),
    ).toBeTruthy();
    expect(screen.getByText(/browse the collection/i)).toBeTruthy();
  });

  it("shows an authored headline as written even in another language", async () => {
    // The merchant writes one headline; it is not machine-translated.
    mocks.content.heroHeadline = "Made by hand";
    await i18n.changeLanguage("de");
    renderHome();
    expect(
      screen.getByRole("heading", { level: 1, name: "Made by hand" }),
    ).toBeTruthy();
    // The chrome around it still translates.
    expect(screen.getByText("Willkommen")).toBeTruthy();
  });

  it("renders the storefront copy in German when the language is de", async () => {
    await i18n.changeLanguage("de");
    mocks.products = [makeProduct({ id: 1, category: "Rings" })];
    renderHome();
    expect(screen.getByText("Willkommen")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "Zum Shop" });
    expect(cta.getAttribute("href")).toBe("/shop");
    expect(screen.getByText("Sicherer Checkout")).toBeTruthy();
    expect(screen.getByText("Neu im Shop")).toBeTruthy();
    expect(screen.queryByText("Explore the shop")).toBeNull();
  });
});
