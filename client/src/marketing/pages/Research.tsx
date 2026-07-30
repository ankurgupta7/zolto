import { Link } from "wouter";
import { Container } from "../components/Container";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import {
  PILOT_METHODOLOGY,
  PILOT_METRICS,
  PILOT_WEEKLY,
  PILOT_SOURCES,
  PILOT_FINDINGS,
  type ResearchTable,
} from "@shared/research";
import { author, hasNamedAuthor } from "@shared/authors";

function DataTable({ table }: { table: ResearchTable }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="pb-3 text-left text-xs text-[var(--brand-muted)]">
          {table.caption}
        </caption>
        <thead>
          <tr className="border-b border-[var(--brand-border)]">
            {table.head.map((h) => (
              <th
                key={h}
                scope="col"
                className="py-3 pr-4 font-medium text-[var(--brand-text)]"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row) => (
            <tr
              key={row[0]}
              className="border-b border-[var(--brand-border)]/60"
            >
              {row.map((cell, i) => (
                <td
                  key={`${row[0]}-${table.head[i]}`}
                  className={`py-3 pr-4 tabular-nums ${
                    i === 0
                      ? "font-medium text-[var(--brand-text)]"
                      : "text-[var(--brand-muted-2)]"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * /research/first-month-online — Zolto's first-party pilot data, published as a
 * citable research page rather than left inside the Launch Diary narrative.
 *
 * The same numbers appear in Launch Diary #3, but as story beats. Stated with a
 * sample, a collection method and explicit limits, they become something another
 * writer or an AI assistant can quote — which is what original research and
 * checkable claims are actually for.
 *
 * The limits section is not boilerplate. One store, one month, one category,
 * published by the platform vendor: saying that plainly is what makes the rest
 * of the page worth believing.
 */
export default function Research() {
  useDocumentMeta({
    title: `${PILOT_METHODOLOGY.title} | Zolto research`,
    description:
      "First-party data from one maker's first 30 days selling online: 12 orders, CHF 61 average order value, 2.5% conversion, and where the orders actually came from. Method and limits stated.",
    path: `/research/${PILOT_METHODOLOGY.slug}`,
  });

  return (
    <Container className="py-20">
      <article>
        <header className="mx-auto max-w-2xl text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            first-party data
          </p>
          <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
            {PILOT_METHODOLOGY.title}
          </h1>
          <p className="mt-4 text-[var(--brand-muted-2)]">
            What actually happened in the first 30 days after one maker&rsquo;s
            storefront went live — including the numbers that don&rsquo;t
            flatter us.
          </p>
          <p className="mt-6 text-xs uppercase tracking-[0.14em] text-[var(--brand-muted)]">
            {hasNamedAuthor() ? `${author.name} · ${author.role}` : author.name}{" "}
            · Published{" "}
            <time dateTime={PILOT_METHODOLOGY.published}>
              {PILOT_METHODOLOGY.published}
            </time>
          </p>
        </header>

        {/* Method up front — a number without its sample isn't evidence. */}
        <section className="mx-auto mt-14 max-w-2xl rounded-2xl border border-[var(--brand-border)] bg-white p-8">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            Method
          </h2>
          <dl className="mt-5 space-y-4 text-sm leading-relaxed text-[var(--brand-muted-2)]">
            <div>
              <dt className="font-medium text-[var(--brand-text)]">Sample</dt>
              <dd className="mt-1">{PILOT_METHODOLOGY.sample}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--brand-text)]">
                Collection
              </dt>
              <dd className="mt-1">{PILOT_METHODOLOGY.collection}</dd>
            </div>
          </dl>
        </section>

        <section className="mx-auto mt-14 max-w-3xl">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            Headline figures
          </h2>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {PILOT_METRICS.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-[var(--brand-border)] bg-white p-6"
              >
                <dt className="text-xs uppercase tracking-[0.14em] text-[var(--brand-muted)]">
                  {m.label}
                </dt>
                <dd>
                  <p className="mt-2 font-serif text-3xl tabular-nums text-[var(--brand-ink)]">
                    {m.value}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                    {m.note}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto mt-14 max-w-3xl">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            Week by week
          </h2>
          <DataTable table={PILOT_WEEKLY} />
        </section>

        <section className="mx-auto mt-14 max-w-3xl">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            Where the orders came from
          </h2>
          <DataTable table={PILOT_SOURCES} />
        </section>

        <section className="mx-auto mt-14 max-w-2xl">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            What we take from it
          </h2>
          <ul className="mt-6 space-y-4">
            {PILOT_FINDINGS.map((f) => (
              <li
                key={f}
                className="flex gap-2.5 text-sm leading-relaxed text-[var(--brand-muted-2)]"
              >
                <span aria-hidden className="text-[var(--brand-accent)]">
                  —
                </span>
                {f}
              </li>
            ))}
          </ul>
        </section>

        {/* The part most vendor "case studies" leave out. */}
        <section className="mx-auto mt-14 max-w-2xl rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface-2)] p-8">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            What this doesn&rsquo;t show
          </h2>
          <ul className="mt-5 space-y-3">
            {PILOT_METHODOLOGY.limits.map((l) => (
              <li
                key={l}
                className="flex gap-2.5 text-sm leading-relaxed text-[var(--brand-muted-2)]"
              >
                <span aria-hidden className="text-[var(--brand-muted)]">
                  —
                </span>
                {l}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mx-auto mt-14 max-w-2xl text-center text-sm text-[var(--brand-muted-2)]">
          <p>
            The month-by-month story behind these numbers is in the{" "}
            <Link
              href="/blog"
              className="text-[var(--brand-accent)] hover:underline"
            >
              Launch Diary
            </Link>
            .
          </p>
          <p className="mt-4 text-xs text-[var(--brand-muted)]">
            Reusing these figures? Please cite &ldquo;Zolto,{" "}
            {PILOT_METHODOLOGY.title} ({PILOT_METHODOLOGY.published})&rdquo; and
            link back to this page.
          </p>
        </footer>
      </article>
    </Container>
  );
}
