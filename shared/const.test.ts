import { describe, expect, it } from "vitest";
import { PRODUCT_CATEGORIES, CATEGORY_EXTRA_INCLUDES } from "./const";
import { products } from "../drizzle/schema";

// PRODUCT_CATEGORIES is the single source of truth for the category list. These
// tests lock it to the database schema so the two can never silently drift — if
// someone edits one without the other, this fails.
describe("PRODUCT_CATEGORIES", () => {
  it("matches the Drizzle products.category enum exactly (values and order)", () => {
    expect([...products.category.enumValues]).toEqual([...PRODUCT_CATEGORIES]);
  });

  it("has no duplicate entries", () => {
    expect(new Set(PRODUCT_CATEGORIES).size).toBe(PRODUCT_CATEGORIES.length);
  });

  it('includes the "Other" fallback category', () => {
    expect(PRODUCT_CATEGORIES).toContain("Other");
  });
});

describe("CATEGORY_EXTRA_INCLUDES", () => {
  it("keys and folded values are all real product categories", () => {
    for (const [cat, extras] of Object.entries(CATEGORY_EXTRA_INCLUDES)) {
      expect(PRODUCT_CATEGORIES).toContain(cat);
      for (const extra of extras) expect(PRODUCT_CATEGORIES).toContain(extra);
    }
  });

  it("never folds a category into itself", () => {
    for (const [cat, extras] of Object.entries(CATEGORY_EXTRA_INCLUDES)) {
      expect(extras).not.toContain(cat);
    }
  });
});
