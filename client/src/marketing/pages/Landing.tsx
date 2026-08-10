import { Link } from "wouter";
import { SketchUnderline } from "@/components/SketchAccents";
import ParticleField from "@/components/ParticleField";
import {
  MAKER_PITCH,
  PRICING_PROMISE,
  COST_COMPARISON,
  SOVEREIGNTY,
  formatPrice,
} from "@shared/platform";
import {
  OneInventoryDiagram,
  PhotoToListing,
} from "../components/MarketingIllustrations";
import { AiNativeBand } from "../components/AgentPitch";
import { HeroTill } from "../components/HeroTill";
import { Container } from "../components/Container";
import { DayInTheLife } from "../components/DayInTheLife";
import { ScrollReveal } from "../components/ScrollReveal";
import { DiaryTeaser } from "../components/DiaryTeaser";
import { ZeroCostPos } from "../components/ZeroCostPos";
import { SqueezePlay } from "../components/SqueezePlay";
import { SwissMade } from "../components/SwissMade";
import { ExplainerVideo } from "../components/ExplainerVideo";
import { ReelChapter, ReelStage } from "../components/ReelStage";
import { MarketingFooter } from "../components/MarketingChrome";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * The Zolto homepage, as a reel.
 *
 * This page used to be sixteen stacked bands, read top to bottom, and it was
 * tiring in exactly the way a long page is: no sense of where you were, no
 * sense of how much was left, and nowhere prominent enough to put the explainer
 * video. It is now six chapters, each the height of the viewport, snapping to
 * the top of whichever one you're in, with a progress rail on the right — see
 * components/ReelStage.tsx for the mechanics and for the three ways the snap
 * gets out of the reader's way.
 *
 * Not a word of copy changed, and no colour left its token. What changed is
 * choreography and what the homepage carries:
 *
 * - The explainer video takes the hero's second column, and the till it
 *   replaced moved down to the how-it-works chapter as its third visual.
 * - Bands that were arguing the same point twice were paired into one chapter,
 *   with the dark ones becoming dark *panels* on a light chapter (ZeroCostPos,
 *   AiNativeBand, the cost strip, the closing CTA). Same statement, at the size
 *   a shared viewport allows.
 * - Three bands left the homepage rather than being shrunk below legibility:
 *   AgentProofBand, HowAnAiBuys and the end-of-day email mock now live on
 *   /why-zolto (pages/WhyZolto.tsx), and the old-guard comparison table moved
 *   to the /compare index, where the reader is already choosing between named
 *   products. Chapter five links to the first; the nav already links the second.
 *
 * The rule for the split: anything a chapter could not hold at 100vh on a
 * 1440×900 desktop went to a sub-page. Body copy never went below 15px and no
 * heading changed scale to make something fit.
 */

/** The explainer cut and its drawn poster — see client/public/video/README.md. */
const EXPLAINER_SRC = "/video/zolto-explainer.mp4";
const EXPLAINER_POSTER = "/video/zolto-explainer-poster.svg";

