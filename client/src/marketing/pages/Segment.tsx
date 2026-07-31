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

function SegmentIndex() {
  useDocumentMeta({
    title: `Who ${PLATFORM.name} is for`,
    description: `${PLATFORM.name} for jewelry makers, ceramics studios, market sellers and small boutiques — what changes for each.`,
    path: "/for",
  });

  return (
    <Container className="py-20">
      <h1 className="text-center font-serif text-4xl text-[var(--brand-text)]">
        Who {PLATFORM.name} is for
      </h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-[var(--brand-muted-2)]">
        The same platform, but the part that matters depends on what you make
        and where you sell it.
      </p>
      <ul className="mx-auto mt-12 grid max-w-2xl gap-4">
        {SEGMENTS.map((s) => (
          <li key={s.id}>
            <Link
              href={`/for/${s.id}`}
              className="block rounded-xl border border-[var(--brand-border)] bg-white p-6 transition-colors hover:border-[var(--brand-accent)]"
            >
              <span className="font-serif text-xl text-[var(--brand-text)]">
                {s.name}
              </span>
              <span className="mt-2 block text-sm text-[var(--brand-muted-2)]">
                {s.summary}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Container>
  );
}

function SegmentPage({ segment }: { segment: SegmentType }) {
  useDocumentMeta({
    title: `${segment.headline} | ${PLATFORM.name}`,
    description: `${segment.summary} ${PLATFORM.pricingSummary}`,
    path: `/for/${segment.id}`,
  });

  const features = segmentFeatures(segment);

  return (
    <Container className="py-20">
      <header className="mx-auto max-w-2xl text-center">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {segment.name.toLowerCase()}
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
          {segment.headline}
        </h1>
        <p className="mt-4 text-[var(--brand-muted-2)]">{segment.summary}</p>
      </header>

      <section className="mx-auto mt-14 max-w-2xl">
        <h2 className="font-serif text-2xl text-[var(--brand-text)]">
          What usually gets in the way
        </h2>
        <ul className="mt-6 space-y-3">
          {segment.painPoints.map((p) => (
            <li
              key={p}
              className="flex gap-2.5 text-sm leading-relaxed text-[var(--brand-muted-2)]"
            >
              <span aria-hidden className="text-[var(--brand-muted)]">
                —
              </span>
              {p}
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
          What {PLATFORM.name} does about it
        </h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.id}
              className="rounded-xl border border-[var(--brand-border)] bg-white p-6"
            >
              <dt className="font-medium text-[var(--brand-text)]">{f.name}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                {f.description}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mx-auto mt-14 max-w-2xl rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface-2)] p-8">
        <h2 className="font-serif text-2xl text-[var(--brand-text)]">
          What that looks like
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--brand-muted-2)]">
          {segment.scenario}
        </p>
      </section>

      <div className="mx-auto mt-14 max-w-2xl text-center">
        <p className="text-sm text-[var(--brand-muted-2)]">
          {PLATFORM.pricingSummary}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-[var(--brand-accent)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            Start free
          </Link>
          <Link
            href="/faq"
            className="rounded-md border border-[var(--brand-ink)]/25 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
          >
            Read the FAQ
          </Link>
        </div>
      </div>

      <nav className="mx-auto mt-12 max-w-3xl text-center text-sm">
        <span className="text-[var(--brand-muted)]">Also for: </span>
        {SEGMENTS.filter((s) => s.id !== segment.id).map((s, i) => (
          <span key={s.id}>
            {i > 0 && <span className="text-[var(--brand-muted)]"> · </span>}
            <Link
              href={`/for/${s.id}`}
              className="text-[var(--brand-accent)] hover:underline"
            >
              {s.name}
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
 */
export default function Segment() {
  const params = useParams<{ segment?: string }>();
  const segment = findSegment(params.segment ?? "");
  return segment ? <SegmentPage segment={segment} /> : <SegmentIndex />;
}
