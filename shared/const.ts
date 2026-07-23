export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please login (10001)";
export const NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

/**
 * The single source of truth for product categories.
 *
 * Everything that needs the category list must derive from this array — the
 * Drizzle schema (`mysqlEnum`), Zod validators, LLM prompts, and client
 * dropdowns. Do not re-type these literals anywhere else; add or rename a
 * category here and the rest of the app follows.
 */
export const PRODUCT_CATEGORIES = [
  "Necklaces",
  "Earrings",
  "Sets",
  "Rings",
  "Bracelets",
  "Bangles",
  "Anklets",
  "Brooches",
  "Hair Accessories",
  "Other",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/**
 * Extra categories folded into a category's listing.
 *
 * A "Set" contains both a necklace and earrings, so browsing Necklaces or
 * Earrings should also surface matching Sets. Modelling this as a map (rather
 * than hard-coding the "Sets" literal at each call site) keeps EVERY category
 * name — including the folded one — in this single file. The website shop and
 * the POS apps (via `/api/pos/categories`) both derive their filtering from it,
 * so they can never drift.
 */
export const CATEGORY_EXTRA_INCLUDES = {
  Necklaces: ["Sets"],
  Earrings: ["Sets"],
} as const satisfies Partial<
  Record<ProductCategory, readonly ProductCategory[]>
>;
