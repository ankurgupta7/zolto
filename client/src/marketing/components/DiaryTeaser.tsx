import { Link } from "wouter";
import { DIARY_POSTS } from "../content/launchContent";
import { ScrollReveal } from "./ScrollReveal";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * DiaryTeaser — the Launch Diary, surfaced where first-time visitors are.
 *
 * The rest of the homepage is Gwinn talking about Gwinn. This is the one band
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
      <div className={`max-w-2xl ${dense ? "mb-3 sm:mb-7" : "mb-12"}`}>
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {t("diaryTeaser.eyebrow")}
        </p>
        <h2
          className={`mt-1.5 font-serif text-[var(--brand-text)] sm:mt-2 ${
            dense ? "text-2xl tall:text-3xl" : "text-3xl"
          }`}
        >
          {t("diaryTeaser.heading")}
        </h2>
        {/* On a phone the reel gives this panel one screen for the heading,
            three post cards and the link out — so the sentence explaining what
            the diary is stands down there and the posts themselves, deks and
            all, take the room. It is back from sm up. */}
        <p
          className={`text-[var(--brand-muted-2)] ${
            dense ? "mt-2 max-sm:hidden sm:mt-3" : "mt-3"
          }`}
        >
          {t("diaryTeaser.body")}
        </p>
      </div>

      {/* Dense is the homepage reel, where the panel around this is itself a
          horizontal swipe — so the cards must not be a second one. They stack as
          three compact rows on a phone instead: eyebrow and reading time share a
          line, the dek is clamped to two, and every post is still on the panel.
          From sm up it is the same grid as anywhere else. */}
      <ul
        className={
          dense
            ? "grid gap-2 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3"
            : "grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {DIARY_POSTS.map((post, i) => (
          <ScrollReveal as="li" key={post.slug} delay={i * 120}>
            <Link
              href={`/blog/${post.slug}`}
              className={`group flex h-full flex-col rounded-xl border border-[var(--brand-border)] bg-white transition-colors hover:border-[var(--brand-accent)]/60 ${
                dense ? "p-2.5 tall:p-3 sm:p-5" : "p-6"
              }`}
            >
              {/* Dense pairs the eyebrow with the reading time on one line
                  rather than parking the time at the foot of the card: two lines
                  of chrome per card is 84px of a phone panel spent on metadata. */}
              <span
                className={
                  dense
                    ? "flex items-baseline justify-between gap-3"
                    : "contents"
                }
              >
                {post.eyebrow && (
                  <span className="block text-xs font-medium uppercase tracking-widest text-[var(--brand-accent)]">
                    {post.eyebrow}
                  </span>
                )}
                {dense && (
                  <span className="whitespace-nowrap text-xs uppercase tracking-widest text-[var(--brand-muted)]">
                    {post.readingTime}
                  </span>
                )}
              </span>
              <h3
                className={`font-serif text-lg text-[var(--brand-text)] transition-colors group-hover:text-[var(--brand-accent)] ${
                  dense ? "mt-1 sm:mt-2" : "mt-2"
                }`}
              >
                {post.title}
              </h3>
              <p
                className={`flex-1 text-sm leading-relaxed text-[var(--brand-muted-2)] ${
                  dense
                    ? "mt-1 line-clamp-2 leading-snug sm:mt-2 sm:line-clamp-none sm:leading-relaxed"
                    : "mt-2"
                }`}
              >
                {post.dek}
              </p>
              {!dense && (
                <p className="mt-4 text-xs uppercase tracking-widest text-[var(--brand-muted)]">
                  {post.readingTime}
                </p>
              )}
            </Link>
          </ScrollReveal>
        ))}
      </ul>

      <Link
        href="/blog"
        className={`inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)] ${
          dense ? "mt-2 tall:mt-3 sm:mt-6" : "mt-8"
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
