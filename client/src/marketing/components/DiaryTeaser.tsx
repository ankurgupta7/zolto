import { Link } from "wouter";
import { DIARY_POSTS } from "../content/launchContent";
import { ScrollReveal } from "./ScrollReveal";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * DiaryTeaser — the Launch Diary, surfaced where first-time visitors are.
 *
 * The rest of the homepage is Zolto talking about Zolto. This is the one band
 * that points at something a visitor can go and check: a real maker's launch,
 * written up week by week, including the parts that went slowly.
 *
 * It links the published diary posts rather than quoting anybody. The one
 * testimonial in this repo is deliberately withheld until a publicity release
 * is signed (see Pricing.tsx), and a homepage is the last place to leak it —
 * so this section carries titles and deks straight from DIARY_POSTS and lets
 * the articles speak for themselves.
 */
export function DiaryTeaser({
  dense = false,
}: {
  /**
   * Rendered inside the homepage reel's closing chapter, under the CTA (see
   * components/ReelStage.tsx). The chapter owns the band, so this drops its own
   * frame and tightens the cards — every post still shows, and the cards keep
   * their staggered reveal because they are not the first thing in the chapter.
   */
  dense?: boolean;
} = {}) {
  const { t } = useMarketingT();

  const content = (
    <>
      <div className={`max-w-2xl ${dense ? "mb-7" : "mb-12"}`}>
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {t("diaryTeaser.eyebrow")}
        </p>
        <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
          {t("diaryTeaser.heading")}
        </h2>
        <p className="mt-3 text-[var(--brand-muted-2)]">
          {t("diaryTeaser.body")}
        </p>
      </div>

      <ul
        className={`grid sm:grid-cols-2 lg:grid-cols-3 ${
          dense ? "gap-4" : "gap-6"
        }`}
      >
        {DIARY_POSTS.map((post, i) => (
          <ScrollReveal as="li" key={post.slug} delay={i * 120}>
            <Link
              href={`/blog/${post.slug}`}
              className={`group flex h-full flex-col rounded-xl border border-[var(--brand-border)] bg-white transition-colors hover:border-[var(--brand-accent)]/60 ${
                dense ? "p-5" : "p-6"
              }`}
            >
              {post.eyebrow && (
                <p className="text-xs font-medium uppercase tracking-widest text-[var(--brand-accent)]">
                  {post.eyebrow}
                </p>
              )}
              <h3 className="mt-2 font-serif text-lg text-[var(--brand-text)] transition-colors group-hover:text-[var(--brand-accent)]">
                {post.title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                {post.dek}
              </p>
              <p className="mt-4 text-xs uppercase tracking-widest text-[var(--brand-muted)]">
                {post.readingTime}
              </p>
            </Link>
          </ScrollReveal>
        ))}
      </ul>

      <Link
        href="/blog"
        className={`inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)] ${
          dense ? "mt-6" : "mt-8"
        }`}
      >
        {t("diaryTeaser.readAll")}
      </Link>
    </>
  );

  if (dense) {
    return <div data-testid="diary-teaser">{content}</div>;
  }

  return (
    <section
      data-testid="diary-teaser"
      className="border-t border-[var(--brand-border)] bg-[var(--brand-surface-2)]"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        {content}
      </div>
    </section>
  );
}
