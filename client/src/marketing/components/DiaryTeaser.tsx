import { Link } from "wouter";
import { DIARY_POSTS } from "../content/launchContent";
import { ScrollReveal } from "./ScrollReveal";

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
export function DiaryTeaser() {
  return (
    <section className="border-t border-[var(--brand-border)] bg-[var(--brand-surface-2)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            the launch diary
          </p>
          <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
            Someone already did this. Here&rsquo;s the unedited version.
          </h2>
          <p className="mt-3 text-[var(--brand-muted-2)]">
            A Zurich jeweller went from Christmas-market-only to selling online,
            and let us write down how it actually went — the slow bits included.
            No growth hacks, no six-figure screenshots.
          </p>
        </div>

        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {DIARY_POSTS.map((post, i) => (
            <ScrollReveal as="li" key={post.slug} delay={i * 120}>
              <Link
                href={`/blog/${post.slug}`}
                className="group flex h-full flex-col rounded-xl border border-[var(--brand-border)] bg-white p-6 transition-colors hover:border-[var(--brand-accent)]/60"
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
          className="mt-8 inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)]"
        >
          Read the whole diary →
        </Link>
      </div>
    </section>
  );
}
