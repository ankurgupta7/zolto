import { describe, expect, it } from "vitest";
import {
  detectDelimiter,
  mapStripeProducts,
  normalizeHeader,
  parseDelimited,
  parseProviderCsv,
  parseSwissAmount,
  providerLabel,
} from "./providerMigration";

describe("detectDelimiter", () => {
  it("picks semicolon for German-locale exports", () => {
    expect(detectDelimiter("Artikelname;Preis;Kategorie")).toBe(";");
  });

  it("picks comma for anglophone exports", () => {
    expect(detectDelimiter("Item name,Price,Category")).toBe(",");
  });

  it("picks tab for TSV exports", () => {
    expect(detectDelimiter("Name\tPreis\tMenge")).toBe("\t");
  });

  it("ignores delimiters inside quoted headers", () => {
    expect(detectDelimiter('"Name, long";Preis;Menge')).toBe(";");
  });
});

describe("parseDelimited", () => {
  it("strips a UTF-8 BOM before the first header", () => {
    const rows = parseDelimited("﻿name,price\nRing,25");
    expect(rows[0]).toEqual(["name", "price"]);
  });

  it("handles quoted fields with embedded delimiters and newlines", () => {
    const rows = parseDelimited(
      'name;description;price\nRing;"Silber, poliert\nmit Stein";25',
    );
    expect(rows).toHaveLength(2);
    expect(rows[1][1]).toBe("Silber, poliert\nmit Stein");
    expect(rows[1][2]).toBe("25");
  });

  it("unescapes doubled quotes", () => {
    const rows = parseDelimited('name,note\n"The ""One"" Ring",x');
    expect(rows[1][0]).toBe('The "One" Ring');
  });

  it("drops fully empty lines", () => {
    const rows = parseDelimited("name,price\n\nRing,25\n\n");
    expect(rows).toHaveLength(2);
  });
});

describe("normalizeHeader", () => {
  it("collapses punctuation, case and spaces", () => {
    expect(normalizeHeader("Preis (brutto)")).toBe("preisbrutto");
    expect(normalizeHeader("Item name")).toBe("itemname");
  });
});

describe("parseSwissAmount", () => {
  it("reads plain and prefixed amounts", () => {
    expect(parseSwissAmount("25")).toBe(25);
    expect(parseSwissAmount("CHF 25.00")).toBe(25);
    expect(parseSwissAmount("Fr. 45")).toBe(45);
    expect(parseSwissAmount("EUR 9.90")).toBe(9.9);
  });

  it("reads Swiss apostrophe thousands and Rappen shorthand", () => {
    expect(parseSwissAmount("1'234.50")).toBe(1234.5);
    expect(parseSwissAmount("25.–")).toBe(25);
    expect(parseSwissAmount("45.-")).toBe(45);
  });

  it("reads European decimal commas either way around", () => {
    expect(parseSwissAmount("12,50")).toBe(12.5);
    expect(parseSwissAmount("1.234,50")).toBe(1234.5);
    expect(parseSwissAmount("1,234.50")).toBe(1234.5);
  });

  it("rejects empty, zero and non-numeric input", () => {
    expect(parseSwissAmount("")).toBeNull();
    expect(parseSwissAmount("0")).toBeNull();
    expect(parseSwissAmount("gratis")).toBeNull();
    expect(parseSwissAmount("-5")).toBeNull();
  });
});

describe("parseProviderCsv — SumUp", () => {
  it("reads a German SumUp item export with decimal commas", () => {
    const csv = [
      "Artikelname;Beschreibung;Preis;Kategorie;Bestand",
      "Silberring;Handgemachter Ring;89,50;Ringe;3",
      "Kette Mondstein;;120,00;Ketten;1",
    ].join("\n");
    const result = parseProviderCsv("sumup", csv);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      name: "Silberring",
      description: "Handgemachter Ring",
      price: 89.5,
      rawCategory: "Ringe",
      quantity: 3,
    });
    expect(result.rows[1].price).toBe(120);
    expect(result.skipped).toBe(0);
  });

  it("appends the variation to the item name", () => {
    const csv = [
      "Item name,Variations,Price,Category",
      "Ring,Size M,45.00,Rings",
      "Ring,Size L,45.00,Rings",
    ].join("\n");
    const result = parseProviderCsv("sumup", csv);
    expect(result.rows.map((r) => r.name)).toEqual([
      "Ring — Size M",
      "Ring — Size L",
    ]);
  });

  it("skips rows without a name and says so", () => {
    const csv = ["Item name,Price", "Ring,45", ",12"].join("\n");
    const result = parseProviderCsv("sumup", csv);
    expect(result.rows).toHaveLength(1);
    expect(result.skipped).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/1 row had no item name/);
  });

  it("warns when no name column is recognizable", () => {
    const csv = ["Datum,Betrag", "01.02.2026,45"].join("\n");
    const result = parseProviderCsv("sumup", csv);
    expect(result.warnings.join(" ")).toMatch(/No item-name column/);
  });

  it("warns on an EUR export", () => {
    const csv = ["Item name,Price", "Ring,EUR 45.00"].join("\n");
    const result = parseProviderCsv("sumup", csv);
    expect(result.warnings.join(" ")).toMatch(/EUR/);
    expect(result.rows[0].price).toBe(45);
  });

  it("returns a helpful warning for an empty or headerless file", () => {
    const result = parseProviderCsv("sumup", "just one line");
    expect(result.rows).toHaveLength(0);
    expect(result.warnings.join(" ")).toMatch(/header row/);
  });
});

