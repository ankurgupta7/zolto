import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import de from "@/locales/de.json";
import en from "@/locales/en.json";
import fr from "@/locales/fr.json";
import it from "@/locales/it.json";
import marketingDe from "@/marketing/locales/de.json";
import marketingEn from "@/marketing/locales/en.json";
import marketingFr from "@/marketing/locales/fr.json";
import marketingIt from "@/marketing/locales/it.json";
import {
  DEFAULT_LANGUAGE,
  HTML_LANG,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  matchSupportedLanguage,
} from "@/lib/languages";

function initialLanguage(): string {
  const saved = localStorage.getItem("kalakosh_lang");
  if (isSupportedLanguage(saved)) return saved;
  // No (valid) saved choice: fall back to the browser language when we
  // cover it, so a Romandy visitor starts in French rather than German.
  const fromBrowser = matchSupportedLanguage(
    typeof navigator !== "undefined" ? navigator.language : null,
  );
  return fromBrowser ?? DEFAULT_LANGUAGE;
}

i18n.use(initReactI18next).init({
  resources: {
    de: { translation: de, marketing: marketingDe },
    en: { translation: en, marketing: marketingEn },
    fr: { translation: fr, marketing: marketingFr },
    it: { translation: it, marketing: marketingIt },
  },
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: { escapeValue: false },
});

// Keep <html lang> truthful from first paint, not only after a manual switch.
if (typeof document !== "undefined") {
  const lang = matchSupportedLanguage(i18n.language);
  if (lang) document.documentElement.lang = HTML_LANG[lang];
}

export default i18n;
