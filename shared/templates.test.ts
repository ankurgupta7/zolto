import { describe, it, expect } from "vitest";
import {
  STORE_TEMPLATES,
  TEMPLATE_IDS,
  TEMPLATE_CSS_VARS,
  DEFAULT_TEMPLATE_ID,
  getTemplate,
  isTemplateId,
} from "./templates";

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

/** HSL of a #rrggbb. Local to the test so `shared/` stays free of client imports. */
function hsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (((g - b) / d + (g < b ? 6 : 0)) * 60) % 360;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

describe("STORE_TEMPLATES", () => {
  it("offers exactly five templates, one per id, in TEMPLATE_IDS order", () => {
    expect(STORE_TEMPLATES).toHaveLength(5);
    expect(STORE_TEMPLATES.map((t) => t.id)).toEqual([...TEMPLATE_IDS]);
    expect(new Set(TEMPLATE_IDS).size).toBe(5);
  });

  it("includes the default template", () => {
    expect(TEMPLATE_IDS).toContain(DEFAULT_TEMPLATE_ID);
  });

  it("gives every template the complete surface variable set with valid hex values", () => {
    for (const template of STORE_TEMPLATES) {
      expect(Object.keys(template.cssVars).sort()).toEqual(
        [...TEMPLATE_CSS_VARS].sort(),
      );
      for (const value of Object.values(template.cssVars)) {
        expect(value).toMatch(HEX6);
      }
      expect(template.defaultPrimaryColor).toMatch(HEX6);
      expect(template.defaultSecondaryColor).toMatch(HEX6);
    }
  });

  // The second color exists to reach accents a tint of the primary cannot, so a
  // pair that reads as one color would quietly defeat the whole feature.
  //
  // Distinctness is NOT hue distance alone: Atelier is espresso #2D2620 with
  // gold #B8963E — Kalakosh's real identity — and those sit only ~16° apart on
  // the wheel. What separates them is weight, the gold being far more saturated
  // and far lighter. So a pair qualifies on a clear hue shift OR a clear
  // saturation/lightness gap, which is what the eye actually reads.
  it("pairs each primary with a perceptibly different secondary", () => {
    for (const template of STORE_TEMPLATES) {
      expect(template.defaultSecondaryColor.toLowerCase()).not.toBe(
        template.defaultPrimaryColor.toLowerCase(),
      );
      const a = hsl(template.defaultPrimaryColor);
      const b = hsl(template.defaultSecondaryColor);
      const rawHue = Math.abs(a.h - b.h);
      const hueGap = Math.min(rawHue, 360 - rawHue); // shortest way round
      const distinct =
        hueGap > 20 || Math.abs(a.s - b.s) > 0.2 || Math.abs(a.l - b.l) > 0.15;
      expect(
        distinct,
        `${template.id}: ${template.defaultPrimaryColor} and ${template.defaultSecondaryColor} would read as one color`,
      ).toBe(true);
    }
  });

  // Whichever way a pair is distinct, the highlight must never be darker than
  // the structural color — it sits on cream and on the ink, and a dark accent
  // disappears into the footer.
  it("keeps every secondary lighter than its primary", () => {
    for (const template of STORE_TEMPLATES) {
      expect(hsl(template.defaultSecondaryColor).l).toBeGreaterThan(
        hsl(template.defaultPrimaryColor).l,
      );
    }
  });

  it("gives every template picker-facing copy", () => {
    for (const template of STORE_TEMPLATES) {
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.tagline.length).toBeGreaterThan(0);
      expect(template.bestFor.length).toBeGreaterThan(0);
    }
  });

  it("keeps atelier's surfaces equal to the index.css defaults so applying it is a no-op", () => {
    const atelier = getTemplate("atelier");
    expect(atelier?.cssVars["--brand-ground"]).toBe("#f7f3ee");
    expect(atelier?.cssVars["--brand-surface"]).toBe("#ede7df");
    expect(atelier?.cssVars["--brand-border"]).toBe("#e0d8cc");
    // And its default pair matches the storefront's default ink + gold accent.
    expect(atelier?.defaultPrimaryColor).toBe("#2D2620");
    expect(atelier?.defaultSecondaryColor).toBe("#B8963E");
  });
});

describe("getTemplate / isTemplateId", () => {
  it("resolves every known id", () => {
    for (const id of TEMPLATE_IDS) {
      expect(getTemplate(id)?.id).toBe(id);
      expect(isTemplateId(id)).toBe(true);
    }
  });

  it("returns null for unknown, empty, or absent ids", () => {
    expect(getTemplate("brutalist")).toBeNull();
    expect(getTemplate("")).toBeNull();
    expect(getTemplate(null)).toBeNull();
    expect(getTemplate(undefined)).toBeNull();
    expect(isTemplateId("brutalist")).toBe(false);
    expect(isTemplateId(42)).toBe(false);
  });
});
