import { Link } from "wouter";
import type { Article, Block } from "../content/launchContent";
import { useDocumentMeta } from "../lib/useDocumentMeta";

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
        <p className="text-[15px] leading-relaxed text-slate-300">
          {block.text}
        </p>
      );
    case "h2":
      return (
        <h2 className="mt-10 text-2xl font-semibold tracking-tight text-white">
          {block.text}
        </h2>
      );
    case "ul":
      return (
        <ul className="ml-1 space-y-2">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex gap-3 text-[15px] leading-relaxed text-slate-300"
            >
              <span aria-hidden className="mt-1 text-violet-400">
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
              className="flex gap-3 text-[15px] leading-relaxed text-slate-300"
            >
              <span
                aria-hidden
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-violet-500/15 text-xs font-medium text-violet-300"
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
        <blockquote className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-lg text-slate-200">“{block.text}”</p>
          {block.cite && (
            <footer className="mt-3 text-sm text-slate-400">
              — {block.cite}
            </footer>
          )}
        </blockquote>
      );
    case "note":
      return (
        <p className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4 text-sm leading-relaxed text-violet-100">
          {block.text}
        </p>
      );
    case "table":
      return (
        <figure className="my-2">
          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-slate-900">
                  {block.head.map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-4 py-2.5 font-medium text-slate-200"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri} className="border-t border-slate-800">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2.5 text-slate-300">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.caption && (
            <figcaption className="mt-2 text-xs text-slate-500">
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
    <article className="mx-auto max-w-3xl px-6 py-16">
      <JsonLd schema={article.schema} />

      <Link href="/blog" className="text-sm text-violet-300 hover:underline">
        ← All Launch Diary posts
      </Link>

      {article.eyebrow && (
        <p className="mt-8 text-xs font-medium uppercase tracking-widest text-violet-400">
          {article.eyebrow}
        </p>
      )}
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">
        {article.title}
      </h1>
      <p className="mt-4 text-lg text-slate-300">{article.dek}</p>
      <p className="mt-3 text-xs uppercase tracking-widest text-slate-500">
        {published} · {article.readingTime}
      </p>

      <div className="mt-10 space-y-4">
        {article.blocks.map((block, i) => (
          <BlockView key={i} block={block} />
        ))}
      </div>

      {article.next && (
        <div className="mt-14 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Next in the series
          </p>
          <Link
            href={article.next.href}
            className="mt-2 inline-block text-lg font-medium text-white hover:text-violet-300"
          >
            {article.next.label} →
          </Link>
        </div>
      )}

      <p className="mt-12 border-t border-slate-800 pt-6 text-xs leading-relaxed text-slate-500">
        This series documents a real maker's first online-store launch on Zolto.
        No growth hacks, no cherry-picked metrics — just what happened.
      </p>
    </article>
  );
}
