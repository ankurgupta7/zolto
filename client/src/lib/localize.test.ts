import { describe, it, expect } from "vitest";
import { localizedDescription, localizedName } from "./localize";

const product = {
  name: "Silberring",
  description: "Handgefertigter Ring",
  nameEn: "Silver ring",
  descriptionEn: "Handcrafted ring",
  nameDe: null,
  descriptionDe: null,
  nameFr: "Bague en argent",
  descriptionFr: "Bague artisanale",
};

describe("localize", () => {
  it("picks English fields for en", () => {
    expect(localizedName(product, "en")).toBe("Silver ring");
    expect(localizedDescription(product, "en")).toBe("Handcrafted ring");
  });

  it("picks French fields for fr", () => {
    expect(localizedName(product, "fr")).toBe("Bague en argent");
    expect(localizedDescription(product, "fr")).toBe("Bague artisanale");
  });

  it("handles regional language tags like en-US / fr-CH", () => {
    expect(localizedName(product, "en-US")).toBe("Silver ring");
    expect(localizedName(product, "fr-CH")).toBe("Bague en argent");
  });

  it("falls back to the primary text when the locale field is missing", () => {
    // de fields are null on this product
    expect(localizedName(product, "de")).toBe("Silberring");
    expect(localizedDescription(product, "de")).toBe("Handgefertigter Ring");
  });

  it("falls back to the primary text for unknown languages", () => {
    expect(localizedName(product, "it")).toBe("Silberring");
  });

  it("ignores blank translations", () => {
    const p = { ...product, nameEn: "   " };
    expect(localizedName(p, "en")).toBe("Silberring");
  });

  it("tolerates missing optional locale fields", () => {
    const bare = { name: "Ring", description: "Ein Ring" };
    expect(localizedName(bare, "fr")).toBe("Ring");
    expect(localizedDescription(bare, "en")).toBe("Ein Ring");
  });
});

describe("Italian (Ticino)", () => {
  const italian = {
    name: "Perlenkette",
    description: "Handgefertigt",
    nameIt: "Collana di perle",
    descriptionIt: "Fatto a mano",
  };

  it("prefers Italian content for an it-CH visitor", () => {
    expect(localizedName(italian, "it-CH")).toBe("Collana di perle");
    expect(localizedDescription(italian, "it-CH")).toBe("Fatto a mano");
  });

  it("falls back to the merchant's own text when Italian is missing", () => {
    const untranslated = { name: "Perlenkette", description: "Handgefertigt" };
    expect(localizedName(untranslated, "it")).toBe("Perlenkette");
  });

  it("does not hand an Italian visitor the German translation", () => {
    // The bug this guards: a fallthrough that treats any non-en/fr locale as
    // German would silently serve Ticino the wrong language.
    expect(localizedName({ ...italian, nameDe: "Perlenkette DE" }, "it")).toBe(
      "Collana di perle",
    );
  });
});
