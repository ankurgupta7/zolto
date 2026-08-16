/**
 * The till's cart arithmetic, kept out of the component so it can be tested
 * without rendering anything. Everything is in minor units (Rappen, cents) —
 * the till never does float arithmetic on money.
 */

export interface TillProduct {
  id: number;
  name: string;
  nameEn: string | null;
  category: string;
  imageUrl: string | null;
  visible: boolean;
  quantity: number;
  priceRappen: number;
}

export interface TillCartLine {
  /** Stable within a cart. Catalogue lines use the product id. */
  key: string;
  productId: number | null;
  name: string;
  /** Null for custom items — there is no list price to have bargained from. */
  listPriceRappen: number | null;
  /** What the customer is actually being charged. */
  priceRappen: number;
}

export interface SalePayload {
  productIds: number[];
  priceOverrides: Record<string, number>;
  customItems: { name: string; priceRappen: number }[];
}

export function cartTotalRappen(lines: TillCartLine[]): number {
  return lines.reduce((sum, line) => sum + line.priceRappen, 0);
}

/**
 * Money as the cashier reads it. The currency is the store's own, so it is
 * passed in rather than assumed — Zolto stores are not all Swiss.
 */
export function formatMinor(minor: number, currency = "CHF"): string {
  return `${currency.toUpperCase()} ${(minor / 100).toFixed(2)}`;
}

/**
 * Parses what a cashier typed into a price field. Accepts "45", "45.50",
 * "45,50" — much of continental Europe types the comma first — and rejects
 * anything else rather than guessing, since a misread price is charged for
 * real.
 */
export function parsePriceToRappen(input: string): number | null {
  const trimmed = input.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  const rappen = Math.round(Number(trimmed) * 100);
  return Number.isFinite(rappen) ? rappen : null;
}

/**
 * Adds a catalogue product, or removes it if it is already in the cart.
 *
 * A product can appear at most once. The backend resolves `productIds` with a
 * single `IN (...)` query and then checks that it got back exactly as many
 * rows as ids it was sent, so a duplicated id resolves to one row, fails that
 * check, and rejects the whole sale as a stale cart. Each piece is one-of-a-
 * kind anyway, which is why that check is right and this is a toggle.
 */
export function toggleProduct(
  lines: TillCartLine[],
  product: TillProduct,
): TillCartLine[] {
  const key = String(product.id);
  const existing = lines.find((line) => line.key === key);
  if (existing) return lines.filter((line) => line.key !== key);

  return [
    ...lines,
    {
      key,
      productId: product.id,
      name: product.name,
      listPriceRappen: product.priceRappen,
      priceRappen: product.priceRappen,
    },
  ];
}

export function removeLine(lines: TillCartLine[], key: string): TillCartLine[] {
  return lines.filter((line) => line.key !== key);
}

/** Applies a bargained price to one line, leaving the list price recorded. */
export function setLinePrice(
  lines: TillCartLine[],
  key: string,
  priceRappen: number,
): TillCartLine[] {
  return lines.map((line) =>
    line.key === key ? { ...line, priceRappen } : line,
  );
}

/** Restores a bargained line to list price. Custom lines have none, so no-op. */
export function resetLinePrice(
  lines: TillCartLine[],
  key: string,
): TillCartLine[] {
  return lines.map((line) =>
    line.key === key && line.listPriceRappen !== null
      ? { ...line, priceRappen: line.listPriceRappen }
      : line,
  );
}

export function addCustomItem(
  lines: TillCartLine[],
  name: string,
  priceRappen: number,
  keySuffix: string,
): TillCartLine[] {
  return [
    ...lines,
    {
      key: `custom:${keySuffix}`,
      productId: null,
      name: name.trim(),
      listPriceRappen: null,
      priceRappen,
    },
  ];
}

/** True when this line is being sold for something other than its list price. */
export function isBargained(line: TillCartLine): boolean {
  return (
    line.listPriceRappen !== null && line.priceRappen !== line.listPriceRappen
  );
}

/**
 * The cart as the API wants it: catalogue ids, a sparse map of only the prices
 * that were actually overridden, and custom items in full. Sending an override
 * for every line would work but would bury the bargained ones, which are the
 * only ones worth looking at later.
 */
export function buildSalePayload(lines: TillCartLine[]): SalePayload {
  const productIds: number[] = [];
  const priceOverrides: Record<string, number> = {};
  const customItems: { name: string; priceRappen: number }[] = [];

  for (const line of lines) {
    if (line.productId === null) {
      customItems.push({ name: line.name, priceRappen: line.priceRappen });
      continue;
    }
    productIds.push(line.productId);
    if (isBargained(line)) {
      priceOverrides[String(line.productId)] = line.priceRappen;
    }
  }

  return { productIds, priceOverrides, customItems };
}

/**
 * Catalogue search. Matches the German name, the English one, and the
 * category, because a cashier reaching for "the silver hoops" may know any of
 * the three and shouldn't have to know which one this piece was listed under.
 */
export function filterProducts(
  products: TillProduct[],
  search: string,
  category: string | null,
  extraIncludes: Readonly<Record<string, readonly string[]>> = {},
): TillProduct[] {
  const needle = search.trim().toLowerCase();

  return products.filter((product) => {
    if (category) {
      const allowed = [category, ...(extraIncludes[category] ?? [])];
      if (!allowed.includes(product.category)) return false;
    }
    if (needle.length === 0) return true;
    return (
      product.name.toLowerCase().includes(needle) ||
      (product.nameEn ?? "").toLowerCase().includes(needle) ||
      product.category.toLowerCase().includes(needle)
    );
  });
}

/**
 * Categories worth showing as filters: the canonical order, intersected with
 * what is actually in stock. An empty category is a dead button.
 */
export function activeCategories(
  products: TillProduct[],
  categories: readonly string[],
): string[] {
  const present = new Set(products.map((p) => p.category));
  return categories.filter((category) => present.has(category));
}
