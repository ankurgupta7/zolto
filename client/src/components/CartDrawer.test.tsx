import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import i18n from "@/lib/i18n";
import { formatPrice } from "@/lib/money";
import { CartProvider, useCart } from "@/contexts/CartContext";
import CartDrawer from "./CartDrawer";

const STORAGE_KEY = "kalakosh_cart";

// Intl emits non-breaking spaces; the DOM matcher normalizes them to plain ones.
const price = (amount: number) =>
  formatPrice(amount, "chf").replace(/\s/g, " ");

interface StoredItem {
  id: number;
  name: string;
  nameEn: string | null;
  nameDe?: string | null;
  price: string;
  imageUrl: string | null;
  category: string;
}

function seedCart(items: StoredItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

const RING: StoredItem = {
  id: 1,
  name: "Silver Moonstone Ring",
  nameEn: null,
  price: "185.00",
  imageUrl: "https://example.com/ring.jpg",
  category: "Rings",
};

const EARRINGS: StoredItem = {
  id: 2,
  name: "Pearl Earrings",
  nameEn: null,
  price: "120.50",
  imageUrl: null,
  category: "Earrings",
};

/** In-provider trigger so tests open the drawer through real cart state. */
function OpenTrigger() {
  const { openCart } = useCart();
  return (
    <button type="button" data-testid="open-cart" onClick={openCart}>
      open
    </button>
  );
}

function renderDrawer() {
  const { hook, history } = memoryLocation({ path: "/", record: true });
  const utils = render(
    <Router hook={hook}>
      <CartProvider>
        <CartDrawer />
        <OpenTrigger />
      </CartProvider>
    </Router>,
  );
  return { ...utils, history };
}

function openDrawer() {
  fireEvent.click(screen.getByTestId("open-cart"));
  return screen.getByRole("dialog");
}

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await i18n.changeLanguage("en");
});

afterEach(() => cleanup());

describe("CartDrawer", () => {
  it("stays hidden until the cart is opened", () => {
    renderDrawer();
    expect(screen.queryByRole("dialog")).toBeNull();
    openDrawer();
    expect(screen.getByText("Your Bag")).toBeTruthy();
  });

  it("shows an empty state when the bag has no items", () => {
    renderDrawer();
    openDrawer();
    expect(screen.getByText("Your bag is empty.")).toBeTruthy();
    expect(screen.queryByText("Proceed to Checkout")).toBeNull();
  });

  it("lists items with name, category, price, count and subtotal", () => {
    seedCart([RING, EARRINGS]);
    renderDrawer();
    const drawer = openDrawer();
    expect(within(drawer).getByText("Silver Moonstone Ring")).toBeTruthy();
    expect(within(drawer).getByText("Pearl Earrings")).toBeTruthy();
    expect(within(drawer).getByText("Rings")).toBeTruthy();
    expect(within(drawer).getByText("(2)")).toBeTruthy();
    expect(within(drawer).getByText(price(185))).toBeTruthy();
    expect(within(drawer).getByText(price(120.5))).toBeTruthy();
    expect(within(drawer).getByText(price(305.5))).toBeTruthy();
  });

  it("removes an item and recomputes count and subtotal", () => {
    seedCart([RING, EARRINGS]);
    renderDrawer();
    const drawer = openDrawer();
    const removeButtons = within(drawer).getAllByLabelText("Remove");
    expect(removeButtons).toHaveLength(2);

    fireEvent.click(removeButtons[0]);
    expect(within(drawer).queryByText("Silver Moonstone Ring")).toBeNull();
    expect(within(drawer).getByText("Pearl Earrings")).toBeTruthy();
    expect(within(drawer).getByText("(1)")).toBeTruthy();
    // Item price and subtotal now agree.
    expect(within(drawer).getAllByText(price(120.5))).toHaveLength(2);

    fireEvent.click(within(drawer).getByLabelText("Remove"));
    expect(within(drawer).getByText("Your bag is empty.")).toBeTruthy();
  });

  it("navigates to checkout and closes the drawer", () => {
    seedCart([RING]);
    const { history } = renderDrawer();
    const drawer = openDrawer();
    fireEvent.click(within(drawer).getByText("Proceed to Checkout"));
    expect(history).toContain("/checkout");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes without navigating via Continue Shopping", () => {
    seedCart([RING]);
    const { history } = renderDrawer();
    const drawer = openDrawer();
    fireEvent.click(within(drawer).getByText("Continue Shopping"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(history).toEqual(["/"]);
    // The bag keeps its contents for next time.
    fireEvent.click(screen.getByTestId("open-cart"));
    expect(screen.getByText("Silver Moonstone Ring")).toBeTruthy();
  });

  it("closes via the sheet's built-in close button", () => {
    seedCart([RING]);
    renderDrawer();
    const drawer = openDrawer();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows localized item names when the shop language is German", async () => {
    await i18n.changeLanguage("de");
    seedCart([{ ...RING, nameDe: "Silberner Mondstein-Ring" }, EARRINGS]);
    renderDrawer();
    const drawer = openDrawer();
    expect(within(drawer).getByText("Silberner Mondstein-Ring")).toBeTruthy();
    // Null locale column falls back to the primary name.
    expect(within(drawer).getByText("Pearl Earrings")).toBeTruthy();
  });
});
