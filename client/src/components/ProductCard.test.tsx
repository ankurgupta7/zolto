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
import { CartProvider } from "@/contexts/CartContext";
import ProductCard from "./ProductCard";

const mocks = vi.hoisted(() => ({
  authState: { user: null as { role: string } | null },
  imagesData: [] as { id: number; imageUrl: string }[],
  toggleVisibility: vi.fn(),
  toggleSold: vi.fn(),
  deleteProduct: vi.fn(),
  listInvalidate: vi.fn(),
  adminListInvalidate: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      products: {
        list: { invalidate: mocks.listInvalidate },
        adminList: { invalidate: mocks.adminListInvalidate },
      },
    }),
    products: {
      // Honors `enabled` so the hover-gated lazy image load is exercised.
      getImages: {
        useQuery: (_input: unknown, opts?: { enabled?: boolean }) => ({
          data: opts?.enabled ? mocks.imagesData : [],
        }),
      },
      toggleVisibility: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mocks.toggleVisibility(args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      toggleSold: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mocks.toggleSold(args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      delete: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (args: unknown) => {
            mocks.deleteProduct(args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
  },
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

function renderCard(product: ProductItem, onMutated?: () => void) {
  return render(
    <CartProvider>
      <ProductCard product={product} onMutated={onMutated} />
    </CartProvider>,
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.authState.user = null;
  mocks.imagesData = [];
  localStorage.clear();
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("ProductCard", () => {
  it("renders name, category, description and formatted price", () => {
    renderCard(makeProduct());
    expect(screen.getByText("Silver Moonstone Ring")).toBeTruthy();
    expect(screen.getByText("Rings")).toBeTruthy();
    expect(
      screen.getByText("Delicate sterling silver ring with moonstone"),
    ).toBeTruthy();
    expect(screen.getByText(price(185))).toBeTruthy();
  });

  it("shows a placeholder instead of an image when imageUrl is missing", () => {
    renderCard(makeProduct({ imageUrl: null }));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getAllByText("◇").length).toBeGreaterThan(0);
  });

  it("hides admin controls from shoppers", () => {
    renderCard(makeProduct());
    expect(screen.queryByTitle("Delete permanently")).toBeNull();
    expect(screen.queryByTitle("Mark as sold")).toBeNull();
    expect(screen.queryByTitle("Hide from shop")).toBeNull();
  });

  it("opens the product modal on click", () => {
    renderCard(makeProduct());
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("article"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Add to Bag")).toBeTruthy();
  });

  it("opens the product modal on Enter", () => {
    renderCard(makeProduct());
    fireEvent.keyDown(screen.getByRole("article"), { key: "Enter" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("marks a sold piece with a badge and struck-through price", () => {
    renderCard(makeProduct({ sold: true }));
    // Badge over the photo plus the label next to the price.
    expect(screen.getAllByText("Sold").length).toBe(2);
    expect(screen.getByText(price(185)).className).toContain("line-through");
  });

  it("shows a German name when the shop language is German", async () => {
    await i18n.changeLanguage("de");
    renderCard(makeProduct({ nameDe: "Silberner Mondstein-Ring" }));
    expect(screen.getByText("Silberner Mondstein-Ring")).toBeTruthy();
  });

  it("falls back to the primary name when the German column is null", async () => {
    await i18n.changeLanguage("de");
    renderCard(makeProduct({ nameDe: null }));
    expect(screen.getByText("Silver Moonstone Ring")).toBeTruthy();
  });

  describe("hover image carousel", () => {
    beforeEach(() => {
      mocks.imagesData = [{ id: 2, imageUrl: "https://example.com/alt.jpg" }];
    });

    it("only loads extra images once hovered", () => {
      renderCard(makeProduct());
      expect(screen.queryByLabelText("Next image")).toBeNull();
      fireEvent.mouseEnter(screen.getByRole("article"));
      expect(screen.getByLabelText("Next image")).toBeTruthy();
      expect(screen.getByLabelText("Previous image")).toBeTruthy();
    });

    it("steps through images with the arrows without opening the modal", () => {
      renderCard(makeProduct());
      fireEvent.mouseEnter(screen.getByRole("article"));
      const imgs = screen.getAllByRole("img") as HTMLImageElement[];
      expect(imgs[0].style.opacity).toBe("1");
      expect(imgs[1].style.opacity).toBe("0");

      fireEvent.click(screen.getByLabelText("Next image"));
      expect(imgs[0].style.opacity).toBe("0");
      expect(imgs[1].style.opacity).toBe("1");
      expect(screen.queryByRole("dialog")).toBeNull();

      fireEvent.click(screen.getByLabelText("Previous image"));
      expect(imgs[0].style.opacity).toBe("1");
    });

    it("jumps to an image via its dot indicator", () => {
      renderCard(makeProduct());
      fireEvent.mouseEnter(screen.getByRole("article"));
      fireEvent.click(screen.getByLabelText("Image 2 of 2"));
      const imgs = screen.getAllByRole("img") as HTMLImageElement[];
      expect(imgs[1].style.opacity).toBe("1");
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("resets to the first image when the pointer leaves", () => {
      renderCard(makeProduct());
      const article = screen.getByRole("article");
      fireEvent.mouseEnter(article);
      fireEvent.click(screen.getByLabelText("Next image"));
      fireEvent.mouseLeave(article);
      // Un-hovering drops the extra images and their controls again.
      expect(screen.queryByLabelText("Next image")).toBeNull();
      const imgs = screen.getAllByRole("img") as HTMLImageElement[];
      expect(imgs[0].style.opacity).toBe("1");
    });
  });

  describe("admin controls", () => {
    beforeEach(() => {
      mocks.authState.user = { role: "admin" };
    });

    it("shows the controls to the platform owner (superadmin) too", () => {
      mocks.authState.user = { role: "superadmin" };
      renderCard(makeProduct());
      expect(screen.getByTitle("Mark as sold")).toBeTruthy();
    });

    it("toggles sold status without opening the modal", () => {
      const onMutated = vi.fn();
      renderCard(makeProduct(), onMutated);
      fireEvent.click(screen.getByTitle("Mark as sold"));
      expect(mocks.toggleSold).toHaveBeenCalledWith({ id: 1, sold: true });
      expect(mocks.toastSuccess).toHaveBeenCalledWith("Product marked as sold");
      expect(mocks.listInvalidate).toHaveBeenCalled();
      expect(mocks.adminListInvalidate).toHaveBeenCalled();
      expect(onMutated).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("marks a sold piece as available again", () => {
      renderCard(makeProduct({ sold: true }));
      fireEvent.click(screen.getByTitle("Mark as available"));
      expect(mocks.toggleSold).toHaveBeenCalledWith({ id: 1, sold: false });
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Product marked as available",
      );
    });

    it("hides a visible product from the shop", () => {
      renderCard(makeProduct());
      fireEvent.click(screen.getByTitle("Hide from shop"));
      expect(mocks.toggleVisibility).toHaveBeenCalledWith({
        id: 1,
        visible: false,
      });
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        "Product hidden from shop",
      );
    });

    it("re-shows a hidden product", () => {
      renderCard(makeProduct({ visible: false }));
      fireEvent.click(screen.getByTitle("Show in shop"));
      expect(mocks.toggleVisibility).toHaveBeenCalledWith({
        id: 1,
        visible: true,
      });
    });

    it("deletes only after the confirm dialog is accepted", () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
      renderCard(makeProduct());
      fireEvent.click(screen.getByTitle("Delete permanently"));
      expect(mocks.deleteProduct).not.toHaveBeenCalled();

      confirmSpy.mockReturnValue(true);
      fireEvent.click(screen.getByTitle("Delete permanently"));
      expect(mocks.deleteProduct).toHaveBeenCalledWith({ id: 1 });
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        '"Silver Moonstone Ring" deleted',
      );
      confirmSpy.mockRestore();
    });
  });
});
