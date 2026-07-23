import { Link } from "wouter";
import { DIARY_POSTS, CASE_STUDY } from "../content/launchContent";
import { useDocumentMeta } from "../lib/useDocumentMeta";

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
      className="group flex flex-col rounded-xl border border-[var(--brand-border)] bg-white p-6 transition-colors hover:border-[var(--brand-accent)]"
    >
      {eyebrow && (
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--brand-accent)]">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 font-serif text-xl text-[var(--brand-text)] group-hover:text-[var(--brand-accent)]">
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
 */
export default function Blog() {
  useDocumentMeta({
    title: "Launch Diary — A Maker's First Online Store | Zolto",
    description:
      "The Launch Diary: an honest, week-by-week account of a Zurich pearl jewelry maker launching a first online store on Zolto. No growth hacks, just what happened.",
    path: "/blog",
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-widest text-[var(--brand-accent)]">
          The Launch Diary
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight text-[var(--brand-text)]">
          A maker's first online store, documented.
        </h1>
        <p className="mt-4 text-lg text-[var(--brand-muted-2)]">
          A pearl jewelry maker in Zurich went from ~60 offline sales a month at
          Christmas markets to a hybrid online-offline business. This is the
          real process — setup, launch day, first month — written as it
          happened.
        </p>
      </div>

      <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {DIARY_POSTS.map((post) => (
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
          href={`/stories/${CASE_STUDY.slug}`}
          eyebrow="Case Study"
          title={CASE_STUDY.title}
          dek={CASE_STUDY.dek}
          meta={CASE_STUDY.readingTime}
        />
      </div>
    </div>
  );
}
