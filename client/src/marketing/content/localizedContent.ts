/**
 * Language resolution for the editorial surface (Launch Diary + case study).
 *
 * `launchContent.ts` stays the English source of truth; `launchContent.de.ts`,
 * `.fr.ts` and `.it.ts` hold translations that honour a structural parity
 * contract with it (same slugs, kinds, dates, image srcs, hrefs, and a 1:1
 * block-type sequence). This module is the only place the pages should reach
 * for content, so:
 *
 *  - **Slugs and URLs never change with language.** Resolution is keyed off the
 *    English article list, so /blog/launch-diary-1 is the same document in
 *    every language and there is no per-language routing table to drift.
 *  - **Fallback is per article, not per language.** If a translation file is
 *    missing one slug (a new post landing before its translation), that single
 *    article renders in English while the rest of the index stays translated.
 *  - **English is exactly what it was.** `lang === "en"` returns the very
 *    objects exported by launchContent.ts — same references, same bytes.
 *
 * The small amount of page chrome on Blog/BlogPost/Story lives here too
 * (`BLOG_CHROME`) rather than in marketing/locales/*.json, because it is
 * inseparable from this content set.
 */
import type { SupportedLanguage } from "@/lib/languages";
import { DIARY_POSTS, CASE_STUDY, type Article } from "./launchContent";
import { DIARY_POSTS_DE, CASE_STUDY_DE } from "./launchContent.de";
import { DIARY_POSTS_FR, CASE_STUDY_FR } from "./launchContent.fr";
import { DIARY_POSTS_IT, CASE_STUDY_IT } from "./launchContent.it";

/** Diary series per language. English is the ordering + completeness authority. */
const DIARY_BY_LANG: Record<SupportedLanguage, Article[]> = {
  en: DIARY_POSTS,
  de: DIARY_POSTS_DE,
  fr: DIARY_POSTS_FR,
  it: DIARY_POSTS_IT,
};

/** Case study per language. */
const CASE_STUDY_BY_LANG: Record<SupportedLanguage, Article> = {
  en: CASE_STUDY,
  de: CASE_STUDY_DE,
  fr: CASE_STUDY_FR,
  it: CASE_STUDY_IT,
};

/**
 * The Launch Diary series in `lang`, in English series order.
 *
 * Any article the translation set is missing falls back to its English
 * original individually — a partly translated set degrades one card at a time,
 * never to an empty index.
 */
export function getDiaryPosts(lang: SupportedLanguage): Article[] {
  if (lang === "en") return DIARY_POSTS;
  const translated = DIARY_BY_LANG[lang] ?? [];
  return DIARY_POSTS.map(
    (en) => translated.find((t) => t.slug === en.slug) ?? en,
  );
}

/** The case study in `lang`, falling back to English when untranslated. */
export function getCaseStudy(lang: SupportedLanguage): Article {
  if (lang === "en") return CASE_STUDY;
  return CASE_STUDY_BY_LANG[lang] ?? CASE_STUDY;
}

/**
 * Any article — diary post or case study — by its (language-independent) slug,
 * or undefined for an unknown slug.
 */
export function getArticleBySlug(
  slug: string,
  lang: SupportedLanguage,
): Article | undefined {
  const diary = getDiaryPosts(lang).find((a) => a.slug === slug);
  if (diary) return diary;
  const story = getCaseStudy(lang);
  return story.slug === slug ? story : undefined;
}

/** Diary posts plus the case study in `lang` — the whole editorial set. */
export function getAllArticles(lang: SupportedLanguage): Article[] {
  return [...getDiaryPosts(lang), getCaseStudy(lang)];
}

/**
 * Date locale per language. Swiss regional variants everywhere — English
 * included, since this content is written from Zurich and an en-CH date reads
 * the way the rest of the site's figures do.
 */
export const ARTICLE_DATE_LOCALE: Record<SupportedLanguage, string> = {
  de: "de-CH",
  en: "en-CH",
  fr: "fr-CH",
  it: "it-CH",
};

/**
 * Long-form publication date for an article, in the language's Swiss locale.
 * `lang === "en"` reproduces the existing en-CH long date exactly.
 */
