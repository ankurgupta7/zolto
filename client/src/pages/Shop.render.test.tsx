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
import { CartProvider, useCart } from "@/contexts/CartContext";
import Shop from "./Shop";

const mocks = vi.hoisted(() => ({
  authState: { user: null as { role: string } | null },
  productsData: undefined as unknown[] | undefined,
  isLoading: false,
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => mocks.authState }));
vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));
// Covers Shop's list query plus the queries/mutations of the real ProductCard
// and ProductModal rendered beneath it.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      products: {
        list: { invalidate: vi.fn() },
        adminList: { invalidate: vi.fn() },
      },
    }),
    products: {
      list: {
        useQuery: () => ({
          data: mocks.productsData,
          isLoading: mocks.isLoading,
        }),
      },
      getImages: { useQuery: () => ({ data: [] }) },
      toggleVisibility: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      toggleSold: {
        useMutation: () => ({ mutate: vi.fn(), isPending: false }),
      },
      delete: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

let nextId = 1;
function makeProduct(overrides: Partial<ProductItem> = {}): ProductItem {
  return {
    id: nextId++,
    name: "Silver Moonstone Ring",
    description: "Delicate sterling silver ring with moonstone",
    nameEn: null,
    descriptionEn: null,
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

function fixtures(): ProductItem[] {
  return [
    makeProduct({ name: "Moonstone Ring", category: "Rings" }),
    makeProduct({ name: "Pearl Necklace", category: "Necklaces" }),
    makeProduct({ name: "Bridal Set", category: "Sets" }),
  ];
}

/** Exposes real cart state so the card → modal → bag path is observable. */
function CartProbe() {
  const { items, isOpen } = useCart();
  return (
    <div data-testid="cart-probe" data-open={isOpen ? "yes" : "no"}>
      {items.map((i) => i.name).join(",")}
    </div>
  );
}

function renderShop() {
  return render(
    <CartProvider>
      <Shop />
      <CartProbe />
    </CartProvider>,
  );
}

function categoryButton(name: string) {
  return screen.getByRole("button", { name });
}

function countLine() {
  return screen.getByText(/\d+ pieces?/).textContent;
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.authState.user = null;
  mocks.productsData = fixtures();
  mocks.isLoading = false;
  nextId = 1;
  localStorage.clear();
  window.history.replaceState({}, "", "/shop");
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("Shop page", () => {
  it("shows loading skeletons while the catalogue loads", () => {
    mocks.productsData = undefined;
    mocks.isLoading = true;
    const { container } = renderShop();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(8);
    expect(screen.queryByText(/pieces?/)).toBeNull();
  });

  it("renders every visible product with the piece count", () => {
    renderShop();
    expect(screen.getByText("The Collection")).toBeTruthy();
    expect(screen.getByText("Moonstone Ring")).toBeTruthy();
    expect(screen.getByText("Pearl Necklace")).toBeTruthy();
    expect(screen.getByText("Bridal Set")).toBeTruthy();
    expect(countLine()).toBe("3 pieces");
  });

  it("only offers category filters that have products", () => {
    renderShop();
    expect(categoryButton("All")).toBeTruthy();
    expect(categoryButton("Rings")).toBeTruthy();
    expect(categoryButton("Necklaces")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Earrings" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Bracelets" })).toBeNull();
  });

  it("filters to a category on click and back out via All", () => {
    renderShop();
    fireEvent.click(categoryButton("Rings"));
    expect(screen.getByText("Moonstone Ring")).toBeTruthy();
    expect(screen.queryByText("Pearl Necklace")).toBeNull();
    expect(screen.queryByText("Bridal Set")).toBeNull();
    expect(countLine()).toBe("1 piece in Rings");

    fireEvent.click(categoryButton("All"));
    expect(screen.getByText("Pearl Necklace")).toBeTruthy();
    expect(countLine()).toBe("3 pieces");
  });

  it("folds Sets into the Necklaces listing", () => {
    renderShop();
    fireEvent.click(categoryButton("Necklaces"));
    expect(screen.getByText("Pearl Necklace")).toBeTruthy();
    expect(screen.getByText("Bridal Set")).toBeTruthy();
    expect(screen.queryByText("Moonstone Ring")).toBeNull();
    expect(countLine()).toBe("2 pieces in Necklaces");
  });

  it("preselects the category from the URL query param", () => {
    window.history.replaceState({}, "", "/shop?category=Rings");
    renderShop();
    expect(countLine()).toBe("1 piece in Rings");
    expect(screen.queryByText("Pearl Necklace")).toBeNull();
  });

  it("ignores an unknown category in the URL", () => {
    window.history.replaceState({}, "", "/shop?category=Gemstones");
    renderShop();
    expect(countLine()).toBe("3 pieces");
  });

  it("shows the curated empty state when there are no products", () => {
    mocks.productsData = [];
    renderShop();
    expect(screen.getByText("No pieces yet")).toBeTruthy();
    expect(
      screen.getByText("The collection is being curated. Check back soon."),
    ).toBeTruthy();
  });

  it("adds a piece to the bag through the card's modal", () => {
    renderShop();
    fireEvent.click(
      screen.getByRole("article", { name: "View Moonstone Ring" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Add to Bag"));

    const probe = screen.getByTestId("cart-probe");
    expect(probe.textContent).toBe("Moonstone Ring");
    // The drawer is asked to open right after adding.
    expect(probe.getAttribute("data-open")).toBe("yes");
    expect(mocks.toastSuccess).toHaveBeenCalledWith(
      '"Moonstone Ring" added to your bag',
    );
  });
});
