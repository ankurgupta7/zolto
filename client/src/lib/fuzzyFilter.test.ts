import { describe, it, expect } from "vitest";
import {
  normalize,
  editTolerance,
  damerauLevenshtein,
  queryTokens,
  buildHaystack,
  tokenMatches,
  fuzzyFilter,
} from "./fuzzyFilter";

describe("normalize", () => {
  it("folds case, accents and ß", () => {
    expect(normalize("Grün")).toBe("grun");
    expect(normalize("WEISS")).toBe("weiss");
    expect(normalize("Weiß")).toBe("weiss");
    expect(normalize("Bague argentée")).toBe("bague argentee");
  });

  it("leaves digits and decimal points alone", () => {
    expect(normalize("CHF 120.00")).toBe("chf 120.00");
  });
});

describe("editTolerance", () => {
  // Short tokens get no budget: at three characters nearly every word is one
  // edit from every other, which would turn the filter into a no-op.
  it("gives short tokens no budget and grows with length", () => {
    expect(editTolerance(1)).toBe(0);
    expect(editTolerance(3)).toBe(0);
    expect(editTolerance(4)).toBe(1);
    expect(editTolerance(5)).toBe(1);
    expect(editTolerance(6)).toBe(2);
    expect(editTolerance(8)).toBe(2);
    expect(editTolerance(12)).toBe(3);
  });
});

describe("damerauLevenshtein", () => {
  it("counts an adjacent swap as one edit, not two", () => {
    expect(damerauLevenshtein("chian", "chain", 3)).toBe(1);
    expect(damerauLevenshtein("bernstien", "bernstein", 3)).toBe(1);
  });

  it("counts insertions, deletions and substitutions", () => {
    expect(damerauLevenshtein("silbering", "silberring", 3)).toBe(1);
    expect(damerauLevenshtein("kete", "kette", 3)).toBe(1);
    expect(damerauLevenshtein("gold", "hold", 3)).toBe(1);
    expect(damerauLevenshtein("", "abc", 3)).toBe(3);
    expect(damerauLevenshtein("abc", "abc", 3)).toBe(0);
  });

  it("reports over-budget rather than the true distance", () => {
    // Length gap alone exceeds the budget — no matrix is built.
    expect(damerauLevenshtein("ab", "abcdefgh", 1)).toBe(2);
    // Same length, but every character differs.
    expect(damerauLevenshtein("aaaa", "bbbb", 2)).toBe(3);
  });
});

describe("queryTokens", () => {
  it("splits on whitespace and punctuation and drops empties", () => {
    expect(queryTokens("  gold   chain ")).toEqual(["gold", "chain"]);
    expect(queryTokens("")).toEqual([]);
    expect(queryTokens("   ")).toEqual([]);
  });

  it("keeps a price as a single token", () => {
    expect(queryTokens("120.00")).toEqual(["120.00"]);
  });
});

describe("tokenMatches", () => {
  const hay = buildHaystack([
    "Silberring",
    "Silver Ring",
    "Ein Ring aus Silber",
    "120.00",
    "Rings",
    2,
  ]);

  it("matches a substring anywhere in any field", () => {
    expect(tokenMatches(hay, "silb")).toBe(true);
    expect(tokenMatches(hay, "ring")).toBe(true);
    expect(tokenMatches(hay, "120")).toBe(true);
  });

  it("matches through a typo", () => {
    expect(tokenMatches(hay, "silbering")).toBe(true); // dropped letter
    expect(tokenMatches(hay, "silberrign")).toBe(true); // swapped pair
    expect(tokenMatches(hay, "silbr")).toBe(true); // typo in a half-typed word
  });

  it("still rejects unrelated terms", () => {
    expect(tokenMatches(hay, "bernstein")).toBe(false);
    expect(tokenMatches(hay, "ohrringe")).toBe(false);
  });

  it("treats an empty token as matching", () => {
    expect(tokenMatches(hay, "")).toBe(true);
  });
});

// The catalogue rows the admin page actually filters.
const PRODUCTS = [
  {
    name: "Silberring",
    nameEn: "Silver Ring",
    nameFr: "Bague argentée",
    nameIt: null,
    description: "Ein Ring aus Silber",
    descriptionEn: "A silver ring",
    price: "120.00",
    category: "Rings",
    quantity: 2,
  },
  {
    name: "Bernsteinkette",
    nameEn: null,
    nameFr: null,
    nameIt: null,
    description: "Kette mit Bernstein",
    descriptionEn: null,
    price: "240.00",
    category: "Necklaces",
    quantity: 1,
  },
  {
    name: "Alte Brosche",
    nameEn: "Old Brooch",
    nameFr: null,
    nameIt: null,
    description: "Vintage Brosche",
    descriptionEn: null,
    price: "45.00",
    category: "Brooches",
    quantity: 0,
  },
];

const fieldsOf = (p: (typeof PRODUCTS)[number]) => [
  p.name,
  p.nameEn,
  p.nameFr,
  p.nameIt,
  p.description,
  p.descriptionEn,
  p.price,
  p.category,
  p.quantity,
];

const filter = (q: string) =>
  fuzzyFilter(PRODUCTS, q, fieldsOf).map((p) => p.name);

describe("fuzzyFilter", () => {
  it("returns the input untouched for an empty query", () => {
    expect(fuzzyFilter(PRODUCTS, "", fieldsOf)).toBe(PRODUCTS);
    expect(fuzzyFilter(PRODUCTS, "   ", fieldsOf)).toBe(PRODUCTS);
  });

  it("preserves the caller's order", () => {
    expect(filter("e")).toEqual([
      "Silberring",
      "Bernsteinkette",
      "Alte Brosche",
    ]);
  });

  it("matches the primary name", () => {
    expect(filter("silberring")).toEqual(["Silberring"]);
  });

  it("matches a translated name the merchant never sees in the row", () => {
    expect(filter("argentee")).toEqual(["Silberring"]);
    expect(filter("brooch")).toEqual(["Alte Brosche"]);
  });

  it("matches the description", () => {
    expect(filter("vintage")).toEqual(["Alte Brosche"]);
    expect(filter("bernstein")).toEqual(["Bernsteinkette"]);
  });

  it("matches on price", () => {
    expect(filter("240")).toEqual(["Bernsteinkette"]);
    expect(filter("45.00")).toEqual(["Alte Brosche"]);
  });

  it("matches on category", () => {
    expect(filter("necklaces")).toEqual(["Bernsteinkette"]);
  });

  it("matches on stock count", () => {
    // Quantity 0 — the number the merchant scans for when restocking.
    expect(fuzzyFilter([PRODUCTS[2]], "0", fieldsOf)).toHaveLength(1);
  });

  it("survives spelling mistakes", () => {
    expect(filter("silberrign")).toEqual(["Silberring"]); // transposition
    expect(filter("bernstienkette")).toEqual(["Bernsteinkette"]);
    expect(filter("brosche")).toEqual(["Alte Brosche"]);
    expect(filter("brosch")).toEqual(["Alte Brosche"]);
    expect(filter("vintge")).toEqual(["Alte Brosche"]);
  });

  it("ignores accents and case in both directions", () => {
    expect(filter("BAGUE ARGENTÉE")).toEqual(["Silberring"]);
  });

  it("narrows rather than widens as terms are added", () => {
    expect(filter("ring")).toEqual(["Silberring"]);
    expect(filter("silber ring")).toEqual(["Silberring"]);
    // Both terms have to land somewhere, on the same product.
    expect(filter("silber bernstein")).toEqual([]);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(filter("zzzzzz")).toEqual([]);
  });
});
