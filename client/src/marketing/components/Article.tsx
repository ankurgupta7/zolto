import { Link } from "wouter";
import type { Article, Block } from "../content/launchContent";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { Container } from "./Container";

function JsonLd({ schema }: { schema: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return (
        <p className="text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
          {block.text}
        </p>
      );
    case "h2":
      return (
        <h2 className="mt-10 font-serif text-2xl text-[var(--brand-text)]">
          {block.text}
        </h2>
      );
    case "ul":
      return (
        <ul className="ml-1 space-y-2">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]"
            >
              <span aria-hidden className="mt-1 text-[var(--brand-accent)]">
                •
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="ml-1 space-y-2">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]"
            >
              <span
                aria-hidden
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--brand-surface)] text-xs font-medium text-[var(--brand-ink)]"
              >
                {i + 1}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
    case "quote":
      return (
        <blockquote className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
          <p className="font-serif text-lg italic text-[var(--brand-text)]">
            “{block.text}”
          </p>
          {block.cite && (
            <footer className="mt-3 text-sm text-[var(--brand-muted)]">
              — {block.cite}
            </footer>
          )}
        </blockquote>
      );
    case "note":
      return (
        <p className="rounded-xl border border-[var(--brand-accent)]/30 bg-[var(--brand-accent)]/8 p-4 text-sm leading-relaxed text-[var(--brand-ink)]">
          {block.text}
        </p>
      );
    case "table":
      return (
        <figure className="my-2">
          <div className="overflow-x-auto rounded-xl border border-[var(--brand-border)]">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[var(--brand-surface)]">
                  {block.head.map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-2.5 font-medium text-[var(--brand-text)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-t border-[var(--brand-border)]"
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-4 py-2.5 text-[var(--brand-muted-2)]"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption && (
            <figcaption className="mt-2 text-xs text-[var(--brand-muted)]">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case "figure":
      return (
        <figure className="my-2">
          <img
            src={block.image.src}
            alt={block.image.alt}
            loading="lazy"
            className="w-full rounded-xl border border-[var(--brand-border)]"
          />
          {block.caption && (
            <figcaption className="mt-2 text-xs text-[var(--brand-muted)]">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case "beforeAfter":
      return (
        <figure className="my-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { img: block.before, label: block.beforeLabel },
              { img: block.after, label: block.afterLabel },
            ].map(({ img, label }, i) => (
              <div key={i} className="relative">
                <img
                  src={img.src}
                  alt={img.alt}
                  loading="lazy"
                  className="aspect-[3/4] w-full rounded-xl border border-[var(--brand-border)] object-cover"
                />
                {label && (
                  <span className="absolute left-2 top-2 rounded-full bg-[var(--brand-ink)]/80 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
                    {label}
                  </span>
                )}
              </div>
            ))}
          </div>
          {block.caption && (
            <figcaption className="mt-2 text-xs text-[var(--brand-muted)]">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
  }
}

/**
 * Renders a Launch Diary / case-study article inside the Zolto marketing chrome,
 * with per-page document metadata and JSON-LD. Shared by BlogPost and Story.
 */
export function ArticleView({ article }: { article: Article }) {
  useDocumentMeta({
    title: article.metaTitle,
    description: article.metaDescription,
    path:
      article.kind === "story"
        ? `/stories/${article.slug}`
        : `/blog/${article.slug}`,
  });

  const published = new Date(article.datePublished).toLocaleDateString(
    "en-CH",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  return (
    <Container as="article" width="3xl" className="py-16">
      <JsonLd schema={article.schema} />

      <Link
        href="/blog"
        className="text-sm text-[var(--brand-accent)] hover:underline"
      >
        ← All Launch Diary posts
      </Link>

      {article.eyebrow && (
        <p className="mt-8 text-xs font-medium uppercase tracking-widest text-[var(--brand-accent)]">
          {article.eyebrow}
        </p>
      )}
      <h1 className="mt-3 font-serif text-4xl text-[var(--brand-text)]">
        {article.title}
      </h1>
      <p className="mt-4 text-lg text-[var(--brand-muted-2)]">{article.dek}</p>
      <p className="mt-3 text-xs uppercase tracking-widest text-[var(--brand-muted)]">
        {published} · {article.readingTime}
      </p>

      <div className="mt-10 space-y-4">
        {article.blocks.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </div>

      {article.next && (
        <div className="mt-14 rounded-xl border border-[var(--brand-border)] bg-white p-6">
          <p className="text-xs uppercase tracking-widest text-[var(--brand-muted)]">
            Next in the series
          </p>
          <Link
            href={article.next.href}
            className="mt-2 inline-block font-serif text-lg text-[var(--brand-text)] hover:text-[var(--brand-accent)]"
          >
            {article.next.label} →
          </Link>
        </div>
      )}

      <p className="mt-12 border-t border-[var(--brand-border)] pt-6 text-xs leading-relaxed text-[var(--brand-muted)]">
        This series documents a real maker's first online-store launch on Zolto.
        No growth hacks, no cherry-picked metrics — just what happened.
      </p>
    </Container>
  );
}