export function formatArticleDate(
  isoDate: string,
  lang: SupportedLanguage,
): string {
  return new Date(isoDate).toLocaleDateString(ARTICLE_DATE_LOCALE[lang], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** The hardcoded UI strings on Blog / BlogPost / Story. */
export interface BlogChrome {
  /** <title> and meta description for the /blog index. */
  indexMetaTitle: string;
  indexMetaDescription: string;
  /** Handwritten eyebrow above the index headline. */
  indexEyebrow: string;
  indexTitle: string;
  indexIntro: string;
  /** Eyebrow on the case-study card. */
  caseStudyEyebrow: string;
  /** BlogPost not-found state. */
  postNotFoundTitle: string;
  postNotFoundBody: string;
  backToAllPosts: string;
  /** Story not-found state. */
  storyNotFoundTitle: string;
  backToDiary: string;
  /** ArticleView chrome, shown on every diary post and the case study. */
  allDiaryPosts: string;
  nextInSeries: string;
  seriesDisclosure: string;
}

/**
 * Page chrome per language. The English entries are verbatim the strings that
 * were inlined in Blog.tsx / BlogPost.tsx / Story.tsx, so English output is
 * unchanged byte for byte.
 */
export const BLOG_CHROME: Record<SupportedLanguage, BlogChrome> = {
  en: {
    indexMetaTitle: "Launch Diary — A Maker's First Online Store | Zolto",
    indexMetaDescription:
      "The Launch Diary: an honest, week-by-week account of a Zurich pearl jewelry maker launching a first online store on Zolto. No growth hacks, just what happened.",
    indexEyebrow: "The Launch Diary",
    indexTitle: "A maker's first online store, documented.",
    indexIntro:
      "A pearl jewelry maker in Zurich went from ~60 offline sales a month at Christmas markets to a hybrid online-offline business. This is the real process — setup, launch day, first month — written as it happened.",
    caseStudyEyebrow: "Case Study",
    postNotFoundTitle: "Post not found",
    postNotFoundBody: "That Launch Diary entry doesn't exist (yet).",
    backToAllPosts: "← Back to all posts",
    storyNotFoundTitle: "Story not found",
    backToDiary: "← Back to the Launch Diary",
    allDiaryPosts: "← All Launch Diary posts",
    nextInSeries: "Next in the series",
    seriesDisclosure:
      "This series documents a real maker's first online-store launch on Zolto. No growth hacks, no cherry-picked metrics — just what happened.",
  },
  de: {
    indexMetaTitle:
      "Launch-Tagebuch — Der erste Onlineshop einer Macherin | Zolto",
    indexMetaDescription:
      "Das Launch-Tagebuch: ein ehrlicher Bericht Woche für Woche, wie eine Zürcher Perlenschmuck-Macherin ihren ersten Onlineshop auf Zolto eröffnet. Keine Growth-Hacks, nur was wirklich geschah.",
    indexEyebrow: "Das Launch-Tagebuch",
    indexTitle: "Der erste Onlineshop einer Macherin, dokumentiert.",
    indexIntro:
      "Eine Perlenschmuck-Macherin in Zürich ging von ~60 Offline-Verkäufen pro Monat an Weihnachtsmärkten zu einem hybriden Online-Offline-Geschäft. Das ist der echte Ablauf — Einrichtung, Launch-Tag, erster Monat — festgehalten, während er geschah.",
    caseStudyEyebrow: "Fallstudie",
    postNotFoundTitle: "Beitrag nicht gefunden",
    postNotFoundBody: "Diesen Eintrag im Launch-Tagebuch gibt es (noch) nicht.",
    backToAllPosts: "← Zurück zu allen Beiträgen",
    storyNotFoundTitle: "Fallstudie nicht gefunden",
    backToDiary: "← Zurück zum Launch-Tagebuch",
    allDiaryPosts: "← Alle Beiträge im Launch-Tagebuch",
    nextInSeries: "Als Nächstes in der Serie",
    seriesDisclosure:
      "Diese Serie dokumentiert den ersten Onlineshop-Launch einer echten Macherin auf Zolto. Keine Growth-Hacks, keine geschönten Zahlen — nur was wirklich geschah.",
  },
  fr: {
    indexMetaTitle:
      "Journal de lancement — La première boutique en ligne d'une créatrice | Zolto",
    indexMetaDescription:
      "Le Journal de lancement : le récit honnête, semaine après semaine, d'une créatrice de bijoux de perles zurichoise qui lance sa première boutique en ligne sur Zolto. Pas de growth hacking, juste ce qui s'est passé.",
    indexEyebrow: "Le Journal de lancement",
    indexTitle: "La première boutique en ligne d'une créatrice, documentée.",
    indexIntro:
      "Une créatrice de bijoux de perles à Zurich est passée de ~60 ventes hors ligne par mois sur les marchés de Noël à une activité hybride en ligne et hors ligne. Voici le processus réel — mise en place, jour du lancement, premier mois — écrit au fil des événements.",
    caseStudyEyebrow: "Étude de cas",
    postNotFoundTitle: "Article introuvable",
    postNotFoundBody:
      "Cette entrée du Journal de lancement n'existe pas (encore).",
    backToAllPosts: "← Retour à tous les articles",
    storyNotFoundTitle: "Étude de cas introuvable",
    backToDiary: "← Retour au Journal de lancement",
    allDiaryPosts: "← Tous les articles du Journal de lancement",
    nextInSeries: "La suite de la série",
    seriesDisclosure:
      "Cette série documente le lancement de la première boutique en ligne d'une véritable créatrice sur Zolto. Pas de growth hacking, pas de chiffres triés sur le volet — juste ce qui s'est passé.",
  },
  it: {
    indexMetaTitle:
      "Diario di lancio — Il primo negozio online di un'artigiana | Zolto",
    indexMetaDescription:
      "Il Diario di lancio: il racconto onesto, settimana dopo settimana, di un'artigiana di gioielli di perle di Zurigo che apre il suo primo negozio online su Zolto. Nessun growth hack, solo quello che è successo.",
    indexEyebrow: "Il Diario di lancio",
    indexTitle: "Il primo negozio online di un'artigiana, documentato.",
    indexIntro:
      "Un'artigiana di gioielli di perle a Zurigo è passata da ~60 vendite offline al mese ai mercatini di Natale a un'attività ibrida online e offline. Questo è il processo reale — configurazione, giorno del lancio, primo mese — scritto mentre accadeva.",
    caseStudyEyebrow: "Caso di studio",
    postNotFoundTitle: "Articolo non trovato",
    postNotFoundBody: "Questa voce del Diario di lancio non esiste (ancora).",
    backToAllPosts: "← Torna a tutti gli articoli",
    storyNotFoundTitle: "Caso di studio non trovato",
    backToDiary: "← Torna al Diario di lancio",
    allDiaryPosts: "← Tutti gli articoli del Diario di lancio",
    nextInSeries: "Prossimo nella serie",
    seriesDisclosure:
      "Questa serie documenta il lancio del primo negozio online di un'artigiana reale su Zolto. Nessun growth hack, nessun dato scelto ad arte — solo quello che è successo.",
  },
};

/** Page chrome for `lang`, falling back to English if one were ever missing. */
export function getBlogChrome(lang: SupportedLanguage): BlogChrome {
  return BLOG_CHROME[lang] ?? BLOG_CHROME.en;
}
