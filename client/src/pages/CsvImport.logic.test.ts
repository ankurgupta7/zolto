import { describe, expect, it } from "vitest";
import {
  IMPORT_CHUNK_SIZE,
  VALID_CATEGORIES,
  mapHandwrittenItems,
  mapRows,
  parseCsv,
  revalidateRow,
  type CsvRow,
} from "./CsvImport";

describe("parseCsv", () => {
  it("returns an empty array when there's no data row", () => {
    expect(parseCsv("name,price")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });

  it("parses a header row and data rows into objects keyed by normalized header", () => {
    const rows = parseCsv(
      'Name,Price\n"Moonstone Ring",185\n"Pearl Earrings",120'
    );
    expect(rows).toEqual([
      { name: "Moonstone Ring", price: "185" },
      { name: "Pearl Earrings", price: "120" },
    ]);
  });

  it("handles quoted fields containing commas and escaped quotes", () => {
    const rows = parseCsv(
      'name,description\n"Ring, Gold","Says ""hello"" to you"'
    );
    expect(rows[0].description).toBe('Says "hello" to you');
    expect(rows[0].name).toBe("Ring, Gold");
  });
});

describe("mapRows", () => {
  it("marks a fully valid row as valid with no errors", () => {
    const [row] = mapRows([
      {
        name: "Moonstone Ring",
        description: "A lovely ring",
        price: "185",
        category: "Rings",
        quantity: "2",
      },
    ]);
    expect(row).toMatchObject({
      name: "Moonstone Ring",
      description: "A lovely ring",
      price: 185,
      category: "Rings",
      quantity: 2,
      _valid: true,
      _errors: [],
      _selected: true,
    });
  });

  it("flags missing name, missing description, and invalid price", () => {
    const [row] = mapRows([{ price: "0", category: "Rings" }]);
    expect(row._valid).toBe(false);
    expect(row._errors).toEqual(
      expect.arrayContaining([
        "name required",
        "description required",
        "invalid price",
      ])
    );
    expect(row.name).toBe("(empty)");
  });

  it("defaults an unrecognized category to Other and flags it invalid", () => {
    const [row] = mapRows([
      {
        name: "Mystery Box",
        description: "desc",
        price: "10",
        category: "Sets",
      },
    ]);
    expect(row.category).toBe("Other");
    expect(row._valid).toBe(false);
    expect(row._errors.some(e => e.includes("category must be one of"))).toBe(
      true
    );
  });

  it("defaults quantity to 1 when not provided, and rejects a negative quantity", () => {
    const [noQty] = mapRows([
      { name: "A", description: "d", price: "10", category: "Rings" },
    ]);
    expect(noQty.quantity).toBe(1);

    const [negativeQty] = mapRows([
      {
        name: "A",
        description: "d",
        price: "10",
        category: "Rings",
        quantity: "-3",
      },
    ]);
    expect(negativeQty.quantity).toBe(1);
  });

  it("reads optional nameEn/descriptionEn/imageUrl (already-normalized header keys, as parseCsv would produce)", () => {
    const [row] = mapRows([
      {
        name: "A",
        description: "d",
        price: "10",
        category: "Rings",
        nameen: "English Name",
        descriptionen: "English description",
        imageurl: "https://example.com/a.jpg",
      },
    ]);
    expect(row.nameEn).toBe("English Name");
    expect(row.descriptionEn).toBe("English description");
    expect(row.imageUrl).toBe("https://example.com/a.jpg");
  });
});

describe("mapHandwrittenItems", () => {
  it("maps a valid AI-extracted item straight through", () => {
    const [row] = mapHandwrittenItems([
      {
        name: "Lemon Quartz",
        description: "Lemon Quartz Ring",
        price: 50,
        category: "Rings",
        quantity: 1,
      },
    ]);
    expect(row).toMatchObject({
      name: "Lemon Quartz",
      price: 50,
      category: "Rings",
      quantity: 1,
      _valid: true,
      _selected: true,
    });
  });

  it("reads a quantity shorthand already resolved by the AI (e.g. 3 for '3pc')", () => {
    const [row] = mapHandwrittenItems([
      {
        name: "Amethyst",
        description: "Amethyst Ring Set",
        price: 95,
        category: "Rings",
        quantity: 3,
      },
    ]);
    expect(row.quantity).toBe(3);
  });

  it("flags an AI category of Sets or Other as needing review", () => {
    const [row] = mapHandwrittenItems([
      {
        name: "Mixed Piece",
        description: "desc",
        price: 20,
        category: "Sets",
        quantity: 1,
      },
    ]);
    expect(row.category).toBe("Other");
    expect(row._valid).toBe(false);
    expect(row._errors).toContain("invalid category");
  });

  it("defaults an unreadable price/name to invalid", () => {
    const [row] = mapHandwrittenItems([
      { name: "", description: "", price: 0, category: "Rings", quantity: 1 },
    ]);
    expect(row._valid).toBe(false);
    expect(row._errors).toEqual(
      expect.arrayContaining([
        "name required",
        "description required",
        "invalid price",
      ])
    );
  });
});

describe("revalidateRow", () => {
  function baseRow(overrides: Partial<CsvRow> = {}): CsvRow {
    return {
      name: "Moonstone Ring",
      description: "A lovely ring",
      price: 185,
      category: "Rings",
      quantity: 1,
      _valid: true,
      _errors: [],
      _selected: true,
      ...overrides,
    };
  }

  it("keeps a valid row valid", () => {
    const result = revalidateRow(baseRow());
    expect(result._valid).toBe(true);
    expect(result._errors).toEqual([]);
  });

  it("turns a previously-invalid row valid once its fields are fixed", () => {
    const invalid = baseRow({
      name: "",
      price: 0,
      _valid: false,
      _errors: ["name required", "invalid price"],
    });
    const fixed = revalidateRow({ ...invalid, name: "Fixed Name", price: 50 });
    expect(fixed._valid).toBe(true);
    expect(fixed._errors).toEqual([]);
  });

  it("flags a row edited into an invalid state", () => {
    const result = revalidateRow(baseRow({ description: "   " }));
    expect(result._valid).toBe(false);
    expect(result._errors).toContain("description required");
  });

  it("treats a non-positive price as invalid", () => {
    const result = revalidateRow(baseRow({ price: 0 }));
    expect(result._valid).toBe(false);
    expect(result._errors).toContain("invalid price");
  });
});

describe("VALID_CATEGORIES", () => {
  it("excludes Sets so it is never offered as a pickable import category", () => {
    expect(VALID_CATEGORIES).not.toContain("Sets");
  });

  it("includes Other as a last-resort category", () => {
    expect(VALID_CATEGORIES).toContain("Other");
  });
});

describe("IMPORT_CHUNK_SIZE", () => {
  it("is a small positive batch size", () => {
    expect(IMPORT_CHUNK_SIZE).toBeGreaterThan(0);
    expect(IMPORT_CHUNK_SIZE).toBeLessThanOrEqual(20);
  });
});
