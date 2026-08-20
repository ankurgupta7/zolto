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
// Merchant admin console strings, split into fragments so each area can be
// maintained (and was authored) independently. Fragments keep their keys
// under a unique top-level group ("core", "catalog", "store", "ops"), so a
// shallow spread never collides.
import adminCoreDe from "@/admin/locales/core.de.json";
import adminCoreEn from "@/admin/locales/core.en.json";
import adminCoreFr from "@/admin/locales/core.fr.json";
import adminCoreIt from "@/admin/locales/core.it.json";
import adminCatalogDe from "@/admin/locales/catalog.de.json";
import adminCatalogEn from "@/admin/locales/catalog.en.json";
import adminCatalogFr from "@/admin/locales/catalog.fr.json";
import adminCatalogIt from "@/admin/locales/catalog.it.json";
import adminStoreDe from "@/admin/locales/store.de.json";
import adminStoreEn from "@/admin/locales/store.en.json";
import adminStoreFr from "@/admin/locales/store.fr.json";
import adminStoreIt from "@/admin/locales/store.it.json";
import adminOpsDe from "@/admin/locales/ops.de.json";
import adminOpsEn from "@/admin/locales/ops.en.json";
import adminOpsFr from "@/admin/locales/ops.fr.json";
import adminOpsIt from "@/admin/locales/ops.it.json";

const admin = {
  de: { ...adminCoreDe, ...adminCatalogDe, ...adminStoreDe, ...adminOpsDe },
  en: { ...adminCoreEn, ...adminCatalogEn, ...adminStoreEn, ...adminOpsEn },
  fr: { ...adminCoreFr, ...adminCatalogFr, ...adminStoreFr, ...adminOpsFr },
  it: { ...adminCoreIt, ...adminCatalogIt, ...adminStoreIt, ...adminOpsIt },
};
import { I18N_DEFAULT_VARIABLES } from "@shared/brand";
import { BRAND } from "@shared/brand";
import {
  DEFAULT_LANGUAGE,
  HTML_LANG,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  matchSupportedLanguage,
} from "@/lib/languages";

function initialLanguage(): string {
  const saved = localStorage.getItem(BRAND.langKey);
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
    de: { translation: de, marketing: marketingDe, admin: admin.de },
    en: { translation: en, marketing: marketingEn, admin: admin.en },
    fr: { translation: fr, marketing: marketingFr, admin: admin.fr },
    it: { translation: it, marketing: marketingIt, admin: admin.it },
  },
  lng: initialLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: {
    escapeValue: false,
    // The platform's name is not translated, and it is also not spelled in the
    // locale files: every string that needs it writes `{{brand}}` and i18next
    // fills it in from shared/brand.ts. That keeps ~500 translated strings out
    // of a rename's blast radius, and it keeps inflection correct — German
    // takes a genitive "{{brand}}s", which a hard-coded name could not survive.
    defaultVariables: I18N_DEFAULT_VARIABLES,
  },
});

// Keep <html lang> truthful from first paint, not only after a manual switch.
if (typeof document !== "undefined") {
  const lang = matchSupportedLanguage(i18n.language);
  if (lang) document.documentElement.lang = HTML_LANG[lang];
}

export default i18n;
