import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
// Load-bearing side-effect import — see Blog.tsx.
import "@/lib/i18n";
import { matchSupportedLanguage } from "@/lib/languages";
import { getCaseStudy, getBlogChrome } from "../content/localizedContent";
import { ArticleView } from "../components/Article";
import { Container } from "../components/Container";

/**
 * The case-study page at /stories/:slug. The slug is release-gated (see
 * @shared/marketing) — only the current story slug resolves; anything else is a
 * not-found, so a stale brand-named URL doesn't render an anonymized page.
 *
 * The slug is identical in every language; only the prose is localized.
 */
export default function Story() {
  const [, params] = useRoute("/stories/:slug");
  const { i18n } = useTranslation();
  const lang = matchSupportedLanguage(i18n.language) ?? "en";
  const slug = params?.slug ?? "";
  const caseStudy = getCaseStudy(lang);

  if (slug !== caseStudy.slug) {
    const chrome = getBlogChrome(lang);
    return (
      <Container width="xl" className="py-32 text-center">
        <h1 className="font-serif text-3xl text-[var(--brand-text)]">
          {chrome.storyNotFoundTitle}
        </h1>
        <Link
          href="/blog"
          className="mt-6 inline-block text-[var(--brand-accent)] hover:underline"
        >
          {chrome.backToDiary}
        </Link>
      </Container>
    );
  }

  return <ArticleView article={caseStudy} />;
}
