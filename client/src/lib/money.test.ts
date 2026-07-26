import { describe, it, expect } from "vitest";
import { formatPrice, formatMinorUnits, DEFAULT_CURRENCY } from "./money";

describe("formatPrice", () => {
  it("formats CHF in the Swiss locale by default", () => {
    expect(formatPrice(49.9, DEFAULT_CURRENCY)).toContain("49.90");
    // Thousands separator is an apostrophe (which kind is ICU-version-dependent).
    expect(formatPrice(1299, "chf")).toMatch(/1.299\.00/);
  });

  it("formats other ISO currencies", () => {
    const eur = formatPrice(49.9, "eur");
    expect(eur).toContain("49.90");
    expect(eur).toMatch(/€|EUR/);
    expect(formatPrice(100, "usd")).toMatch(/\$|USD/);
  });

  it("accepts uppercase codes", () => {
    expect(formatPrice(10, "EUR")).toMatch(/€|EUR/);
  });

  it("degrades gracefully for unknown codes", () => {
    // Either the plain fallback or Intl's "XXX 10.00" (space kind varies).
    expect(formatPrice(10, "xxx")).toMatch(/XXX.10\.00/);
  });
});

describe("formatMinorUnits", () => {
  it("converts smallest units to major", () => {
    expect(formatMinorUnits(4990, "chf")).toContain("49.90");
  });
});
