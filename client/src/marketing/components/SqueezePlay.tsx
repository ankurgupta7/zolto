import { POSITIONING } from "@shared/platform";
import { source } from "@shared/sources";
import { SketchUnderline } from "@/components/SketchAccents";
import { ScrollReveal } from "./ScrollReveal";
import { SqueezePlayTill } from "./MarketingIllustrations";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * SqueezePlay — three tills, side by side, and only one of them has both.
 *
 * This replaced the card-reader gag as the in-person argument. That section was
 * built on "you don't need to buy a reader", which was true of Zolto and, by
 * 2026, equally true of everyone else: SumUp Tap to Pay and Worldline Tap on
 * Mobile both run on an ordinary phone in Switzerland, and Worldline's carries
 * no monthly fee. A differentiator every competitor shares is a paragraph, not
 * a section.
 *
 * What's left is a genuine squeeze, and it is better shown than argued: two
 * phones with a hole in them and one without. The reader gets it from the
 * drawing before they reach the sentence underneath, which is exactly the job
 * an illustration should be doing.
 *
 * The panels — including which one is missing what — come from
 * POSITIONING.squeezePlay, so the picture and the prose are generated from one
 * fact. Each concession cites the competitor's own documentation; the closing
 * claim is scoped to the three named options rather than to every product in
 * every country, because the broader version isn't checkable (see the doc
 * comment on POSITIONING.squeezePlay).
 *
 * The band comes in two halves — the argument and the tills — because the
 * homepage reel snaps one screen at a time and the whole band is two screens on
 * a phone. Reading order is the same either way: claim, then evidence, then the
 * punchline under the evidence.
 */

/**
 * `dense` marks the homepage-reel rendering: the chapter (and its panels) own
 * the band, the gutter and the vertical rhythm, and the content is on screen
 * the moment its panel arrives, so the ScrollReveal comes off too — it would
 * fade in on arrival and read as jank rather than as unfolding.
 */
interface DenseProps {
  dense?: boolean;
}

/** The eyebrow, the headline and the paragraph that sets up the three tills. */
export function SqueezePlayArgument({ dense = false }: DenseProps = {}) {
  const { st } = useMarketingT();
  const sp = POSITIONING.squeezePlay;

  return (
    <div className="max-w-2xl">
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        {st("squeezePlay.eyebrow", sp.eyebrow)}
      </p>
      <h2 className="mt-3 font-serif text-3xl leading-[1.15] text-[var(--brand-text)] sm:text-4xl">
        {st("squeezePlay.headline", sp.headline)}{" "}
        {/* Only the punchline is underlined — underlining the whole
            heading leaves the stroke trailing once it wraps. */}
        <span className="relative inline-block">
          {st("squeezePlay.headlineEmphasis", sp.headlineEmphasis)}
          <span
            aria-hidden
            className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]"
          >
            <SketchUnderline />
          </span>
        </span>
      </h2>
      {/* Dense gets the short run-up: the matrix beside it is about to show
          the same thing, and in a reel the reader cannot skim past a paragraph
          to find that out. */}
      <p
        className={`leading-relaxed text-[var(--brand-muted-2)] ${
          dense ? "mt-5" : "mt-8"
        }`}
      >
        {dense
          ? st("squeezePlay.bodyShort", sp.bodyShort)
          : st("squeezePlay.body", sp.body)}
      </p>
    </div>
  );
}

/**
 * The three tills as a matrix — three products down, two properties across.
 *
 * This is the homepage rendering, and it exists because the argument was
 * already a table: three options scored on the same two questions, written out
 * as three paragraphs that each named what its subject lacked. Drawn as a grid
 * the reader sees that only one row has two ticks, which is what `claim` used
 * to have to say in a sentence — so in dense the claim comes off the page and
 * the grid makes it instead.
 *
 * Both the ticks and the drawing read `has`, so the picture and the score can't
 * drift apart. The citations move to one footnote line: they belong to the
 * concessions, and the concessions are now cells.
 */
