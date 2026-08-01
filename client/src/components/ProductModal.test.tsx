import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import type { ProductItem } from "@shared/types";
import i18n from "@/lib/i18n";
import { formatPrice } from "@/lib/money";
import { CartProvider, useCart } from "@/contexts/CartContext";
import ProductModal from "./ProductModal";

const mocks = vi.hoisted(() => ({
  imagesData: [] as { id: number; imageUrl: string }[],
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    products: {
      // Extra images only load while the modal is open.
      getImages: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) => ({
          data: opts?.enabled ? mocks.imagesData : [],
        }),
      },
    },
  },
}));

// The embla carousel (multi-image path) needs ResizeObserver,
// IntersectionObserver and matchMedia, none of which jsdom implements.
class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("ResizeObserver", ObserverStub);
vi.stubGlobal("IntersectionObserver", ObserverStub);
vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
}));

// Intl emits non-breaking spaces; the DOM matcher normalizes them to plain ones.
const price = (amount: number) =>
  formatPrice(amount, "chf").replace(/\s/g, " ");

function makeProduct(overrides: Partial<ProductItem> = {}): ProductItem {
  return {
    id: 1,
    name: "Silver Moonstone Ring",
    description: "Delicate sterling silver ring with moonstone",
    nameEn: "Silver Moonstone Ring",
    descriptionEn: "Delicate sterling silver ring with moonstone",
    nameDe: null,
    descriptionDe: null,
    nameFr: null,
    descriptionFr: null,
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

/** Exposes real cart state so add-to-bag effects are observable in the DOM. */
function CartProbe() {
  const { items, isOpen } = useCart();
  return (
    <div data-testid="cart-probe" data-open={isOpen ? "yes" : "no"}>
      {items.map((i) => i.id).join(",")}
    </div>
  );
}

function renderModal(
  product: ProductItem,
  { open = true, onClose = vi.fn() } = {},
) {
  const utils = render(
    <CartProvider>
      <ProductModal product={product} open={open} onClose={onClose} />
      <CartProbe />
    </CartProvider>,
  );
  return { ...utils, onClose };
}

const probe = () => screen.getByTestId("cart-probe");

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.imagesData = [];
  localStorage.clear();
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("ProductModal", () => {
  it("renders nothing while closed", () => {
    renderModal(makeProduct(), { open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the product details and a link to the full page", () => {
    renderModal(makeProduct());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Silver Moonstone Ring")).toBeTruthy();
    expect(within(dialog).getByText("Rings")).toBeTruthy();
    expect(
      within(dialog).getByText("Delicate sterling silver ring with moonstone"),
    ).toBeTruthy();
    expect(within(dialog).getByText(price(185))).toBeTruthy();
    expect(within(dialog).getByText("Handpicked with care")).toBeTruthy();
    const link = within(dialog).getByRole("link", {
      name: /Silver Moonstone Ring/,
    });
    expect(link.getAttribute("href")).toBe("/product/1");
  });

  it("adds the piece to the bag, closes itself and opens the cart drawer", () => {
    const { onClose } = renderModal(makeProduct());
    fireEvent.click(screen.getByText("Add to Bag"));
    expect(probe().textContent).toBe("1");
    expect(probe().getAttribute("data-open")).toBe("yes");
    expect(onClose).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      '"Silver Moonstone Ring" added to your bag',
    );
  });

  it("shows 'In Your Bag' for a carted piece and only reopens the drawer", () => {
    localStorage.setItem(
      "kalakosh_cart",
      JSON.stringify([
        {
          id: 1,
          name: "Silver Moonstone Ring",
          nameEn: null,
          price: "185.00",
          imageUrl: null,
          category: "Rings",
        },
      ]),
    );
    const { onClose } = renderModal(makeProduct());
    expect(screen.queryByText("Add to Bag")).toBeNull();
    fireEvent.click(screen.getByText("In Your Bag"));
    expect(probe().textContent).toBe("1");
    expect(probe().getAttribute("data-open")).toBe("yes");
    // Reopening the drawer is not a dismissal.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes via the close button", () => {
    const { onClose } = renderModal(makeProduct());
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the title link navigates to the product page", () => {
    const { onClose } = renderModal(makeProduct());
    fireEvent.click(
      screen.getByRole("link", { name: /Silver Moonstone Ring/ }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("links a WhatsApp enquiry about the piece's availability", () => {
    renderModal(makeProduct());
    const wa = screen.getByRole("link", { name: /Enquire via WhatsApp/ });
    const href = wa.getAttribute("href") ?? "";
    expect(href.startsWith("https://wa.me/41791721714?text=")).toBe(true);
    expect(decodeURIComponent(href)).toContain(
      'interested in "Silver Moonstone Ring"',
    );
  });

  it("replaces Add to Bag with a similar-piece enquiry when sold", () => {
    renderModal(makeProduct({ sold: true }));
    expect(screen.queryByText("Add to Bag")).toBeNull();
    expect(screen.queryByText("In Your Bag")).toBeNull();
    const wa = screen.getByRole("link", { name: /Enquire via WhatsApp/ });
    expect(decodeURIComponent(wa.getAttribute("href") ?? "")).toContain(
      "a piece similar to",
    );
    expect(
      within(screen.getByRole("dialog")).getAllByText("Sold").length,
    ).toBeGreaterThan(0);
  });

  it("shows a placeholder when the product has no images", () => {
    renderModal(makeProduct({ imageUrl: null }));
    expect(within(screen.getByRole("dialog")).queryByRole("img")).toBeNull();
  });

  it("opens and closes the lightbox from a single image", () => {
    renderModal(makeProduct());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("img"));
    const lightbox = screen.getByRole("dialog", { name: "Full image view" });
    expect(lightbox).toBeTruthy();
    fireEvent.click(within(lightbox).getByLabelText("Close"));
    expect(
      screen.queryByRole("dialog", { name: "Full image view" }),
    ).toBeNull();
  });

  it("shows a German name and description when available", async () => {
    await i18n.changeLanguage("de");
    renderModal(
      makeProduct({
        nameDe: "Silberner Mondstein-Ring",
        descriptionDe: "Zarter Silberring mit Mondstein",
      }),
    );
    expect(screen.getByText("Silberner Mondstein-Ring")).toBeTruthy();
    expect(screen.getByText("Zarter Silberring mit Mondstein")).toBeTruthy();
  });

  describe("with extra images", () => {
    beforeEach(() => {
      mocks.imagesData = [
        { id: 10, imageUrl: "https://example.com/alt-1.jpg" },
        { id: 11, imageUrl: "https://example.com/alt-2.jpg" },
      ];
    });

    it("renders a carousel with one dot per image", () => {
      renderModal(makeProduct());
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getAllByRole("img")).toHaveLength(3);
      expect(within(dialog).getByLabelText("Go to image 1")).toBeTruthy();
      expect(within(dialog).getByLabelText("Go to image 3")).toBeTruthy();
      // Dot clicks delegate to the embla api; must not throw before init.
      fireEvent.click(within(dialog).getByLabelText("Go to image 2"));
    });

    it("opens the lightbox at the clicked slide and navigates it", () => {
      renderModal(makeProduct());
      const dialog = screen.getByRole("dialog");
      fireEvent.click(within(dialog).getByAltText("Silver Moonstone Ring 2"));

      const lightbox = screen.getByRole("dialog", { name: "Full image view" });
      expect(within(lightbox).getByText("2 / 3")).toBeTruthy();

      fireEvent.click(within(lightbox).getByLabelText("Next image"));
      expect(within(lightbox).getByText("3 / 3")).toBeTruthy();
      // Wraps around at the end.
      fireEvent.click(within(lightbox).getByLabelText("Next image"));
      expect(within(lightbox).getByText("1 / 3")).toBeTruthy();
      fireEvent.click(within(lightbox).getByLabelText("Previous image"));
      expect(within(lightbox).getByText("3 / 3")).toBeTruthy();

      fireEvent.click(within(lightbox).getByLabelText("Go to image 2"));
      expect(within(lightbox).getByText("2 / 3")).toBeTruthy();
    });

    it("closes the lightbox with the Escape key", () => {
      renderModal(makeProduct());
      fireEvent.click(
        within(screen.getByRole("dialog")).getByAltText(
          "Silver Moonstone Ring 1",
        ),
      );
      expect(
        screen.getByRole("dialog", { name: "Full image view" }),
      ).toBeTruthy();
      fireEvent.keyDown(document, { key: "Escape" });
      expect(
        screen.queryByRole("dialog", { name: "Full image view" }),
      ).toBeNull();
    });
  });
});
