import { Link, useParams } from "wouter";
import { Container } from "../components/Container";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import {
  SEGMENTS,
  findSegment,
  segmentFeatures,
  type Segment as SegmentType,
} from "@shared/segments";
import { PLATFORM } from "@shared/platform";
import { useMarketingT } from "../lib/marketingI18n";

function SegmentIndex() {
  const { t, st } = useMarketingT();

  useDocumentMeta({
    title: t("segment.indexMetaTitle", { name: PLATFORM.name }),
    description: t("segment.indexMetaDescription", { name: PLATFORM.name }),
    path: "/for",
  });

  return (
    <Container className="py-20">
      <h1 className="text-center font-serif text-4xl text-[var(--brand-text)]">
        {t("segment.indexHeading", { name: PLATFORM.name })}
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-[var(--brand-muted-2)]">
        {t("segment.indexIntro")}
      </p>
      <ul className="mx-auto mt-12 grid max-w-2xl gap-4">
        {SEGMENTS.map((s) => (
          <li key={s.id}>
            <Link
              href={`/for/${s.id}`}
              className="block rounded-xl border border-[var(--brand-border)] bg-white p-6 transition-colors hover:border-[var(--brand-accent)]"
            >
              <span className="font-serif text-xl text-[var(--brand-text)]">
                {st(`segments.${s.id}.name`, s.name)}
              </span>
              <span className="mt-2 block text-sm text-[var(--brand-muted-2)]">
                {st(`segments.${s.id}.summary`, s.summary)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

function SegmentPage({ segment }: { segment: SegmentType }) {
  const { t, st } = useMarketingT();

  const name = st(`segments.${segment.id}.name`, segment.name);
  const headline = st(`segments.${segment.id}.headline`, segment.headline);
  const summary = st(`segments.${segment.id}.summary`, segment.summary);

  useDocumentMeta({
    title: t("segment.metaTitle", { headline, name: PLATFORM.name }),
    description: t("segment.metaDescription", {
      summary,
      pricing: st("platform.pricingSummary", PLATFORM.pricingSummary),
    }),
    path: `/for/${segment.id}`,
  });

  const features = segmentFeatures(segment);

  return (
    <Container className="py-20">
      <header className="mx-auto max-w-2xl text-center">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {name.toLowerCase()}
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
          {headline}
        </h1>
        <p className="mt-4 text-[var(--brand-muted-2)]">{summary}</p>
      </header>

      <section className="mx-auto mt-14 max-w-2xl">
        <h2 className="font-serif text-2xl text-[var(--brand-text)]">
          {t("segment.painHeading")}
        </h2>
        <ul className="mt-6 space-y-3">
          {segment.painPoints.map((p, i) => (
            <li
              key={p}
              className="flex gap-2.5 text-sm leading-relaxed text-[var(--brand-muted-2)]"
            >
              <span aria-hidden className="text-[var(--brand-muted)]">
                —
              </span>
              {st(`segments.${segment.id}.painPoints.${i}`, p)}
            </li>
          ))}
        </ul>
      </section>

      {/*
        Rendered from the real FEATURES records via segmentFeatures(), so this
        section can't promise a capability Zolto doesn't ship.
      */}
      <section className="mx-auto mt-14 max-w-3xl">
        <h2 className="font-serif text-2xl text-[var(--brand-text)]">
          {t("segment.helpHeading", { name: PLATFORM.name })}
        </h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.id}
              className="rounded-xl border border-[var(--brand-border)] bg-white p-6"
            >
              <dt className="font-medium text-[var(--brand-text)]">
                {st(`features.${f.id}.name`, f.name)}
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                {st(`features.${f.id}.description`, f.description)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto mt-14 max-w-2xl rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface-2)] p-8">
        <h2 className="font-serif text-2xl text-[var(--brand-text)]">
          {t("segment.scenarioHeading")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--brand-muted-2)]">
          {st(`segments.${segment.id}.scenario`, segment.scenario)}
        </p>
      </section>

      <div className="mx-auto mt-14 max-w-2xl text-center">
        <p className="text-sm text-[var(--brand-muted-2)]">
          {st("platform.pricingSummary", PLATFORM.pricingSummary)}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-[var(--brand-accent)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            {t("segment.startFree")}
          </Link>
          <Link
            href="/faq"
            className="rounded-md border border-[var(--brand-ink)]/25 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
          >
            {t("segment.readFaq")}
          </Link>
        </div>
      </div>

      <nav className="mx-auto mt-12 max-w-3xl text-center text-sm">
        <span className="text-[var(--brand-muted)]">
          {t("segment.alsoFor")}{" "}
        </span>
        {SEGMENTS.filter((s) => s.id !== segment.id).map((s, i) => (
          <span key={s.id}>
            {i > 0 && <span className="text-[var(--brand-muted)]"> · </span>}
            <Link
              href={`/for/${s.id}`}
              className="text-[var(--brand-accent)] hover:underline"
            >
              {st(`segments.${s.id}.name`, s.name)}
            </Link>
          </span>
        ))}
      </nav>
    </Container>
  );
}

/**
 * /for/:segment — one page per audience Zolto is built for.
 *
 * The platform's audience was always stated as a list, but addressed with a
 * single generic landing page, so a ceramics studio or a market seller had
 * nothing written for them specifically. Each page names its own problems and
 * then resolves the relevant features out of the shared FEATURES set.
 *
 * Every string that originates in shared/segments.ts or shared/platform.ts is
 * rendered through `st()` — the shared English stays the fallback, so a segment
 * or feature added there shows up in English rather than as a blank.
 */
export default function Segment() {
  const params = useParams<{ segment?: string }>();
  const segment = findSegment(params.segment ?? "");
  return segment ? <SegmentPage segment={segment} /> : <SegmentIndex />;
}
