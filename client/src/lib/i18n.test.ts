import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { BRAND } from "@shared/brand";

function mockBrowserLanguage(tag: string) {
  vi.spyOn(window.navigator, "language", "get").mockReturnValue(tag);
}

describe("i18n bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initialises i18next with de, en, fr and it resources", async () => {
    const { default: i18n } = await import("./i18n");
    expect(i18n.isInitialized).toBe(true);
    expect(i18n.options.fallbackLng).toContain("de");
    for (const lang of ["de", "en", "fr", "it"]) {
      expect(i18n.hasResourceBundle(lang, "translation")).toBe(true);
    }
  });

  it("defaults to German when nothing is saved and the browser language is unsupported", async () => {
    mockBrowserLanguage("pt-BR");
    const { default: i18n } = await import("./i18n");
    expect(i18n.language).toBe("de");
  });

  it("picks up the browser language when it is supported", async () => {
    mockBrowserLanguage("fr-CH");
    const { default: i18n } = await import("./i18n");
    expect(i18n.language).toBe("fr");
  });

  it("honours a previously saved language preference over the browser", async () => {
    mockBrowserLanguage("fr-CH");
    localStorage.setItem(BRAND.langKey, "it");
    const { default: i18n } = await import("./i18n");
    expect(i18n.language).toBe("it");
  });

  it("ignores an unsupported saved value", async () => {
    mockBrowserLanguage("pt-BR");
    localStorage.setItem(BRAND.langKey, "xx");
    const { default: i18n } = await import("./i18n");
    expect(i18n.language).toBe("de");
  });
});
