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
import { useMarketingT } from "../lib/marketingI18n";

/**
 * A research table. Only the caption, the column heads and the label column
 * carry prose, so only those are translated — the measurement cells are
 * rendered from the shared source untouched, which is what keeps a translated
 * page from ever disagreeing with the numbers it cites.
 */
function DataTable({
  table,
  tableKey,
}: {
  table: ResearchTable;
  tableKey: "weekly" | "sources";
}) {
  const { st } = useMarketingT();
  const base = `research.tables.${tableKey}`;

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="pb-3 text-left text-xs text-[var(--brand-muted)]">
          {st(`${base}.caption`, table.caption)}
        </caption>
        <thead>
          <tr className="border-b border-[var(--brand-border)]">
            {table.head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className="py-3 pr-4 font-medium text-[var(--brand-text)]"
              >
                {st(`${base}.head.${i}`, h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
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
                  {i === 0 ? st(`${base}.rowLabels.${rowIndex}`, cell) : cell}
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
  const { t, st } = useMarketingT();
  const title = st("research.title", PILOT_METHODOLOGY.title);
  const byline = hasNamedAuthor()
    ? `${author.name} · ${author.role}`
    : author.name;

  useDocumentMeta({
    title: t("research.metaTitle", { title }),
    description: t("research.metaDescription"),
    path: `/research/${PILOT_METHODOLOGY.slug}`,
  });

  return (
    <Container className="py-20">
      <article>
        <header className="mx-auto max-w-2xl text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            {t("research.eyebrow")}
          </p>
          <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
            {title}
          </h1>
          <p className="mt-4 text-[var(--brand-muted-2)]">
            {t("research.intro")}
          </p>
          <p className="mt-6 text-xs uppercase tracking-[0.14em] text-[var(--brand-muted)]">
            {t("research.publishedBy", { author: byline })}{" "}
            <time dateTime={PILOT_METHODOLOGY.published}>
              {PILOT_METHODOLOGY.published}
            </time>
          </p>
        </header>

        {/* Method up front — a number without its sample isn't evidence. */}
        <section className="mx-auto mt-14 max-w-2xl rounded-2xl border border-[var(--brand-border)] bg-white p-8">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("research.methodHeading")}
          </h2>
          <dl className="mt-5 space-y-4 text-sm leading-relaxed text-[var(--brand-muted-2)]">
            <div>
              <dt className="font-medium text-[var(--brand-text)]">
                {t("research.sampleLabel")}
              </dt>
              <dd className="mt-1">
                {st("research.sample", PILOT_METHODOLOGY.sample)}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--brand-text)]">
                {t("research.collectionLabel")}
              </dt>
              <dd className="mt-1">
                {st("research.collection", PILOT_METHODOLOGY.collection)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mx-auto mt-14 max-w-3xl">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("research.figuresHeading")}
          </h2>
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {PILOT_METRICS.map((m) => (
              <div
                key={m.label}
                className="rounded-xl border border-[var(--brand-border)] bg-white p-6"
              >
                <dt className="text-xs uppercase tracking-[0.14em] text-[var(--brand-muted)]">
                  {st(`research.metrics.${m.label}.label`, m.label)}
                </dt>
                <dd>
                  <p className="mt-2 font-serif text-3xl lining-nums tabular-nums text-[var(--brand-ink)]">
                    {st(`research.metrics.${m.label}.value`, m.value)}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                    {st(`research.metrics.${m.label}.note`, m.note)}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto mt-14 max-w-3xl">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("research.weeklyHeading")}
          </h2>
          <DataTable table={PILOT_WEEKLY} tableKey="weekly" />
        </section>

        <section className="mx-auto mt-14 max-w-3xl">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("research.sourcesHeading")}
          </h2>
          <DataTable table={PILOT_SOURCES} tableKey="sources" />
        </section>

        <section className="mx-auto mt-14 max-w-2xl">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("research.findingsHeading")}
          </h2>
          <ul className="mt-6 space-y-4">
            {PILOT_FINDINGS.map((f, i) => (
              <li
                key={f}
                className="flex gap-2.5 text-sm leading-relaxed text-[var(--brand-muted-2)]"
              >
                <span aria-hidden className="text-[var(--brand-accent)]">
                  —
                </span>
                {st(`research.findings.${i}`, f)}
              </li>
            ))}
          </ul>
        </section>

        {/* The part most vendor "case studies" leave out. */}
        <section className="mx-auto mt-14 max-w-2xl rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface-2)] p-8">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("research.limitsHeading")}
          </h2>
          <ul className="mt-5 space-y-3">
            {PILOT_METHODOLOGY.limits.map((l, i) => (
              <li
                key={l}
                className="flex gap-2.5 text-sm leading-relaxed text-[var(--brand-muted-2)]"
              >
                <span aria-hidden className="text-[var(--brand-muted)]">
                  —
                </span>
                {st(`research.limits.${i}`, l)}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mx-auto mt-14 max-w-2xl text-center text-sm text-[var(--brand-muted-2)]">
          <p>
            {t("research.diaryLead")}{" "}
            <Link
              href="/blog"
              className="text-[var(--brand-accent)] hover:underline"
            >
              {t("research.diaryLink")}
            </Link>
            .
          </p>
          <p className="mt-4 text-xs text-[var(--brand-muted)]">
            {t("research.citation", {
              title,
              published: PILOT_METHODOLOGY.published,
            })}
          </p>
        </footer>
      </article>
    </Container>
  );
}
