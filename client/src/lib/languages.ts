/**
 * The four storefront languages. Switzerland sells in (at least) German,
 * French and Italian, and English covers everyone else — every UI language
 * feature should run through this list rather than hardcoding a pair.
 */

export const SUPPORTED_LANGUAGES = ["de", "en", "fr", "it"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_LANGUAGE: SupportedLanguage = "de";

/** Native-name labels for pickers. */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
  it: "Italiano",
};

/** Value for <html lang> — Swiss regional variants where they exist. */
export const HTML_LANG: Record<SupportedLanguage, string> = {
  de: "de-CH",
  en: "en",
  fr: "fr-CH",
  it: "it-CH",
};

export function isSupportedLanguage(
  value: string | null | undefined,
): value is SupportedLanguage {
  return !!value && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Best supported language for a BCP-47 tag ("fr-CH" → "fr"), or null if we
 * don't cover it.
 */
export function matchSupportedLanguage(
  tag: string | null | undefined,
): SupportedLanguage | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split("-")[0];
  return isSupportedLanguage(base) ? base : null;
}
