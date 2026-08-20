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
 * The band leads with where Gwinn is from and who it's built for, then shows
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

/**
 * `dense` marks the homepage-reel rendering: the chapter's panels own the band,
 * the gutter and the vertical rhythm, and the reveal comes off because a panel's
 * content is on screen the instant you arrive. The band splits into intro and
 * ledger because the reel snaps one screen at a time and nine rows plus two
 * paragraphs is two screens on a phone — no copy and no row leaves, because a
 * ledger that hid its unfinished rows to fit a viewport would be the badge this
 * section exists not to be.
 */
interface DenseProps {
  dense?: boolean;
}

/** Bar segment colours, matched to the chips above so the two read as one key. */
const BAR: Record<SovereigntyEntry["state"], string> = {
  swiss: "bg-emerald-700",
  european: "bg-emerald-500/70",
  moving: "bg-[var(--brand-accent)]",
  foreign: "bg-[var(--brand-muted)]",
};

const BAR_ORDER: SovereigntyEntry["state"][] = [
  "swiss",
  "european",
  "moving",
  "foreign",
];

/**
 * The ledger's shape, before any of its rows are read.
 *
 * Nine rows of piece-and-state is a table you have to work through to learn
 * the one thing the section is actually claiming: mostly there, honest about
 * the rest. The bar says that at a glance, and then the rows are evidence
 * rather than homework.
 *
 * Counts are computed from the ledger, never typed in — a hardcoded "3 Swiss"
 * would be a number that quietly goes wrong the first time a row flips state,
 * which is precisely the event this whole structure exists to advertise.
 */
export function SovereigntyBar() {
  const { t } = useMarketingT();
  const total = SOVEREIGNTY.ledger.length;
  const segments = BAR_ORDER.map((state) => ({
    state,
    count: SOVEREIGNTY.ledger.filter((e) => e.state === state).length,
  })).filter((s) => s.count > 0);

  const label = segments
    .map(
      (s) =>
        `${s.count} ${t(`sovereignty.state.${s.state}`, {
          defaultValue: SOVEREIGNTY_STATE_LABEL[s.state],
        })}`,
    )
    .join(", ");

  return (
    <div data-testid="sovereignty-bar">
      <div
        role="img"
        aria-label={label}
        className="flex h-6 overflow-hidden rounded-md"
      >
        {segments.map((s) => (
          <div
            key={s.state}
            data-testid={`sovereignty-bar-${s.state}`}
            data-count={s.count}
            style={{ width: `${(s.count / total) * 100}%` }}
            className={`flex items-center justify-center text-[10px] font-medium text-white lining-nums tabular-nums ${BAR[s.state]}`}
          >
            {s.count}
          </div>
        ))}
      </div>
      <ul aria-hidden className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <li
            key={s.state}
            className="flex items-center gap-1.5 text-[11px] text-[var(--brand-muted-2)]"
          >
            <span className={`h-2.5 w-2.5 rounded-sm ${BAR[s.state]}`} />
            {t(`sovereignty.state.${s.state}`, {
              defaultValue: SOVEREIGNTY_STATE_LABEL[s.state],
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Where Gwinn is from, and who it is built for. */
export function SwissMadeIntro({ dense = false }: DenseProps = {}) {
  const { st } = useMarketingT();
  return (
    <div className="max-w-2xl">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        {st("sovereignty.eyebrow", SOVEREIGNTY.eyebrow)}
      </p>
      <h2 className="mt-3 font-serif text-3xl leading-[1.15] text-[var(--brand-text)] sm:text-4xl">
        {st("sovereignty.headline", SOVEREIGNTY.headline)}{" "}
        {/* Only the short second half is underlined, so the stroke stays tight
            to the words however the heading wraps. */}
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
      {/* Dense takes one line and the bar. `serving` and `body` between them
          say "built in Zürich" and "run from Europe" — which is the headline
          directly above and the ledger's first row directly beside. What the
          bar cannot say is that the list is complete, so that clause stays. */}
      {dense ? (
        <>
          <p className="mt-3 leading-relaxed text-[var(--brand-text)]">
            {st("sovereignty.bodyShort", SOVEREIGNTY.bodyShort)}
          </p>
          <div className="mt-4">
            <SovereigntyBar />
          </div>
        </>
      ) : (
        <>
          <p className="mt-8 text-lg leading-relaxed text-[var(--brand-text)]">
            {st("sovereignty.serving", SOVEREIGNTY.serving)}
          </p>
          <p className="mt-4 leading-relaxed text-[var(--brand-muted-2)]">
            {st("sovereignty.body", SOVEREIGNTY.body)}
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The ledger: every piece of the stack, what state it is in, what happens next.
 *
 * `from`/`to` exist for the homepage reel, where a panel is one screen and nine
 * rows are a screen and a quarter on a phone: the trust chapter renders the
 * ledger as two consecutive panels rather than one that overflows. Every row
 * still ships — the list continues on the next screen, which is what lists do.
 * The "what's moving next" link rides with the last slice.
 */
export function SwissMadeLedger({
  dense = false,
  from = 0,
  to = SOVEREIGNTY.ledger.length,
}: DenseProps & { from?: number; to?: number } = {}) {
  const { t, st } = useMarketingT();
  const rows = SOVEREIGNTY.ledger.slice(from, to);
  const isFirstSlice = from === 0;
  const isLastSlice = to >= SOVEREIGNTY.ledger.length;

  return (
    <div>
      {/* Every row, including the ones we'd rather not print.
          Once the panels are columns rather than screens, consecutive slices
          close their facing corners and borders so the reader sees the one list
          they are — the split exists for phones, not for the layout. */}
      <ul
        className={`grid gap-px overflow-hidden border border-[var(--brand-border)] bg-[var(--brand-border)] ${
          isFirstSlice ? "rounded-t-2xl" : "rounded-t-2xl reel:rounded-t-none"
        } ${
          isLastSlice
            ? "rounded-b-2xl"
            : "rounded-b-2xl reel:rounded-b-none reel:border-b-0"
        }`}
      >
        {rows.map((entry, offset) => {
          const i = from + offset;
          return (
            <li
              key={entry.piece}
              className={`grid gap-2 bg-white sm:grid-cols-[1fr_auto] sm:items-center ${
                dense
                  ? "px-3 py-1 sm:gap-4 sm:px-4 sm:py-1.5"
                  : "px-5 py-4 sm:gap-6"
              }`}
            >
              {/* Dense puts the piece and its state on one line rather than two:
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
                  className={`text-[var(--brand-muted-2)] ${
                    dense
                      ? "text-[13px] leading-snug sm:text-sm sm:leading-relaxed"
                      : "mt-0.5 text-sm leading-relaxed"
                  }`}
                >
                  {dense
                    ? st(`sovereignty.ledger.${i}.todayShort`, entry.todayShort)
                    : st(`sovereignty.ledger.${i}.today`, entry.today)}
                </p>
              </div>
              <StateChip state={entry.state} />
            </li>
          );
        })}
      </ul>

      {isLastSlice && (
        <Link
          href={SOVEREIGNTY.href}
          className={`inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)] ${
            dense ? "mt-3" : "mt-8"
          }`}
        >
          {t("sovereignty.whatsNextLink")}
        </Link>
      )}
    </div>
  );
}

/** The whole band, as it renders anywhere that is not the homepage reel. */
export function SwissMade() {
  return (
    <section
      data-testid="swiss-made"
      className="border-y border-[var(--brand-border)] bg-[var(--brand-ground)]"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        <ScrollReveal>
          <SwissMadeIntro />
          <div className="mt-10">
            <SwissMadeLedger />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
