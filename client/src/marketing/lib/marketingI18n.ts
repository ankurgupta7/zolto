import { useTranslation } from "react-i18next";
// Importing the app i18n instance is load-bearing: it guarantees i18next is
// initialised (with the marketing namespace registered) before any marketing
// component calls useTranslation — including under vitest, where nothing else
// would have imported "@/lib/i18n".
import "@/lib/i18n";
import {
  DEFAULT_LANGUAGE,
  matchSupportedLanguage,
  type SupportedLanguage,
} from "@/lib/languages";

/**
 * Locale used for number formatting on the marketing surface. Swiss regional
 * variants everywhere — unlike HTML_LANG, English also gets the Swiss variant
 * so a CHF figure groups the Swiss way ("2'500") rather than the US way.
 */
export const NUMBER_LOCALE: Record<SupportedLanguage, string> = {
  de: "de-CH",
  en: "en-CH",
  fr: "fr-CH",
  it: "it-CH",
};

/**
 * Marketing-namespace translation hook.
 *
 * `t` reads the "marketing" namespace. `st` ("shared translate") looks up the
 * translation of a string that *lives* in shared/platform.ts under
 * `marketing:shared.<key>`, falling back to the English source string when the
 * key is missing — so a feature added to shared/platform.ts renders in English
 * rather than as a blank or a raw key until its translations land.
 */
export function useMarketingT() {
  const { t, i18n } = useTranslation("marketing");
  const lang = matchSupportedLanguage(i18n.language) ?? DEFAULT_LANGUAGE;

  const st = (key: string, fallback: string): string =>
    t(`shared.${key}`, { defaultValue: fallback });

  return { t, st, i18n, lang, numberLocale: NUMBER_LOCALE[lang] };
}
