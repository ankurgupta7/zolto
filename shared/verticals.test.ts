import { describe, expect, it } from "vitest";
import {
  FALLBACK_CATEGORY_KEY,
  VERTICALS,
  VERTICAL_PRESETS,
  isVertical,
} from "./verticals";

// Frozen copy of the original hard-coded jewellery category list (values AND
// order) and its Sets-folding rules. Existing jewellery stores were seeded
// from these exact keys and their products reference them, so the jewellery
// preset must never drift from this literal.
const ORIGINAL_JEWELLERY_CATEGORIES = [
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

const ORIGINAL_JEWELLERY_EXTRA_INCLUDES: Record<string, readonly string[]> = {
  Necklaces: ["Sets"],
  Earrings: ["Sets"],
};

describe("VERTICAL_PRESETS", () => {
  it("defines a preset for every vertical, keyed consistently", () => {
    for (const vertical of VERTICALS) {
      expect(VERTICAL_PRESETS[vertical].vertical).toBe(vertical);
    }
    expect(Object.keys(VERTICAL_PRESETS).sort()).toEqual([...VERTICALS].sort());
  });

  it("every preset has unique category keys", () => {
    for (const preset of Object.values(VERTICAL_PRESETS)) {
      const keys = preset.categories.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it(`every preset ends with the "${FALLBACK_CATEGORY_KEY}" fallback category`, () => {
    for (const preset of Object.values(VERTICAL_PRESETS)) {
      const last = preset.categories[preset.categories.length - 1];
      expect(last?.key).toBe(FALLBACK_CATEGORY_KEY);
    }
  });

  it("category keys fit the products.category column (varchar 64, non-empty)", () => {
    for (const preset of Object.values(VERTICAL_PRESETS)) {
      for (const cat of preset.categories) {
        expect(cat.key.length).toBeGreaterThan(0);
        expect(cat.key.length).toBeLessThanOrEqual(64);
        expect(cat.key.trim()).toBe(cat.key);
        expect(cat.labelEn.length).toBeGreaterThan(0);
        expect(cat.labelDe.length).toBeGreaterThan(0);
      }
    }
  });

  it("every category carries all four labels (en/de/fr/it) non-empty", () => {
    for (const preset of Object.values(VERTICAL_PRESETS)) {
      for (const cat of preset.categories) {
        expect(cat.labelEn.trim().length).toBeGreaterThan(0);
        expect(cat.labelDe.trim().length).toBeGreaterThan(0);
        expect(cat.labelFr.trim().length).toBeGreaterThan(0);
        expect(cat.labelIt.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("extraIncludes only reference real sibling keys and never self-fold", () => {
    for (const preset of Object.values(VERTICAL_PRESETS)) {
      const keys = new Set(preset.categories.map((c) => c.key));
      for (const cat of preset.categories) {
        for (const extra of cat.extraIncludes ?? []) {
          expect(keys).toContain(extra);
          expect(extra).not.toBe(cat.key);
        }
      }
    }
  });

  it("every preset carries the full prompt/copy vocabulary", () => {
    for (const preset of Object.values(VERTICAL_PRESETS)) {
      expect(preset.storeNoun).toMatch(/^an? /);
      expect(preset.itemNounEn.length).toBeGreaterThan(0);
      expect(preset.labelFr.length).toBeGreaterThan(0);
      expect(preset.labelIt.length).toBeGreaterThan(0);
      expect(preset.listingRules).toContain("- name:");
      expect(preset.listingRules).toContain("- name_en:");
      expect(preset.listingRules).toContain("- description:");
      expect(preset.listingRules).toContain("- description_en:");
      expect(preset.listingRules).toContain("- name_fr:");
      expect(preset.listingRules).toContain("- description_fr:");
      expect(preset.listingRules).toContain("- name_it:");
      expect(preset.listingRules).toContain("- description_it:");
      expect(preset.exampleItemNameFr.length).toBeGreaterThan(0);
      expect(preset.exampleItemNameIt.length).toBeGreaterThan(0);
      expect(preset.fallback.name.length).toBeGreaterThan(0);
      expect(preset.fallback.nameEn.length).toBeGreaterThan(0);
      expect(preset.fallback.nameFr.length).toBeGreaterThan(0);
      expect(preset.fallback.nameIt.length).toBeGreaterThan(0);
      expect(preset.fallback.descriptionFr.length).toBeGreaterThan(0);
      expect(preset.fallback.descriptionIt.length).toBeGreaterThan(0);
      expect(preset.ocrHeadingHint).toContain("heading");
      expect(preset.ocrCategoryNote).toContain(`"${FALLBACK_CATEGORY_KEY}"`);
      expect(preset.catalogueLine.length).toBeGreaterThan(0);
      expect(preset.returnsFooter).toContain("14-day returns");
    }
  });
});

describe("jewellery preset (kalakosh equivalence tripwire)", () => {
  const jewellery = VERTICAL_PRESETS.jewellery;

  it("keys match the original hard-coded list exactly (values and order)", () => {
    expect(jewellery.categories.map((c) => c.key)).toEqual([
      ...ORIGINAL_JEWELLERY_CATEGORIES,
    ]);
  });

  it("Sets-folding rules match the original CATEGORY_EXTRA_INCLUDES", () => {
    const folded: Record<string, readonly string[]> = {};
    for (const cat of jewellery.categories) {
      if (cat.extraIncludes?.length) folded[cat.key] = cat.extraIncludes;
    }
    expect(folded).toEqual(ORIGINAL_JEWELLERY_EXTRA_INCLUDES);
  });

  it("keeps the original fallback listing values and receipt footer", () => {
    expect(jewellery.fallback).toEqual({
      name: "Schmueckstück",
      nameEn: "Jewelry Piece",
      nameFr: "Bijou",
      nameIt: "Gioiello",
      description: "Handgefertigtes Schmueckstück.",
      descriptionEn: "Handcrafted jewelry piece.",
      descriptionFr: "Bijou fait main.",
      descriptionIt: "Gioiello fatto a mano.",
    });
    expect(jewellery.returnsFooter).toBe(
      "14-day returns on unworn, undamaged pieces",
    );
    expect(jewellery.catalogueLine).toBe(
      "Handcrafted jewelry and accessories, sold online and in person.",
    );
  });
});

describe("isVertical", () => {
  it("accepts known verticals and rejects everything else", () => {
    expect(isVertical("jewellery")).toBe(true);
    expect(isVertical("ceramics")).toBe(true);
    expect(isVertical("clothing")).toBe(false);
    expect(isVertical("")).toBe(false);
  });
});
