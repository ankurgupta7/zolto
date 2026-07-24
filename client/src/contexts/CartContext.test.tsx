import { describe, expect, it, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ProductItem } from "@shared/types";
import { CartProvider, useCart } from "./CartContext";

const STORAGE_KEY = "kalakosh_cart";

function makeProduct(overrides: Partial<ProductItem> = {}): ProductItem {
  return {
    id: 1,
    name: "Silver Moonstone Ring",
    description: "Delicate sterling silver ring with moonstone",
    nameEn: "Silver Moonstone Ring",
    descriptionEn: "Delicate sterling silver ring with moonstone",
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

function renderCart() {
  return renderHook(() => useCart(), { wrapper: CartProvider });
}

beforeEach(() => {
  localStorage.clear();
});

describe("useCart", () => {
  it("throws when used outside a CartProvider", () => {
    expect(() => renderHook(() => useCart())).toThrow(/within a CartProvider/);
  });

  it("starts empty when localStorage has no cart", () => {
    const { result } = renderCart();
    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
    expect(result.current.total).toBe(0);
  });

  it("adds an item to the cart", () => {
    const { result } = renderCart();
    act(() => result.current.addItem(makeProduct()));

    expect(result.current.count).toBe(1);
    expect(result.current.has(1)).toBe(true);
    expect(result.current.items[0]).toMatchObject({
      id: 1,
      name: "Silver Moonstone Ring",
    });
  });

  it("does not add the same product twice", () => {
    const { result } = renderCart();
    act(() => result.current.addItem(makeProduct()));
    act(() => result.current.addItem(makeProduct()));

    expect(result.current.count).toBe(1);
  });

  it("removes an item from the cart", () => {
    const { result } = renderCart();
    act(() => result.current.addItem(makeProduct({ id: 1 })));
    act(() =>
      result.current.addItem(
        makeProduct({ id: 2, name: "Pearl Earrings", price: "120.00" }),
      ),
    );
    act(() => result.current.removeItem(1));

    expect(result.current.count).toBe(1);
    expect(result.current.has(1)).toBe(false);
    expect(result.current.has(2)).toBe(true);
  });

  it("clears all items", () => {
    const { result } = renderCart();
    act(() => result.current.addItem(makeProduct({ id: 1 })));
    act(() => result.current.addItem(makeProduct({ id: 2 })));
    act(() => result.current.clear());

    expect(result.current.items).toEqual([]);
    expect(result.current.count).toBe(0);
  });

  it("computes total as the sum of item prices", () => {
    const { result } = renderCart();
    act(() => result.current.addItem(makeProduct({ id: 1, price: "185.00" })));
    act(() => result.current.addItem(makeProduct({ id: 2, price: "120.50" })));

    expect(result.current.total).toBeCloseTo(305.5);
  });

  it("persists cart contents to localStorage", () => {
    const { result } = renderCart();
    act(() => result.current.addItem(makeProduct({ id: 1 })));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe(1);
  });

  it("loads cart contents from localStorage on mount", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 9,
          name: "Existing Item",
          nameEn: null,
          price: "50.00",
          imageUrl: null,
          category: "Other",
        },
      ]),
    );

    const { result } = renderCart();
    expect(result.current.count).toBe(1);
    expect(result.current.has(9)).toBe(true);
  });

  it("ignores corrupted localStorage data and starts empty", () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    const { result } = renderCart();
    expect(result.current.items).toEqual([]);
  });

  it("controls cart drawer open state", () => {
    const { result } = renderCart();
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.openCart());
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.closeCart());
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.setOpen(true));
    expect(result.current.isOpen).toBe(true);
  });
});
