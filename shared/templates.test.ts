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
    // And its default primary matches the storefront's default ink.
    expect(atelier?.defaultPrimaryColor).toBe("#2D2620");
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
