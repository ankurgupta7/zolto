import { describe, it, expect } from "vitest";
import { hexToHsl, hslToHex, derivePalette } from "./palette";
import { valueProps, genericTermsSections } from "./storefrontContent";
import { computeTooltipPosition } from "./tour";
import type { Branding } from "./branding";

// These tests target branches the primary suites don't exercise, keeping the
// client/src/lib directory close to full coverage.

describe("palette hue branches", () => {
  it("computes hue when green is the dominant channel", () => {
    // Pure green → hue 120.
    expect(hexToHsl("#00ff00")?.h).toBe(120);
  });

  it("computes hue when blue is the dominant channel", () => {
    // Pure blue → hue 240.
    expect(hexToHsl("#0000ff")?.h).toBe(240);
  });

  it("renders hues across every 60° sextant", () => {
    // Exercises each branch of the hue→rgb conversion (cyan, blue, magenta).
    expect(hslToHex({ h: 180, s: 1, l: 0.5 })).toBe("#00ffff");
    expect(hslToHex({ h: 210, s: 1, l: 0.5 })).toBe("#0080ff");
    expect(hslToHex({ h: 270, s: 1, l: 0.5 })).toBe("#8000ff");
    expect(hslToHex({ h: 330, s: 1, l: 0.5 })).toBe("#ff0080");
  });

  it("derives a palette from a green primary", () => {
    const palette = derivePalette("#22aa55");
    expect(palette).not.toBeNull();
    expect(palette?.["--brand-ink"]).toMatch(/^#/);
  });
});

describe("storefront value props", () => {
  it("returns three neutral value props", () => {
    const props = valueProps();
    expect(props).toHaveLength(3);
    expect(props.map((p) => p.title)).toContain("Secure checkout");
  });
});

describe("generic terms contact section", () => {
  const base: Branding = {
    storeName: "Aurora",
    instagramHandle: null,
    whatsappNumber: null,
    contactEmail: null,
    primaryColor: null,
  } as Branding;

  it("falls back to the contact form when there is no contact email", () => {
    const sections = genericTermsSections(base);
    const contact = sections.find((s) => s.heading.includes("Contact"));
    expect(contact?.body.join(" ")).toContain("contact form");
  });

  it("uses the contact email when one is set", () => {
    const sections = genericTermsSections({
      ...base,
      contactEmail: "hi@aurora.example",
    } as Branding);
    const contact = sections.find((s) => s.heading.includes("Contact"));
    expect(contact?.body.join(" ")).toContain("hi@aurora.example");
  });
});

describe("computeTooltipPosition flips", () => {
  const tip = { width: 200, height: 100 };
  const viewport = { width: 1000, height: 800 };

  it("flips a right placement to the left when there is no room on the right", () => {
    const target = { top: 300, left: 900, width: 80, height: 40 };
    const pos = computeTooltipPosition(target, tip, viewport, "right");
    // Placed to the left → tooltip's left edge is left of the target.
    expect(pos.left).toBeLessThan(target.left);
  });

  it("flips a left placement to the right when there is no room on the left", () => {
    const target = { top: 300, left: 20, width: 80, height: 40 };
    const pos = computeTooltipPosition(target, tip, viewport, "left");
    // Placed to the right → tooltip starts after the target.
    expect(pos.left).toBeGreaterThan(target.left);
  });
});
