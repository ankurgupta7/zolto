import { describe, it, expect, beforeEach, vi } from "vitest";

describe("i18n bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("initialises i18next with de and en resources", async () => {
    const { default: i18n } = await import("./i18n");
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.options.fallbackLng).toContain("de");
    expect(i18n.hasResourceBundle("de", "translation")).toBe(true);
    expect(i18n.hasResourceBundle("en", "translation")).toBe(true);
  });

  it("defaults to German when no language is saved", async () => {
    const { default: i18n } = await import("./i18n");
    expect(i18n.language).toBe("de");
  });

  it("honours a previously saved language preference", async () => {
    localStorage.setItem("kalakosh_lang", "en");
    const { default: i18n } = await import("./i18n");
    expect(i18n.language).toBe("en");
  });
});
