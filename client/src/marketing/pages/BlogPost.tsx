import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
// Load-bearing side-effect import — see Blog.tsx.
import "@/lib/i18n";
import { matchSupportedLanguage } from "@/lib/languages";
import { getDiaryPosts, getBlogChrome } from "../content/localizedContent";
import { ArticleView } from "../components/Article";
import { Container } from "../components/Container";

/**
 * Renders a single Launch Diary post at /blog/:slug, or a not-found notice.
 *
 * The slug is language-independent: the same URL resolves in every language
 * and only the prose changes. A post whose translation hasn't landed falls
 * back to English rather than 404-ing.
 */
export default function BlogPost() {
  const [, params] = useRoute("/blog/:slug");
  const { i18n } = useTranslation();
  const lang = matchSupportedLanguage(i18n.language) ?? "en";
  const slug = params?.slug ?? "";
  const article = getDiaryPosts(lang).find((p) => p.slug === slug);

  if (!article) {
    const chrome = getBlogChrome(lang);
    return (
      <Container width="xl" className="py-32 text-center">
        <h1 className="font-serif text-3xl text-[var(--brand-text)]">
          {chrome.postNotFoundTitle}
        </h1>
        <p className="mt-3 text-[var(--brand-muted-2)]">
          {chrome.postNotFoundBody}
        </p>
        <Link
          href="/blog"
          className="mt-6 inline-block text-[var(--brand-accent)] hover:underline"
        >
          {chrome.backToAllPosts}
        </Link>
      </Container>
    );
  }

  return <ArticleView article={article} />;
}
