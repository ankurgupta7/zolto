import { describe, expect, it } from "vitest";
import {
  activeCategories,
  addCustomItem,
  buildSalePayload,
  cartTotalRappen,
  filterProducts,
  formatMinor,
  isBargained,
  parsePriceToRappen,
  removeLine,
  resetLinePrice,
  setLinePrice,
  toggleProduct,
  type TillCartLine,
  type TillProduct,
} from "./Till.logic";

function product(overrides: Partial<TillProduct> = {}): TillProduct {
  return {
    id: 1,
    name: "Silberne Ohrringe",
    nameEn: "Silver Earrings",
    category: "Earrings",
    imageUrl: null,
    visible: true,
    quantity: 1,
    priceRappen: 4500,
    ...overrides,
  };
}

function line(overrides: Partial<TillCartLine> = {}): TillCartLine {
  return {
    key: "1",
    productId: 1,
    name: "Silberne Ohrringe",
    listPriceRappen: 4500,
    priceRappen: 4500,
    ...overrides,
  };
}

describe("parsePriceToRappen", () => {
  it("accepts whole francs and two decimal places", () => {
    expect(parsePriceToRappen("45")).toBe(4500);
    expect(parsePriceToRappen("45.50")).toBe(4550);
    expect(parsePriceToRappen("0.05")).toBe(5);
  });

  it("accepts a comma, which is what a Swiss keyboard offers first", () => {
    expect(parsePriceToRappen("45,50")).toBe(4550);
  });

  it("rejects anything it would have to guess about", () => {
    // A misread price is charged for real, so nothing here may be interpreted
    // generously — "45.5.5" or "CHF 45" must fail rather than become a number.
    expect(parsePriceToRappen("")).toBeNull();
    expect(parsePriceToRappen("abc")).toBeNull();
    expect(parsePriceToRappen("45.5.5")).toBeNull();
    expect(parsePriceToRappen("CHF 45")).toBeNull();
    expect(parsePriceToRappen("-45")).toBeNull();
    expect(parsePriceToRappen("45.555")).toBeNull();
  });
});

describe("toggleProduct", () => {
  it("adds a product at its list price", () => {
    const lines = toggleProduct([], product());
    expect(lines).toHaveLength(1);
    expect(lines[0].priceRappen).toBe(4500);
    expect(lines[0].listPriceRappen).toBe(4500);
  });

  it("removes the product when tapped again rather than adding it twice", () => {
    // Duplicated ids fail the backend's stale-cart check outright, so the grid
    // must never be able to produce them.
    const once = toggleProduct([], product());
    expect(toggleProduct(once, product())).toHaveLength(0);
  });
});

describe("cart edits", () => {
  it("keeps the list price when a line is bargained down", () => {
    const lines = setLinePrice([line()], "1", 4000);
    expect(lines[0].priceRappen).toBe(4000);
    expect(lines[0].listPriceRappen).toBe(4500);
    expect(isBargained(lines[0])).toBe(true);
  });

  it("restores the list price on reset", () => {
    const bargained = setLinePrice([line()], "1", 4000);
    expect(resetLinePrice(bargained, "1")[0].priceRappen).toBe(4500);
  });

  it("leaves a custom item alone on reset — it has no list price", () => {
    const custom = addCustomItem([], "Repair", 2000, "a");
    expect(resetLinePrice(custom, custom[0].key)[0].priceRappen).toBe(2000);
    expect(isBargained(custom[0])).toBe(false);
  });

  it("removes a line by key", () => {
    expect(removeLine([line()], "1")).toHaveLength(0);
  });
});

describe("cartTotalRappen", () => {
  it("sums the charged prices, not the list prices", () => {
    const lines = [
      line({ key: "1", productId: 1, priceRappen: 4000 }),
      line({ key: "2", productId: 2, priceRappen: 3000 }),
    ];
    expect(cartTotalRappen(lines)).toBe(7000);
  });

  it("is zero for an empty cart", () => {
    expect(cartTotalRappen([])).toBe(0);
  });
});

describe("buildSalePayload", () => {
  it("sends overrides only for lines actually bargained", () => {
    const lines = [
      line({ key: "1", productId: 1, priceRappen: 4500 }),
      line({
        key: "2",
        productId: 2,
        priceRappen: 3000,
        listPriceRappen: 3500,
      }),
    ];
    const payload = buildSalePayload(lines);
    expect(payload.productIds).toEqual([1, 2]);
    expect(payload.priceOverrides).toEqual({ "2": 3000 });
  });

  it("separates custom items from catalogue ids", () => {
    const lines = addCustomItem([line()], "Gift wrap", 500, "a");
    const payload = buildSalePayload(lines);
    expect(payload.productIds).toEqual([1]);
    expect(payload.customItems).toEqual([
      { name: "Gift wrap", priceRappen: 500 },
    ]);
  });

  it("produces an empty payload for an empty cart", () => {
    expect(buildSalePayload([])).toEqual({
      productIds: [],
      priceOverrides: {},
      customItems: [],
    });
  });
});

describe("filterProducts", () => {
  const catalogue = [
    product({ id: 1, name: "Silberne Ohrringe", nameEn: "Silver Earrings" }),
    product({
      id: 2,
      name: "Gold Halskette",
      nameEn: "Gold Necklace",
      category: "Necklaces",
    }),
    product({
      id: 3,
      name: "Set Perle",
      nameEn: "Pearl Set",
      category: "Sets",
    }),
  ];

  it("matches the German name, the English one, and the category", () => {
    expect(filterProducts(catalogue, "ohrringe", null).map(p => p.id)).toEqual([
      1,
    ]);
    expect(filterProducts(catalogue, "necklace", null).map(p => p.id)).toEqual([
      2,
    ]);
    expect(filterProducts(catalogue, "sets", null).map(p => p.id)).toEqual([3]);
  });

  it("folds extra-included categories into their parent", () => {
    // Sets show under Necklaces on the website; the till has to agree.
    const filtered = filterProducts(catalogue, "", "Necklaces", {
      Necklaces: ["Sets"],
    });
    expect(filtered.map(p => p.id)).toEqual([2, 3]);
  });

  it("returns everything when nothing is being filtered on", () => {
    expect(filterProducts(catalogue, "", null)).toHaveLength(3);
  });
});

describe("activeCategories", () => {
  it("keeps canonical order and drops categories with nothing in stock", () => {
    const catalogue = [
      product({ id: 1, category: "Necklaces" }),
      product({ id: 2, category: "Earrings" }),
    ];
    expect(
      activeCategories(catalogue, ["Earrings", "Necklaces", "Rings"])
    ).toEqual(["Earrings", "Necklaces"]);
  });
});

describe("formatMinor", () => {
  it("always shows two decimals", () => {
    expect(formatMinor(4500)).toBe("CHF 45.00");
    expect(formatMinor(5)).toBe("CHF 0.05");
    expect(formatMinor(0)).toBe("CHF 0.00");
  });

  it("uses the store's own currency — not every Zolto store is Swiss", () => {
    expect(formatMinor(4500, "eur")).toBe("EUR 45.00");
  });
});
