import { Link } from "wouter";
import { useTranslation } from "react-i18next";
// Load-bearing side-effect import: it guarantees i18next is initialised (with
// the app's languages registered) before useTranslation runs — including under
// vitest, where nothing else would have imported "@/lib/i18n".
import "@/lib/i18n";
import { matchSupportedLanguage } from "@/lib/languages";
import {
  getDiaryPosts,
  getCaseStudy,
  getBlogChrome,
} from "../content/localizedContent";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { Container } from "../components/Container";

function PostCard({
  href,
  eyebrow,
  title,
  dek,
  meta,
}: {
  href: string;
  eyebrow?: string;
  title: string;
  dek: string;
  meta: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col rounded-xl border border-[var(--brand-border)] bg-white p-6 transition-colors hover:border-[var(--brand-accent)]/60"
    >
      {eyebrow && (
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--brand-accent)]">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-serif text-xl text-[var(--brand-text)] transition-colors group-hover:text-[var(--brand-accent)]">
        {title}
      </h2>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--brand-muted-2)]">
        {dek}
      </p>
      <p className="mt-4 text-xs uppercase tracking-widest text-[var(--brand-muted)]">
        {meta}
      </p>
    </Link>
  );
}

/**
 * The Launch Diary index (/blog). Lists the diary series plus the case study —
 * the Phase-1 content engine's discoverable entry point (business-plan §5.1).
 *
 * Content resolves per language, but slugs — and therefore URLs — do not:
 * /blog/launch-diary-1 is the same document in de, en, fr and it.
 */
export default function Blog() {
  const { i18n } = useTranslation();
  const lang = matchSupportedLanguage(i18n.language) ?? "en";
  const chrome = getBlogChrome(lang);
  const diaryPosts = getDiaryPosts(lang);
  const caseStudy = getCaseStudy(lang);

  useDocumentMeta({
    title: chrome.indexMetaTitle,
    description: chrome.indexMetaDescription,
    path: "/blog",
  });

  return (
    <Container width="5xl" className="py-20">
      <div className="max-w-2xl">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {chrome.indexEyebrow}
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
          {chrome.indexTitle}
        </h1>
        <p className="mt-4 text-lg text-[var(--brand-muted-2)]">
          {chrome.indexIntro}
        </p>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {diaryPosts.map((post) => (
          <PostCard
            key={post.slug}
            href={`/blog/${post.slug}`}
            eyebrow={post.eyebrow}
            title={post.title}
            dek={post.dek}
            meta={post.readingTime}
          />
        ))}
      </div>

      <div className="mt-10">
        <PostCard
          href={`/stories/${caseStudy.slug}`}
          eyebrow={chrome.caseStudyEyebrow}
          title={caseStudy.title}
          dek={caseStudy.dek}
          meta={caseStudy.readingTime}
        />
      </div>
    </Container>
  );
}
