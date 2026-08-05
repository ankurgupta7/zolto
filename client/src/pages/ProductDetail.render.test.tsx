import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Router, Route } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import en from "@/locales/en.json";
import type { ProductItem } from "@shared/types";
import { CartProvider, useCart, type CartItem } from "@/contexts/CartContext";
import ProductDetail from "./ProductDetail";

const CART_KEY = "kalakosh_cart";

type TestProduct = ProductItem & {
  nameIt?: string | null;
  descriptionIt?: string | null;
};

const mocks = vi.hoisted(() => ({
  product: undefined as unknown,
  isLoading: false,
  error: null as Error | null,
  extraImages: [] as { id: number; imageUrl: string }[],
  branding: {
    storeName: "Test Store",
    shortName: "Test",
    whatsappNumber: "41790000000",
    instagramHandle: null as string | null,
    contactEmail: null,
    logoUrl: null,
    logoUrlDark: null,
    currency: "chf",
    primaryColor: "#2D2620",
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    products: {
      getById: {
        useQuery: () => ({
          data: mocks.product,
          isLoading: mocks.isLoading,
          error: mocks.error,
        }),
      },
      getImages: { useQuery: () => ({ data: mocks.extraImages }) },
    },
  },
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    slug: "test",
    branding: mocks.branding,
    isLoading: false,
    notFound: false,
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeProduct(overrides: Partial<TestProduct> = {}): TestProduct {
  return {
    id: 7,
    name: "Perlenkette",
    description: "Süsswasserperlen an vergoldeten Haken",
    nameEn: "Pearl Necklace",
    descriptionEn: "Freshwater pearls on gold-filled hooks",
    nameDe: null,
    descriptionDe: null,
    nameFr: null,
    descriptionFr: null,
    nameIt: null,
    descriptionIt: null,
    price: "185.00",
    category: "Necklaces",
    imageKey: null,
    imageUrl: "https://example.com/necklace.jpg",
    visible: true,
    sold: false,
    quantity: 1,
    source: "manual",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Observes the real CartProvider state so add-to-bag/open-drawer effects are
// asserted through real context rather than mock call counts.
function CartProbe() {
  const { isOpen, count } = useCart();
  return <div data-testid="cart-probe" data-open={isOpen} data-count={count} />;
}

const probe = () => screen.getByTestId("cart-probe");

function renderDetail(path = "/product/7") {
  const { hook, history } = memoryLocation({ path, record: true });
  const view = render(
    <Router hook={hook}>
      <CartProvider>
        <Route path="/product/:id" component={ProductDetail} />
        <CartProbe />
      </CartProvider>
    </Router>,
  );
  return { ...view, history };
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.product = makeProduct();
  mocks.isLoading = false;
  mocks.error = null;
  mocks.extraImages = [];
  mocks.branding.whatsappNumber = "41790000000";
  // jsdom ships none of these; embla's carousel needs all three to mount.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
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
  await i18n.changeLanguage("en");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProductDetail page", () => {
  it("shows a skeleton while loading", () => {
    mocks.product = undefined;
    mocks.isLoading = true;
    const { container } = renderDetail();
    expect(container.querySelector(".animate-pulse")).toBeTruthy();
    expect(screen.queryByText(en.product.addToBag)).toBeNull();
  });

  it("shows the unavailable state when the product cannot be loaded", () => {
    mocks.product = undefined;
    mocks.error = new Error("NOT_FOUND");
    renderDetail();
    expect(screen.getByText("This piece is unavailable")).toBeTruthy();
    const back = screen.getByRole("link", { name: /back to shop/i });
    expect(back.getAttribute("href")).toBe("/shop");
  });

  it("renders name, description, price, category, and breadcrumbs", () => {
    renderDetail();
    // Header h1 and the details h2 both carry the localized name.
    expect(screen.getAllByText("Pearl Necklace").length).toBeGreaterThan(1);
    expect(
      screen.getByText("Freshwater pearls on gold-filled hooks"),
    ).toBeTruthy();
    expect(screen.getByText("CHF 185.00")).toBeTruthy();
    expect(screen.getAllByText("Necklaces").length).toBeGreaterThan(0);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/");
    expect(hrefs).toContain("/shop");
  });

  it("falls back to the primary name when the active locale has no translation", async () => {
    await i18n.changeLanguage("de");
    mocks.product = makeProduct({ nameDe: null });
    renderDetail();
    expect(screen.getAllByText("Perlenkette").length).toBeGreaterThan(0);
    cleanup();
    mocks.product = makeProduct({ nameDe: "Perlenkette Deluxe" });
    renderDetail();
    expect(screen.getAllByText("Perlenkette Deluxe").length).toBeGreaterThan(0);
  });

  it("adds the piece to the bag, opens the drawer, and flips to the in-bag state", () => {
    renderDetail();
    expect(probe().getAttribute("data-count")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: en.product.addToBag }));
    expect(probe().getAttribute("data-count")).toBe("1");
    expect(probe().getAttribute("data-open")).toBe("true");
    expect(toast.success).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: en.product.inBag })).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
    expect(stored.map((i: CartItem) => i.id)).toEqual([7]);
  });

  it("opens the cart drawer when the piece is already in the bag", () => {
    localStorage.setItem(
      CART_KEY,
      JSON.stringify([
        {
          id: 7,
          name: "Perlenkette",
          nameEn: "Pearl Necklace",
          nameDe: null,
          nameFr: null,
          price: "185.00",
          imageUrl: null,
          category: "Necklaces",
        },
      ]),
    );
    renderDetail();
    const inBag = screen.getByRole("button", { name: en.product.inBag });
    expect(screen.queryByText(en.product.addToBag)).toBeNull();
    expect(probe().getAttribute("data-open")).toBe("false");
    fireEvent.click(inBag);
    expect(probe().getAttribute("data-open")).toBe("true");
  });

  it("disables purchase for a sold piece and offers a WhatsApp enquiry instead", () => {
    mocks.product = makeProduct({ sold: true });
    renderDetail();
    expect(screen.queryByText(en.product.addToBag)).toBeNull();
    expect(screen.getAllByText(en.product.sold).length).toBeGreaterThan(0);
    const wa = screen.getByRole("link", {
      name: new RegExp(en.product.enquireWhatsApp, "i"),
    });
    expect(wa.getAttribute("href")).toContain("https://wa.me/41790000000");
  });

  it("hides the WhatsApp enquiry when the tenant has no number", () => {
    mocks.branding.whatsappNumber = null as unknown as string;
    renderDetail();
    expect(
      screen.queryByRole("link", {
        name: new RegExp(en.product.enquireWhatsApp, "i"),
      }),
    ).toBeNull();
  });

  it("opens and closes the lightbox from the single product image", async () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: /pearl necklace/i }));
    const dialog = await screen.findByRole("dialog", {
      name: "Full image view",
    });
    expect(dialog).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Full image view" }),
      ).toBeNull(),
    );
  });

  it("renders a carousel for multiple images and steps the lightbox through them", async () => {
    mocks.extraImages = [{ id: 11, imageUrl: "https://example.com/b.jpg" }];
    renderDetail();
    // Counter and dot indicators prove the multi-image branch rendered.
    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "Go to image 2" }).length,
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /pearl necklace 1/i }));
    await screen.findByRole("dialog", { name: "Full image view" });
    expect(screen.getByAltText("View 1 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next image" }));
    expect(screen.getByAltText("View 2 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
    expect(screen.getByAltText("View 1 of 2")).toBeTruthy();
  });
});
