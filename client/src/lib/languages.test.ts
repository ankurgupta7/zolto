import { describe, it, expect } from "vitest";
import {
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  HTML_LANG,
  LANGUAGE_LABELS,
  isSupportedLanguage,
  matchSupportedLanguage,
} from "./languages";

describe("languages", () => {
  it("covers the four Swiss storefront languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual(["de", "en", "fr", "it"]);
    expect(SUPPORTED_LANGUAGES).toContain(DEFAULT_LANGUAGE);
  });

  it("has a label and an <html lang> value for every language", () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_LABELS[lang]).toBeTruthy();
      expect(HTML_LANG[lang]).toBeTruthy();
    }
    expect(HTML_LANG.de).toBe("de-CH");
    expect(HTML_LANG.en).toBe("en");
  });

  it("validates stored values strictly", () => {
    expect(isSupportedLanguage("fr")).toBe(true);
    expect(isSupportedLanguage("fr-CH")).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage("xx")).toBe(false);
  });

  it("matches BCP-47 tags to a supported base language", () => {
    expect(matchSupportedLanguage("it-CH")).toBe("it");
    expect(matchSupportedLanguage("FR")).toBe("fr");
    expect(matchSupportedLanguage("en-US")).toBe("en");
    expect(matchSupportedLanguage("rm-CH")).toBeNull();
    expect(matchSupportedLanguage(undefined)).toBeNull();
  });
});
