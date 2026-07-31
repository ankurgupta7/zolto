import { Link, useRoute } from "wouter";
import { CASE_STUDY } from "../content/launchContent";
import { ArticleView } from "../components/Article";
import { Container } from "../components/Container";

/**
 * The case-study page at /stories/:slug. The slug is release-gated (see
 * @shared/marketing) — only the current story slug resolves; anything else is a
 * not-found, so a stale brand-named URL doesn't render an anonymized page.
 */
export default function Story() {
  const [, params] = useRoute("/stories/:slug");
  const slug = params?.slug ?? "";

  if (slug !== CASE_STUDY.slug) {
    return (
      <Container width="xl" className="py-32 text-center">
        <h1 className="font-serif text-3xl text-[var(--brand-text)]">
          Story not found
        </h1>
        <Link
          href="/blog"
          className="mt-6 inline-block text-[var(--brand-accent)] hover:underline"
        >
          ← Back to the Launch Diary
        </Link>
      </Container>
    );
  }

  return <ArticleView article={CASE_STUDY} />;
}
