import { describe, it, expect } from "vitest";
import { slugify, isValidSlug } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Kalakosh Zürich")).toBe("kalakosh-zurich");
    expect(slugify("Aurora  Atelier")).toBe("aurora-atelier");
  });
  it("strips accents and punctuation", () => {
    expect(slugify("Café & Co.")).toBe("cafe-co");
  });
  it("trims leading/trailing hyphens", () => {
    expect(slugify("  -Hello-  ")).toBe("hello");
  });
  it("caps length at 64", () => {
    expect(slugify("a".repeat(100)).length).toBe(64);
  });
});

describe("isValidSlug", () => {
  it("accepts valid slugs", () => {
    expect(isValidSlug("kalakosh")).toBe(true);
    expect(isValidSlug("a-b-1")).toBe(true);
  });
  it("rejects too short, too long, or illegal chars", () => {
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("a".repeat(65))).toBe(false);
    expect(isValidSlug("Has Space")).toBe(false);
    expect(isValidSlug("UPPER")).toBe(false);
    expect(isValidSlug("under_score")).toBe(false);
  });
});
