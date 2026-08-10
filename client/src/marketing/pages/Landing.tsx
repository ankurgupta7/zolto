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
import { AiNativeThesis, DiscoveryShiftChart } from "../components/AgentPitch";
import { HeroTill } from "../components/HeroTill";
import { DayInTheLife } from "../components/DayInTheLife";
import { ScrollReveal } from "../components/ScrollReveal";
import { DiaryTeaser } from "../components/DiaryTeaser";
import { ZeroCostPosClaim, ZeroCostPosPrice } from "../components/ZeroCostPos";
import {
  SqueezePlayArgument,
  SqueezePlayTills,
} from "../components/SqueezePlay";
import { SwissMadeIntro, SwissMadeLedger } from "../components/SwissMade";
import { ExplainerVideo } from "../components/ExplainerVideo";
import {
  ReelChapter,
  ReelPanel,
  ReelPanels,
  ReelStage,
} from "../components/ReelStage";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * The Zolto homepage, as a reel of carousel posts.
 *
 * Six chapters. Each is one post — exactly one screen, so flicking down slides
 * the one you're leaving up and fills the viewport with the next — and each post
 * is made of panels you swipe *sideways* through, with dots under them, the way
 * a multi-picture post works. Above a roomy breakpoint the sideways axis
 * collapses and the panels become the chapter's columns: that is the desktop page
 * this reel started as. components/ReelStage.tsx holds the mechanics.
 *
 * Content that cannot fit a phone screen goes sideways rather than making a post
 * taller. That is what the two axes buy: the vertical rhythm stays exactly one
 * screen per flick on a 375px phone and on a 1920px desktop alike, and the first
 * two cuts of this page could not manage that at any size but 1440x900.
 *
 * What each chapter carries, and the desktop grid its panels fall back into:
 *
 *   1 Promise        copy + CTA | explainer video
 *   2 The squeeze    the squeeze argument, three tills | the CHF 0 claim, its price
 *   3 How it works   title, then one inventory | photo→listing | the till
 *   4 Trust          cost strip, the pledge | Swissness intro, the ledger
 *   5 What's coming  the market day | the AI-native thesis, its chart
 *   6 Start free     closing CTA, the launch diary
 *
 * No copy changed when this became a reel, and no colour left its token. Bands
 * arguing the same point were paired into one chapter, and the dark ones became
 * dark *panels* on a light chapter (the CHF 0 claim and its price, the thesis,
 * the cost strip, the closing CTA) — the same statement at the size a shared
 * screen allows.
 *
 * Three bands left the homepage rather than being shrunk below legibility:
 * AgentProofBand, HowAnAiBuys and the end-of-day email mock live on /why-zolto,
 * and the old-guard comparison table moved to the /compare index. Chapter five
 * links the first; the nav links the second.
 *
 * The `contents reel:grid` wrappers are how one panel list serves both axes:
 * `display: contents` makes a group's slides direct children of the horizontal
 * track, and the same wrapper becomes a real grid column on a desktop.
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

      <ReelStage label={t("landing.reel.railLabel")}>
        {/* ── 1. Promise — what Zolto is, in the merchant's nouns, beside the
             explainer video (see MAKER_PITCH) ── */}
        <ReelChapter
          id="promise"
          label={t("landing.reel.promise")}
          className="bg-[var(--brand-ink)]"
        >
          <ReelPanels layout="reel:grid-cols-2 reel:items-center reel:gap-10">
            <ReelPanel>
              <div>
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
                <p className="mt-4 max-w-md leading-relaxed text-white/70 sm:mt-6 sm:text-lg">
                  {st("makerPitch.body", MAKER_PITCH.body)}
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-3 sm:mt-8 sm:gap-4">
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
                <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-white/50 sm:mt-8">
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
            </ReelPanel>

            {/* The product, shown rather than asserted. */}
            <ReelPanel>
              <ExplainerVideo
                src={EXPLAINER_SRC}
                poster={EXPLAINER_POSTER}
                captionKey="landing.video.caption"
              />
            </ReelPanel>
          </ReelPanels>
        </ReelChapter>

        {/* ── 2. The squeeze — the in-person argument and the CHF 0 till that
             answers it, which used to be two consecutive bands making one
             point ── */}
        <ReelChapter
          id="squeeze"
          label={t("landing.reel.squeeze")}
          className="bg-[var(--brand-surface)]"
        >
          {/* Each column is its own stack, not cells in a shared 2x2 grid: grid
              rows are shared between columns, so a short panel beside a tall one
              inherits the tall one's row and the chapter grows by the difference
              — 456px of it, in this chapter's case. */}
          <ReelPanels layout="reel:grid-cols-[1.05fr_0.95fr] reel:items-center reel:gap-6">
            <div className="contents reel:grid reel:content-center reel:gap-6">
              <ReelPanel>
                <SqueezePlayArgument dense />
              </ReelPanel>
              <ReelPanel>
                <SqueezePlayTills dense />
              </ReelPanel>
            </div>
            <div className="contents reel:grid reel:content-center reel:gap-6">
              <ReelPanel>
                <ZeroCostPosClaim dense />
              </ReelPanel>
              <ReelPanel>
                <ZeroCostPosPrice dense />
              </ReelPanel>
            </div>
          </ReelPanels>
        </ReelChapter>

        {/* ── 3. How it works — one inventory, photo→listing, and the till the
             hero used to show ── */}
        <ReelChapter id="product" label={t("landing.reel.how")}>
          <ReelPanels layout="reel:grid-cols-3 reel:gap-10">
            <ReelPanel className="reel:col-span-3">
              <div className="text-center">
                <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
                  {t("landing.howEyebrow")}
                </p>
                <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)] sm:text-4xl">
                  {t("landing.howHeading")}
                </h2>
              </div>
            </ReelPanel>

            {/* Feature 1 — one inventory, two channels */}
            <ReelPanel>
              <div>
                <h3 className="font-serif text-2xl text-[var(--brand-text)]">
                  {t("landing.inventoryTitle")}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
                  {t("landing.inventoryBody")}
                </p>
                <div className="mt-4">
                  <OneInventoryDiagram />
                </div>
              </div>
            </ReelPanel>

            {/* Feature 2 — photo to listing */}
            <ReelPanel>
              <div>
                <h3 className="font-serif text-2xl text-[var(--brand-text)]">
                  {t("landing.photoTitle")}
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
                  {t("landing.photoBody")}
                </p>
                <div className="mt-4">
                  <PhotoToListing />
                </div>
              </div>
            </ReelPanel>

            {/* The till itself, down from the hero. It is drawn for the
                mahogany, so on a light chapter it keeps its own dark ground —
                the same move the CHF 0 claim and the thesis make. */}
            <ReelPanel>
              <div className="rounded-2xl bg-[var(--brand-ink)]">
                <HeroTill />
              </div>
            </ReelPanel>
          </ReelPanels>
        </ReelChapter>

        {/* ── 4. Trust — a year with the old guard against a month here, the
             pledge, and the ledger ── */}
        <ReelChapter
          id="trust"
          label={t("landing.reel.trust")}
          className="border-y border-[var(--brand-border)] bg-[var(--brand-surface-2)]"
        >
          {/* The ledger takes the wider column: its nine rows only lay out one
              line each once they have room for the piece and its state side by
              side. See SwissMadeLedger's `dense`. */}
          <ReelPanels layout="reel:grid-cols-[0.72fr_1.28fr] reel:items-start reel:gap-6">
            <div className="contents reel:grid reel:content-center reel:gap-6">
              <ReelPanel>
                {/* Cost strip (Direction A) — the mahogany band, now a panel.
                    It stays three-across on a phone rather than stacking: the
                    stacked version is 700px tall (the rotated arrow alone claims
                    a row the width of the card), and a *comparison* that puts
                    the two numbers a swipe apart isn't one. */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-[var(--brand-ink-deep)] px-4 py-7 text-center sm:gap-4 sm:p-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/45 sm:text-[11px] sm:tracking-[0.2em]">
                      {st(
                        "costComparison.themLabel",
                        COST_COMPARISON.themLabel,
                      )}
                    </p>
                    <p className="mt-1.5 whitespace-nowrap font-serif text-2xl font-semibold text-white/55 line-through decoration-[var(--brand-accent)]/60 lining-nums tabular-nums sm:mt-2 sm:text-4xl">
                      CHF{" "}
                      {COST_COMPARISON.themPerYearChf.toLocaleString(
                        numberLocale,
                      )}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-snug text-white/40 sm:mt-2 sm:text-xs">
                      {st("costComparison.themNote", COST_COMPARISON.themNote)}
                    </p>
                  </div>
                  <div
                    aria-hidden
                    className="text-xl text-[var(--brand-accent)] sm:text-3xl"
                  >
                    →
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/45 sm:text-[11px] sm:tracking-[0.2em]">
                      {st("costComparison.usLabel", COST_COMPARISON.usLabel)}
                    </p>
                    <p className="mt-1.5 whitespace-nowrap font-serif text-3xl font-bold text-[var(--brand-accent-light)] lining-nums tabular-nums sm:mt-2 sm:text-5xl">
                      {formatPrice(COST_COMPARISON.usPerMonthChf)}
                    </p>
                    <p className="mt-1.5 text-[11px] leading-snug text-white/40 sm:mt-2 sm:text-xs">
                      {st("costComparison.usNote", COST_COMPARISON.usNote)}
                    </p>
                  </div>
                </div>
              </ReelPanel>

              {/* The pledge (Direction B) — the heart of the positioning. It
                  keeps its reveal: it is not the first thing in the chapter. The
                  five itemised points render on /pricing, above the plans — see
                  PRICING_PROMISE.restatedByPricingFeeSection. */}
              <ReelPanel>
                <ScrollReveal className="relative rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-[0_20px_50px_-34px_rgba(45,38,32,0.4)] sm:p-8">
                  <span className="absolute -top-3 left-5 bg-white px-2.5 font-hand text-xl text-[var(--brand-accent)] sm:left-8">
                    {t("landing.pledgeEyebrow")}
                  </span>
                  <p className="font-serif text-xl leading-snug text-[var(--brand-text)] lining-nums sm:text-2xl">
                    &ldquo;
                    {st("pricingPromise.pledge", PRICING_PROMISE.pledge)}&rdquo;
                  </p>
                  <Link
                    href="/pricing"
                    className="mt-4 inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)]"
                  >
                    {t("landing.seePricing")}
                  </Link>
                  <p className="mt-4 font-hand text-2xl text-[var(--brand-text)]">
                    {t("landing.pledgeSignature")}
                  </p>
                </ScrollReveal>
              </ReelPanel>
            </div>

            {/* Made in Switzerland — the ledger, every row, still on the
                homepage rather than behind the link. Nine rows are a screen and
                a quarter on a phone, so they read over two panels; in reel mode
                the two sit back to back in the same column and look like the one
                list they are. */}
            <div className="contents reel:grid reel:content-center reel:gap-4">
              <ReelPanel>
                <SwissMadeIntro dense />
              </ReelPanel>
              <ReelPanel>
                <SwissMadeLedger dense to={5} />
              </ReelPanel>
              {/* -mt-4 cancels the column gap so the two slices meet. */}
              <ReelPanel className="reel:-mt-4">
                <SwissMadeLedger dense from={5} />
              </ReelPanel>
            </div>
          </ReelPanels>
        </ReelChapter>

        {/* ── 5. What's coming — a market day, and the thesis it is heading
             towards. The proof band and the found→asked→bought mechanics moved
             to /why-zolto; this chapter links them. ── */}
        <ReelChapter
          id="whats-coming"
          label={t("landing.reel.whatsComing")}
          className="bg-white"
        >
          <ReelPanels layout="reel:grid-cols-[1fr_0.85fr] reel:items-start reel:gap-8">
            <div className="contents reel:grid reel:content-center reel:gap-8">
              <ReelPanel>
                <div className="max-w-2xl">
                  <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
                    {t("landing.messyEyebrow")}
                  </p>
                  <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)] sm:text-4xl">
                    {t("landing.messyHeading")}
                  </h2>
                  <p className="mt-3 text-[var(--brand-muted-2)]">
                    {t("landing.messyBody")}
                  </p>
                  <Link
                    href="/why-zolto"
                    className="mt-5 inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)]"
                  >
                    {t("landing.reel.whyZoltoLink")}
                  </Link>
                </div>
              </ReelPanel>
              <ReelPanel>
                <DayInTheLife />
              </ReelPanel>
            </div>
            <div className="contents reel:grid reel:content-center reel:gap-5">
              <ReelPanel>
                <AiNativeThesis dense />
              </ReelPanel>
              <ReelPanel>
                <DiscoveryShiftChart dense />
              </ReelPanel>
            </div>
          </ReelPanels>
        </ReelChapter>

        {/* ── 6. Start free — the closing CTA and the one thing on this page a
             visitor can go and check for themselves ── */}
        <ReelChapter
          id="start-free"
          label={t("landing.reel.startFree")}
          className="border-t border-[var(--brand-border)] bg-[var(--brand-surface-2)]"
        >
          <ReelPanels layout="reel:gap-10">
            <ReelPanel>
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
            </ReelPanel>

            <ReelPanel>
              <DiaryTeaser dense />
            </ReelPanel>
          </ReelPanels>
        </ReelChapter>
      </ReelStage>
    </>
  );
}
