import { Link } from "wouter";
import {
  SOVEREIGNTY,
  SOVEREIGNTY_STATE_LABEL,
  type SovereigntyEntry,
} from "@shared/platform";
import { SketchUnderline } from "@/components/SketchAccents";
import { ScrollReveal } from "./ScrollReveal";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * SwissMade — the Swissness claim, given a loud band high on the page.
 *
 * The band leads with where Zolto is from and who it's built for, then shows
 * the ledger: every piece of the stack, what state it's actually in, and what
 * happens next. The rows that aren't Swiss yet are on the homepage too, not
 * hidden behind the "read more" link — a ledger that only listed the finished
 * rows would be a badge, and badges are what everyone else prints.
 *
 * Copy lives in SOVEREIGNTY (shared/platform.ts); the detail, the reasoning
 * and the sub-processor caveat live on /made-in-switzerland.
 */

/** Chip colours per state — green for done, gold for in flight, grey for never. */
const CHIP: Record<SovereigntyEntry["state"], string> = {
  swiss: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  european: "border-emerald-600/30 bg-emerald-50 text-emerald-800",
  moving:
    "border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 text-[var(--brand-ink)]",
  foreign:
    "border-[var(--brand-border)] bg-[var(--brand-surface-2)] text-[var(--brand-muted)]",
};

export function StateChip({ state }: { state: SovereigntyEntry["state"] }) {
  const { t } = useMarketingT();
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.1em] ${CHIP[state]}`}
    >
      {t(`sovereignty.state.${state}`, {
        defaultValue: SOVEREIGNTY_STATE_LABEL[state],
      })}
    </span>
  );
}

export function SwissMade({
  dense = false,
}: {
  /**
   * Rendered inside the homepage reel's trust chapter, beside the cost strip
   * and the pledge (see components/ReelStage.tsx). Nine ledger rows plus two
   * paragraphs is the tallest thing on the homepage, so `dense` tightens the
   * row rhythm and drops the band's own frame and ScrollReveal — no copy and
   * no row leaves, because a ledger that hid its unfinished rows to fit a
   * viewport would be the badge this section exists not to be.
   */
  dense?: boolean;
} = {}) {
  const { t, st } = useMarketingT();

  const content = (
    <>
      <div className="max-w-2xl">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {st("sovereignty.eyebrow", SOVEREIGNTY.eyebrow)}
        </p>
        <h2 className="mt-3 font-serif text-3xl leading-[1.15] text-[var(--brand-text)] sm:text-4xl">
          {st("sovereignty.headline", SOVEREIGNTY.headline)}{" "}
          {/* Only the short second half is underlined, so the stroke stays
                  tight to the words however the heading wraps. */}
          <span className="relative inline-block">
            {st("sovereignty.headlineEmphasis", SOVEREIGNTY.headlineEmphasis)}
            <span
              aria-hidden
              className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]"
            >
              <SketchUnderline />
            </span>
          </span>
        </h2>
        {/* Dense reads the two intro paragraphs as a pair of columns rather
            than a stack — same words, half the height, which is what leaves the
            ledger its nine rows inside one chapter. */}
        <div
          className={
            dense ? "mt-3 grid gap-3 sm:grid-cols-2 sm:items-baseline" : ""
          }
        >
          <p
            className={`text-lg leading-relaxed text-[var(--brand-text)] ${
              dense ? "" : "mt-8"
            }`}
          >
            {st("sovereignty.serving", SOVEREIGNTY.serving)}
          </p>
          <p
            className={`leading-relaxed text-[var(--brand-muted-2)] ${
              dense ? "" : "mt-4"
            }`}
          >
            {st("sovereignty.body", SOVEREIGNTY.body)}
          </p>
        </div>
      </div>

      {/* The ledger. Every row, including the ones we'd rather not print. */}
      <ul
        className={`grid gap-px overflow-hidden rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-border)] ${
          dense ? "mt-4" : "mt-10"
        }`}
      >
        {SOVEREIGNTY.ledger.map((entry, i) => (
          <li
            key={entry.piece}
            className={`grid gap-2 bg-white sm:grid-cols-[1fr_auto] sm:items-center ${
              dense ? "px-4 py-1.5 sm:gap-4" : "px-5 py-4 sm:gap-6"
            }`}
          >
            {/* Dense puts the piece and its state on one line rather than two.
                Nine rows of stacked pairs is the tallest block on the homepage;
                laid out as a row each, the ledger reads more like the ledger it
                claims to be and costs a third of the height. */}
            <div
              className={
                dense
                  ? "grid gap-0.5 sm:grid-cols-[minmax(0,11rem)_1fr] sm:items-baseline sm:gap-4"
                  : ""
              }
            >
              <p
                className={`font-serif leading-snug text-[var(--brand-text)] ${
                  dense ? "text-base" : "text-lg"
                }`}
              >
                {st(`sovereignty.ledger.${i}.piece`, entry.piece)}
              </p>
              <p
                className={`text-sm leading-relaxed text-[var(--brand-muted-2)] ${
                  dense ? "" : "mt-0.5"
                }`}
              >
                {st(`sovereignty.ledger.${i}.today`, entry.today)}
              </p>
            </div>
            <StateChip state={entry.state} />
          </li>
        ))}
      </ul>

      <Link
        href={SOVEREIGNTY.href}
        className={`inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)] ${
          dense ? "mt-3" : "mt-8"
        }`}
      >
        {t("sovereignty.whatsNextLink")}
      </Link>
    </>
  );

  if (dense) {
    return <div data-testid="swiss-made">{content}</div>;
  }

  return (
    <section
      data-testid="swiss-made"
      className="border-y border-[var(--brand-border)] bg-[var(--brand-ground)]"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        <ScrollReveal>{content}</ScrollReveal>
      </div>
    </section>
  );
}
