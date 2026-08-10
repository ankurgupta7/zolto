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
      <p
        className={`leading-relaxed text-[var(--brand-muted-2)] ${
          dense ? "mt-5" : "mt-8"
        }`}
      >
        {st("squeezePlay.body", sp.body)}
      </p>
    </div>
  );
}

/**
 * The three tills and the sentence they prove. On a phone the row becomes a
 * horizontal swipe with its own x-snap: three stacked cards are a screen and a
 * half, and the argument is a *comparison* — it only works if you can put the
 * panels beside each other.
 */
export function SqueezePlayTills({ dense = false }: DenseProps = {}) {
  const { t, st } = useMarketingT();
  const sp = POSITIONING.squeezePlay;

  return (
    <div>
      <ul
        className={`flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 sm:grid sm:snap-none sm:overflow-visible sm:pb-0 sm:grid-cols-3 ${
          dense ? "sm:gap-3" : "sm:gap-8"
        }`}
      >
        {sp.panels.map((panel, i) => {
          const isZolto = panel.has.length > 1;
          return (
            <li
              key={panel.id}
              data-testid={`squeeze-panel-${panel.id}`}
              className={`min-w-[80%] shrink-0 snap-center rounded-2xl border sm:min-w-0 sm:shrink ${
                dense ? "p-4" : "p-6"
              } ${
                isZolto
                  ? "border-[var(--brand-accent)] bg-white ring-1 ring-[var(--brand-accent)]"
                  : "border-[var(--brand-border)] bg-white/60"
              }`}
            >
              <SqueezePlayTill
                has={panel.has}
                title={st(`squeezePlay.panels.${i}.label`, panel.label)}
                className={`mx-auto w-auto ${dense ? "h-24" : "h-40"} ${
                  isZolto
                    ? "text-[var(--brand-ink)]"
                    : "text-[var(--brand-muted)]"
                }`}
              />
              <h3
                className={`font-serif text-lg leading-snug text-[var(--brand-text)] ${
                  dense ? "mt-3" : "mt-6"
                }`}
              >
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
            </li>
          );
        })}
      </ul>

      <p
        data-testid="squeeze-claim"
        className={`max-w-2xl font-serif text-xl leading-snug text-[var(--brand-text)] ${
          dense ? "mt-4" : "mt-10"
        }`}
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
