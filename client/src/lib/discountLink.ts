/**
 * Carrying a discount code from a link into the basket.
 *
 * A merchant sharing a code sends `…/shop?discount=FRIENDS-7K3P` (see
 * `discountShareUrl` in shared/discounts.ts) — the whole point being that the
 * friend never has to type anything. But the code is needed at checkout, which
 * is several navigations later, so it has to survive the trip.
 *
 * sessionStorage, not localStorage: a code belongs to the visit it arrived in.
 * A shopper who followed a friends-and-family link in March should not find it
 * silently applied to an unrelated order in June — and a shared computer should
 * not pass one person's code to the next.
 */

/** The query parameter a share link carries. */
export const DISCOUNT_PARAM = "discount";

const STORAGE_KEY = "zolto_discount_code";

/** Minimal storage surface, so tests need no jsdom storage at all. */
export interface CodeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): CodeStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    // Safari in private mode throws on access rather than returning null.
    return null;
  }
}

/**
 * Read `?discount=` out of a URL and remember it for this visit. Returns the
 * code found, or null.
 *
 * Storage failures are swallowed: a browser with storage disabled should still
 * be able to shop, it just won't carry the code between pages — and the field
 * at checkout is still there to type it into.
 */
export function captureDiscountFromUrl(
  search: string,
  storage: CodeStorage | null = defaultStorage(),
): string | null {
  let raw: string | null = null;
  try {
    raw = new URLSearchParams(search).get(DISCOUNT_PARAM);
  } catch {
    return null;
  }
  const code = raw?.trim();
  if (!code) return null;

  try {
    storage?.setItem(STORAGE_KEY, code);
  } catch {
    /* storage unavailable — the code just won't survive the next navigation */
  }
  return code;
}

/** The code this visit arrived with, if any. */
export function rememberedDiscount(
  storage: CodeStorage | null = defaultStorage(),
): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

/** Forget it — the shopper removed the code, or the order is done. */
export function forgetDiscount(
  storage: CodeStorage | null = defaultStorage(),
): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to do */
  }
}
