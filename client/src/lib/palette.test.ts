import { describe, it, expect } from "vitest";
import { hexToHsl, hslToHex, derivePalette } from "./palette";

describe("hexToHsl", () => {
  it("parses 6-digit hex", () => {
    const hsl = hexToHsl("#1e3a5f");
    expect(hsl).not.toBeNull();
    // deep blue → hue in the blue band, mid saturation, dark
    expect(hsl!.h).toBeGreaterThan(200);
    expect(hsl!.h).toBeLessThan(230);
    expect(hsl!.l).toBeLessThan(0.35);
    expect(hsl!.s).toBeGreaterThan(0.3);
  });

  it("expands 3-digit shorthand and tolerates a missing #", () => {
    expect(hexToHsl("#fff")).toEqual(hexToHsl("ffffff"));
    const white = hexToHsl("#fff")!;
    expect(white.l).toBeCloseTo(1, 5);
    expect(white.s).toBeCloseTo(0, 5);
  });

  it("returns null for non-hex input", () => {
    expect(hexToHsl("blue")).toBeNull();
    expect(hexToHsl("#12")).toBeNull();
    expect(hexToHsl("#1234567")).toBeNull();
  });
});

describe("hslToHex", () => {
  it("round-trips a color within rounding tolerance", () => {
    const hex = "#1e3a5f";
    const back = hslToHex(hexToHsl(hex)!);
    expect(back).toBe(hex);
  });

  it("wraps hue and clamps s/l out of range", () => {
    expect(hslToHex({ h: 360, s: 0.5, l: 0.5 })).toBe(
      hslToHex({ h: 0, s: 0.5, l: 0.5 }),
    );
    // l clamped to 1 → white; l clamped to 0 → black
    expect(hslToHex({ h: 210, s: 2, l: 5 })).toBe("#ffffff");
    expect(hslToHex({ h: 210, s: 2, l: -5 })).toBe("#000000");
  });
});

describe("derivePalette", () => {
  it("returns null for an unparseable color", () => {
    expect(derivePalette("not-a-color")).toBeNull();
  });

  it("derives the ink family + accent, keeping the input's hue", () => {
    const p = derivePalette("#1e3a5f")!;
    const keys = [
      "--brand-ink",
      "--brand-ink-hover",
      "--brand-ink-deep",
      "--brand-text",
      "--brand-accent",
      "--brand-accent-light",
    ] as const;
    for (const k of keys) expect(p[k]).toMatch(/^#[0-9a-f]{6}$/);

    const hue = hexToHsl("#1e3a5f")!.h;
    // every derived swatch stays in the same (blue) hue family
    for (const k of keys) {
      expect(Math.abs(hexToHsl(p[k])!.h - hue)).toBeLessThan(12);
    }
  });

  it("makes the accent clearly lighter than the ink (highlight, not gold)", () => {
    const p = derivePalette("#1e3a5f")!;
    const inkL = hexToHsl(p["--brand-ink"])!.l;
    const accentL = hexToHsl(p["--brand-accent"])!.l;
    expect(accentL).toBeGreaterThan(inkL + 0.15);
    // accent-light is lighter still
    expect(hexToHsl(p["--brand-accent-light"])!.l).toBeGreaterThan(accentL);
  });

  it("hover is lighter than ink and deep is darker", () => {
    const p = derivePalette("#1e3a5f")!;
    const inkL = hexToHsl(p["--brand-ink"])!.l;
    expect(hexToHsl(p["--brand-ink-hover"])!.l).toBeGreaterThan(inkL);
    expect(hexToHsl(p["--brand-ink-deep"])!.l).toBeLessThan(inkL);
  });

  it("anchors a near-black input up into a legible ink band", () => {
    const p = derivePalette("#000000")!;
    // pure black → ink lightness floored at 0.14, not 0
    expect(hexToHsl(p["--brand-ink"])!.l).toBeGreaterThanOrEqual(0.13);
  });
});

describe("derivePalette with a secondary color", () => {
  // The case a one-color derivation cannot express, and the reason the second
  // color exists: espresso ink with an unrelated gold highlight — Kalakosh's
  // own identity, which KALAKOSH_BRANDING otherwise has to hardcode.
  it("moves the accent family onto the secondary's hue", () => {
    const p = derivePalette("#2D2620", "#B8963E")!;
    const goldHue = hexToHsl("#B8963E")!.h;
    const inkHue = hexToHsl(p["--brand-ink"])!.h;

    expect(Math.abs(hexToHsl(p["--brand-accent"])!.h - goldHue)).toBeLessThan(
      6,
    );
    expect(
      Math.abs(hexToHsl(p["--brand-accent-light"])!.h - goldHue),
    ).toBeLessThan(6);
    // …and the ink stays on the primary's hue, nowhere near the accent's.
    expect(Math.abs(inkHue - hexToHsl("#2D2620")!.h)).toBeLessThan(6);
    expect(Math.abs(inkHue - goldHue)).toBeGreaterThan(10);
  });

  it("keeps accent-light lighter than accent", () => {
    const p = derivePalette("#1E4E79", "#C2410C")!;
    expect(hexToHsl(p["--brand-accent-light"])!.l).toBeGreaterThan(
      hexToHsl(p["--brand-accent"])!.l,
    );
  });

  it("anchors an unusably dark or light secondary into a legible band", () => {
    const dark = derivePalette("#2D2620", "#000000")!;
    expect(hexToHsl(dark["--brand-accent"])!.l).toBeGreaterThanOrEqual(0.41);
    const light = derivePalette("#2D2620", "#FFFFFF")!;
    expect(hexToHsl(light["--brand-accent"])!.l).toBeLessThanOrEqual(0.63);
  });

  it("is byte-identical to the single-color palette when the secondary is absent or unusable", () => {
    const base = derivePalette("#1e3a5f")!;
    expect(derivePalette("#1e3a5f", null)).toEqual(base);
    expect(derivePalette("#1e3a5f", undefined)).toEqual(base);
    expect(derivePalette("#1e3a5f", "")).toEqual(base);
    // A half-typed hex in the signup form must not blank the preview.
    expect(derivePalette("#1e3a5f", "#12")).toEqual(base);
    expect(derivePalette("#1e3a5f", "gold")).toEqual(base);
  });

  it("still returns null when the PRIMARY is unparseable, secondary notwithstanding", () => {
    expect(derivePalette("not-a-color", "#B8963E")).toBeNull();
  });
});