describe("parseProviderCsv — Worldline", () => {
  it("collapses repeated transaction rows to one item with the latest price", () => {
    const csv = [
      "Datum;Bezeichnung;Betrag",
      "01.05.2026;Espresso;4.50",
      "02.05.2026;Espresso;4.50",
      "03.05.2026;Espresso;5.00",
      "03.05.2026;Gipfeli;2.20",
    ].join("\n");
    const result = parseProviderCsv("worldline", csv);
    expect(result.rows).toHaveLength(2);
    const espresso = result.rows.find((r) => r.name === "Espresso");
    expect(espresso?.price).toBe(5);
    expect(espresso?.quantity).toBe(1);
    expect(result.warnings.join(" ")).toMatch(/2 repeated transaction rows/);
  });

  it("accepts an article column named Artikel with CHF amounts", () => {
    const csv = ["Artikel;Betrag", "Seifenschale;CHF 18.–"].join("\n");
    const result = parseProviderCsv("worldline", csv);
    expect(result.rows[0]).toMatchObject({ name: "Seifenschale", price: 18 });
  });
});

describe("parseProviderCsv — generic", () => {
  it("reads the Zolto template columns", () => {
    const csv = [
      "name,description,price,category,quantity,imageUrl",
      "Ring,Schöner Ring,45,Rings,2,https://example.com/r.jpg",
    ].join("\n");
    const result = parseProviderCsv("generic", csv);
    expect(result.rows[0]).toMatchObject({
      name: "Ring",
      description: "Schöner Ring",
      price: 45,
      rawCategory: "Rings",
      quantity: 2,
      imageUrl: "https://example.com/r.jpg",
    });
  });
});

describe("providerLabel", () => {
  it("names each provider for merchant-facing messages", () => {
    expect(providerLabel("sumup")).toBe("SumUp");
    expect(providerLabel("worldline")).toBe("Worldline / SIX");
    expect(providerLabel("generic")).toBe("CSV");
  });
});

describe("mapStripeProducts", () => {
  it("maps name, description, price, image and metadata category", () => {
    const result = mapStripeProducts([
      {
        id: "prod_1",
        name: "Keramiktasse",
        description: "Handgetöpferte Tasse",
        images: ["https://files.stripe.com/tasse.jpg"],
        metadata: { category: "Mugs" },
        default_price: { unit_amount: 3450, currency: "chf", recurring: null },
      },
    ]);
    expect(result.rows[0]).toMatchObject({
      name: "Keramiktasse",
      description: "Handgetöpferte Tasse",
      price: 34.5,
      rawCategory: "Mugs",
      quantity: 1,
      imageUrl: "https://files.stripe.com/tasse.jpg",
    });
    expect(result.skipped).toBe(0);
  });

  it("keeps unpriced products with a null price and warns", () => {
    const result = mapStripeProducts([
      { id: "prod_1", name: "Ring", default_price: null },
      // An unexpanded price id also counts as unpriced — the amount is unknown.
      { id: "prod_2", name: "Kette", default_price: "price_123" },
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => r.price === null)).toBe(true);
    expect(result.warnings.join(" ")).toMatch(/2 products had no default price/);
  });

  it("warns about recurring prices and foreign currencies", () => {
    const result = mapStripeProducts([
      {
        id: "prod_1",
        name: "Abo-Kiste",
        default_price: {
          unit_amount: 2500,
          currency: "eur",
          recurring: { interval: "month" },
        },
      },
    ]);
    expect(result.rows[0].price).toBe(25);
    const text = result.warnings.join(" ");
    expect(text).toMatch(/recurring/);
    expect(text).toMatch(/EUR/);
  });

  it("always reminds that Stripe carries no stock levels", () => {
    const result = mapStripeProducts([]);
    expect(result.warnings.join(" ")).toMatch(/quantity 1/);
  });

  it("skips nameless products", () => {
    const result = mapStripeProducts([
      { id: "prod_1", name: "  ", default_price: null },
    ]);
    expect(result.rows).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });
});