export default function Landing() {
  const { t, st, numberLocale } = useMarketingT();

  return (
    <>
      {/* Ambient gold-dust layer — glows over the mahogany hero/CTA bands,
          fades out over the light sections via screen blend. Portalled to the
          body, so it is fixed to the viewport rather than to the reel. */}
      <ParticleField />

      <ReelStage
        label={t("landing.reel.railLabel")}
        trailer={<MarketingFooter />}
      >
        {/* ── 1. Promise — what Zolto is, in the merchant's nouns, beside the
             explainer video (see MAKER_PITCH) ── */}
        <ReelChapter
          id="promise"
          label={t("landing.reel.promise")}
          className="bg-[var(--brand-ink)]"
        >
          {/* Three grid children, not two, so the video can sit between the
              copy and the buttons on a phone and still occupy the second
              column on a desktop. A merchant browsing on their phone is the
              likeliest reader there is; the picture of the product should not
              be the one thing their screen drops. */}
          <Container className="grid gap-10 md:grid-cols-2 md:items-center">
            <div className="md:col-start-1 md:row-start-1">
              <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
                {st("makerPitch.eyebrow", MAKER_PITCH.eyebrow)}
              </p>
              {/* The column, not max-w, is what actually bounds this heading —
                  see MAKER_PITCH.headlineEmphasis for the measurements and for
                  why the underlined phrase has to stay short. */}
              <h1 className="mt-4 max-w-2xl font-serif text-4xl leading-[1.1] text-white sm:text-5xl">
                {st("makerPitch.headline", MAKER_PITCH.headline)}{" "}
                {/* Only the punchline is underlined, so the stroke stays tight
                    to the words however the heading wraps. */}
                <span className="relative inline-block">
                  {st(
                    "makerPitch.headlineEmphasis",
                    MAKER_PITCH.headlineEmphasis,
                  )}
                  <span className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]">
                    <SketchUnderline />
                  </span>
                </span>
              </h1>
              <p className="mt-8 max-w-md text-lg leading-relaxed text-white/70">
                {st("makerPitch.body", MAKER_PITCH.body)}
              </p>
            </div>

            {/* The product, shown rather than asserted. */}
            <div className="md:col-start-2 md:row-start-1 md:row-end-3">
              <ExplainerVideo
                src={EXPLAINER_SRC}
                poster={EXPLAINER_POSTER}
                captionKey="landing.video.caption"
              />
            </div>

            <div className="md:col-start-1 md:row-start-2">
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/signup"
                  className="rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
                >
                  {t("landing.startFree")}
                </Link>
                <Link
                  href="/pricing"
                  className="rounded-md border border-white/25 px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-white/85 transition-colors hover:border-white hover:text-white"
                >
                  {t("landing.seePricing")}
                </Link>
              </div>

              {/* Where we're from, above the fold. Three facts, no sentence —
                  the trust chapter does the explaining. */}
              <ul className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-white/50">
                {SOVEREIGNTY.heroBadges.map((badge, i) => (
                  <li key={badge} className="flex items-center gap-2">
                    <span aria-hidden className="text-[var(--brand-accent)]">
                      ✦
                    </span>
                    {st(`sovereignty.heroBadges.${i}`, badge)}
                  </li>
                ))}
              </ul>
            </div>
          </Container>
        </ReelChapter>

        {/* ── 2. The squeeze — the in-person argument and the CHF 0 till that
             answers it, which used to be two consecutive bands making one
             point ── */}
        <ReelChapter
          id="squeeze"
          label={t("landing.reel.squeeze")}
          className="bg-[var(--brand-surface)]"
        >
          <Container className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <SqueezePlay dense />
            <ZeroCostPos dense />
          </Container>
        </ReelChapter>

        {/* ── 3. How it works — one inventory, photo→listing, and the till the
             hero used to show ── */}
        <ReelChapter id="product" label={t("landing.reel.how")}>
          <Container>
            <div className="mb-10 text-center">
              <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
                {t("landing.howEyebrow")}
              </p>
              <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
                {t("landing.howHeading")}
              </h2>
            </div>

            {/* Not three equal columns: the photo→listing flow is three panels
                wide on its own, so it takes the roomiest third and the till —
                drawn for a hero column — takes the narrowest. */}
            <div className="grid gap-10 md:grid-cols-[1fr_1.2fr_0.8fr] md:items-start">
              {/* Feature 1 — one inventory, two channels */}
              <div>
                <h3 className="font-serif text-2xl text-[var(--brand-text)]">
                  {t("landing.inventoryTitle")}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
                  {t("landing.inventoryBody")}
                </p>
                <div className="mt-6">
                  <OneInventoryDiagram />
                </div>
              </div>

              {/* Feature 2 — photo to listing */}
              <div>
                <h3 className="font-serif text-2xl text-[var(--brand-text)]">
                  {t("landing.photoTitle")}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
                  {t("landing.photoBody")}
                </p>
                <div className="mt-6">
                  <PhotoToListing />
                </div>
              </div>

              {/* The till itself, down from the hero. It is drawn for the
                  mahogany, so on a light chapter it keeps its own dark ground
                  — the same move ZeroCostPos and AiNativeBand make. */}
              <div className="rounded-2xl bg-[var(--brand-ink)]">
                <HeroTill />
              </div>
            </div>
          </Container>
        </ReelChapter>

        {/* ── 4. Trust — a year with the old guard against a month here, the
             pledge, and the ledger ── */}
        <ReelChapter
          id="trust"
          label={t("landing.reel.trust")}
          className="border-y border-[var(--brand-border)] bg-[var(--brand-surface-2)]"
        >
          {/* The ledger takes the wider column on purpose: its nine rows only
              lay out one line each once they have room for the piece and its
              state side by side, and flattening them is what buys the strip and
              the pledge theirs. See SwissMade's `dense`. */}
          <Container className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div className="grid gap-6">
              {/* Cost strip (Direction A) — the mahogany band, now a panel. */}
              <div className="grid items-center gap-4 rounded-2xl bg-[var(--brand-ink-deep)] p-6 text-center sm:grid-cols-[1fr_auto_1fr]">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                    {st("costComparison.themLabel", COST_COMPARISON.themLabel)}
                  </p>
                  <p className="mt-2 font-serif text-4xl font-semibold text-white/55 line-through decoration-[var(--brand-accent)]/60 lining-nums tabular-nums">
                    CHF{" "}
                    {COST_COMPARISON.themPerYearChf.toLocaleString(
                      numberLocale,
                    )}
                  </p>
                  <p className="mt-2 text-xs text-white/40">
                    {st("costComparison.themNote", COST_COMPARISON.themNote)}
                  </p>
                </div>
                <div
                  aria-hidden
                  className="text-3xl text-[var(--brand-accent)] max-sm:rotate-90"
                >
                  →
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                    {st("costComparison.usLabel", COST_COMPARISON.usLabel)}
                  </p>
                  <p className="mt-2 font-serif text-5xl font-bold text-[var(--brand-accent-light)] lining-nums tabular-nums">
                    {formatPrice(COST_COMPARISON.usPerMonthChf)}
                  </p>
                  <p className="mt-2 text-xs text-white/40">
                    {st("costComparison.usNote", COST_COMPARISON.usNote)}
                  </p>
                </div>
              </div>

              {/* The pledge (Direction B) — the heart of the positioning. It
                  keeps its reveal: it is not the first thing in the chapter. */}
              <ScrollReveal className="relative rounded-2xl border border-[var(--brand-border)] bg-white p-8 shadow-[0_20px_50px_-34px_rgba(45,38,32,0.4)]">
                <span className="absolute -top-3 left-8 bg-white px-2.5 font-hand text-xl text-[var(--brand-accent)]">
                  {t("landing.pledgeEyebrow")}
                </span>
                <p className="font-serif text-2xl leading-snug text-[var(--brand-text)] lining-nums">
                  &ldquo;
                  {st("pricingPromise.pledge", PRICING_PROMISE.pledge)}&rdquo;
                </p>
                {/* The five itemised points that used to follow the promise
                    render in full on /pricing, above the plans, and always did
                    — this card carried a second copy of them. At ~900px of
                    them, keeping the duplicate here is what would have pushed
                    this chapter past a viewport, so the promise stays on the
                    homepage and its arithmetic lives one click away. */}
                <Link
                  href="/pricing"
                  className="mt-5 inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)]"
                >
                  {t("landing.seePricing")}
                </Link>
                <p className="mt-5 font-hand text-2xl text-[var(--brand-text)]">
                  {t("landing.pledgeSignature")}
                </p>
              </ScrollReveal>
            </div>

            {/* Made in Switzerland — the ledger, every row, still on the
                homepage rather than behind the link. */}
            <SwissMade dense />
          </Container>
        </ReelChapter>

        {/* ── 5. What's coming — a market day, and the thesis it is heading
             towards. The proof band and the found→asked→bought mechanics moved
             to /why-zolto; this chapter links them. ── */}
        <ReelChapter
          id="whats-coming"
          label={t("landing.reel.whatsComing")}
          className="bg-white"
        >
          {/* The chapter's heading sits in the left column rather than across
              the top: the thesis panel beside it is the taller of the two, so a
              full-width header would have pushed the chapter past a viewport for
              no gain in how it reads. */}
          <Container className="grid gap-8 lg:grid-cols-[1fr_0.85fr] lg:items-start">
            <div>
              <div className="max-w-2xl">
                <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
                  {t("landing.messyEyebrow")}
                </p>
                <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
                  {t("landing.messyHeading")}
                </h2>
                <p className="mt-3 text-[var(--brand-muted-2)]">
                  {t("landing.messyBody")}
                </p>
              </div>

              <div className="mt-8">
                <DayInTheLife />
              </div>
              <Link
                href="/why-zolto"
                className="mt-4 inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)]"
              >
                {t("landing.reel.whyZoltoLink")}
              </Link>
            </div>
            <AiNativeBand dense />
          </Container>
        </ReelChapter>

        {/* ── 6. Start free — the closing CTA and the one thing on this page a
             visitor can go and check for themselves ── */}
        <ReelChapter
          id="start-free"
          label={t("landing.reel.startFree")}
          className="border-t border-[var(--brand-border)] bg-[var(--brand-surface-2)]"
        >
          <Container>
            <div className="rounded-2xl bg-[var(--brand-ink)] px-7 py-10 text-center">
              <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
                {t("landing.ctaEyebrow")}
              </p>
              <h2 className="mt-3 font-serif text-3xl text-white sm:text-4xl">
                {t("landing.ctaHeading")}
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-white/70">
                {t("landing.ctaBody")}
              </p>
              <Link
                href="/signup"
                className="mt-7 inline-block rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
              >
                {t("landing.ctaButton")}
              </Link>
            </div>

            <div className="mt-10">
              <DiaryTeaser dense />
            </div>
          </Container>
        </ReelChapter>
      </ReelStage>
    </>
  );
}