function SqueezeMatrix() {
  const { t, st } = useMarketingT();
  const sp = POSITIONING.squeezePlay;
  const columns = [
    { key: "grid", label: st("squeezePlay.matrix.grid", sp.matrix.grid) },
    { key: "twint", label: st("squeezePlay.matrix.twint", sp.matrix.twint) },
  ] as const;
  const cited = sp.panels.filter(
    (p): p is Extract<(typeof sp.panels)[number], { sourceId: string }> =>
      "sourceId" in p,
  );

  return (
    <div data-testid="squeeze-matrix">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            <th />
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className="w-[27%] border-b border-[var(--brand-border)] pb-2 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--brand-muted-2)] sm:text-[11px]"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sp.panels.map((panel, i) => {
            const isZolto = panel.has.length > 1;
            return (
              <tr
                key={panel.id}
                data-testid={`squeeze-row-${panel.id}`}
                className={`border-b border-[var(--brand-border)] last:border-b-0 ${
                  isZolto ? "bg-[var(--brand-accent)]/[0.09]" : ""
                }`}
              >
                <th scope="row" className="py-2.5 pl-2 pr-3 font-normal">
                  {/* A product name, so it renders from the constant rather
                      than the locale — brands don't translate, and a
                      translatable "SumUp" is a key waiting to drift. */}
                  <span
                    className={`block font-serif text-base leading-tight text-[var(--brand-text)] sm:text-[17px] ${
                      isZolto ? "font-medium" : ""
                    }`}
                  >
                    {panel.vendor}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-[var(--brand-muted-2)] sm:text-[12.5px]">
                    {st(`squeezePlay.panels.${i}.note`, panel.note)}
                  </span>
                </th>
                {columns.map((c) => {
                  const has = (panel.has as readonly string[]).includes(c.key);
                  return (
                    <td
                      key={c.key}
                      data-testid={`squeeze-cell-${panel.id}-${c.key}`}
                      data-has={has ? "true" : "false"}
                      className="py-2.5 text-center align-middle"
                    >
                      {/* The glyph is decorative; the cell's meaning is read
                          out of the row and column headers plus this label. */}
                      <span
                        aria-hidden
                        className={
                          has
                            ? "text-lg leading-none text-[var(--brand-accent)]"
                            : "text-lg leading-none text-[var(--brand-muted)]/45"
                        }
                      >
                        {has ? "✓" : "—"}
                      </span>
                      <span className="sr-only">
                        {t(has ? "squeezePlay.yes" : "squeezePlay.no")}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* One footnote for both concessions — each was a per-card citation when
          each concession was a card. */}
      <p className="mt-3 text-[11px] leading-snug text-[var(--brand-muted)]">
        {cited.map((panel, n) => (
          <span key={panel.id}>
            {n > 0 && " · "}
            <a
              href={source(panel.sourceId).url}
              target="_blank"
              rel="noreferrer nofollow"
              className="underline decoration-dotted underline-offset-2 hover:text-[var(--brand-accent)]"
            >
              {source(panel.sourceId).label}
            </a>
          </span>
        ))}
        {cited.length > 0 && (
          <>
            {" · "}
            {t("sources.read", {
              date: source(cited[0].sourceId).retrievedOn,
            })}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * The three tills and the sentence they prove. On a phone the row becomes a
 * horizontal swipe with its own x-snap: three stacked cards are a screen and a
 * half, and the argument is a *comparison* — it only works if you can put the
 * panels beside each other.
 *
 * `dense` — the homepage reel — renders SqueezeMatrix instead. Three compact
 * card-rows were the previous answer to "a nested swipe strands the reader",
 * and they solved the gesture without solving the reading: 172 words of prose
 * to score three products on two questions. A grid scores them in six cells.
 */
export function SqueezePlayTills({ dense = false }: DenseProps = {}) {
  const { t, st } = useMarketingT();
  const sp = POSITIONING.squeezePlay;

  if (dense) return <SqueezeMatrix />;

  return (
    <div>
      <ul
        data-testid="squeeze-tills"
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:grid sm:snap-none sm:grid-cols-3 sm:gap-8 sm:overflow-visible sm:pb-0"
      >
        {sp.panels.map((panel, i) => {
          const isZolto = panel.has.length > 1;
          return (
            <li
              key={panel.id}
              data-testid={`squeeze-panel-${panel.id}`}
              className={`min-w-[80%] shrink-0 snap-center rounded-2xl border p-6 sm:min-w-0 sm:shrink ${
                isZolto
                  ? "border-[var(--brand-accent)] bg-white ring-1 ring-[var(--brand-accent)]"
                  : "border-[var(--brand-border)] bg-white/60"
              }`}
            >
              <SqueezePlayTill
                has={panel.has}
                title={st(`squeezePlay.panels.${i}.label`, panel.label)}
                className={`mx-auto h-40 w-auto ${
                  isZolto
                    ? "text-[var(--brand-ink)]"
                    : "text-[var(--brand-muted)]"
                }`}
              />
              <div>
                <h3 className="mt-6 font-serif text-lg leading-snug text-[var(--brand-text)]">
                  {st(`squeezePlay.panels.${i}.label`, panel.label)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                  {st(`squeezePlay.panels.${i}.detail`, panel.detail)}
                </p>
                {"sourceId" in panel && panel.sourceId && (
                  <p className="mt-3 text-xs text-[var(--brand-muted)]">
                    <a
                      href={source(panel.sourceId).url}
                      target="_blank"
                      rel="noreferrer nofollow"
                      className="underline decoration-dotted underline-offset-2 hover:text-[var(--brand-accent)]"
                    >
                      {source(panel.sourceId).label}
                    </a>{" "}
                    ·{" "}
                    {t("sources.read", {
                      date: source(panel.sourceId).retrievedOn,
                    })}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <p
        data-testid="squeeze-claim"
        className="mt-10 max-w-2xl font-serif text-xl leading-snug text-[var(--brand-text)]"
      >
        {st("squeezePlay.claim", sp.claim)}
      </p>
    </div>
  );
}

/** The whole band, as it renders anywhere that is not the homepage reel. */
export function SqueezePlay() {
  return (
    <section className="bg-[var(--brand-surface)]" data-testid="squeeze-play">
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        <ScrollReveal>
          <SqueezePlayArgument />
          <div className="mt-12">
            <SqueezePlayTills />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
