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
 * Eight posts, and a post is exactly one screen — so flicking down slides
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
 * One post makes one claim, and no post is more than three screens wide, so a
 * reader who never swipes sideways still gets the whole argument — the rail is
 * that argument's outline. What each post carries, and the desktop grid its
 * slides fall back into:
 *
 *   1 Promise         one slide: the claim, the explainer video, the CTAs
 *   2 The squeeze     the argument | the three tills
 *   3 Free in person  the CHF 0 claim | its price
 *   4 How it works    one inventory | photo→listing | the till
 *   5 What it costs   the cost strip | the pledge
 *   6 Trust           Swissness intro | the ledger, in two slices
 *   7 What's coming   the messy claim + the thesis, its chart | a market day
 *   8 Start free      closing CTA, the launch diary
 *
 * Two screens went away rather than moving: the "One shop. Everywhere you sell."
 * heading now opens the one-inventory slide, and the "Sell first. Sort it out
 * later." copy opens the thesis slide. A slide carrying nothing but an eyebrow
 * and an h2 costs a swipe and says nothing the next slide doesn't.
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
          {/* One slide, not two: the promise and the thing it promises belong on
              the same screen — the video *is* the argument, and a reader who has
              to swipe for it has already read the claim unproven. The desktop
              hero is unchanged, because the grid placement below rebuilds the
              two columns out of the same three blocks. */}
          <ReelPanels>
            <ReelPanel>
              {/* Stacked on a phone — copy, then the video, then the buttons, the
                  order the reader needs them in. Two columns from md up, which is
                  also what saves the hero on a wide-but-short laptop: 1232px of
                  measure gave the paragraph one line and the frame 360px of
                  height, and the slide stopped fitting its own screen. */}
              <div className="grid content-center gap-2.5 tall:gap-6 md:grid-cols-[1.05fr_0.95fr] md:items-center md:gap-10">
                <div className="md:col-start-1 md:row-start-1">
                  <p className="font-hand text-xl leading-none text-[var(--brand-accent)] tall:text-2xl">
                    {st("makerPitch.eyebrow", MAKER_PITCH.eyebrow)}
                  </p>
                  {/* The column, not max-w, is what actually bounds this heading —
                      see MAKER_PITCH.headlineEmphasis for the measurements and for
                      why the underlined phrase has to stay short. */}
                  <h1 className="mt-2 max-w-2xl font-serif text-3xl leading-[1.1] text-white tall:mt-4 tall:text-4xl sm:text-5xl">
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
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-white/70 tall:mt-5 tall:text-base sm:text-lg">
                    {st("makerPitch.body", MAKER_PITCH.body)}
                  </p>
                </div>

                {/* The product, shown rather than asserted — the second column on
                    a desktop, the middle of the composition on a phone. */}
                <div className="md:col-start-2 md:row-span-2 md:row-start-1">
                  <ExplainerVideo
                    src={EXPLAINER_SRC}
                    poster={EXPLAINER_POSTER}
                    captionKey="landing.video.caption"
                  />
                </div>

                <div className="md:col-start-1 md:row-start-2">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
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
                  <ul className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] uppercase tracking-[0.16em] text-white/50 tall:mt-6">
                    {SOVEREIGNTY.heroBadges.map((badge, i) => (
                      <li key={badge} className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="text-[var(--brand-accent)]"
                        >
                          ✦
                        </span>
                        {st(`sovereignty.heroBadges.${i}`, badge)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </ReelPanel>
          </ReelPanels>
        </ReelChapter>

        {/* ── 2. The squeeze — the hole every other till has in it ── */}
        <ReelChapter
          id="squeeze"
          label={t("landing.reel.squeeze")}
          className="bg-[var(--brand-surface)]"
        >
          {/* One slide, not two. The argument and the tills were a panel each
              while the argument was a 42-word run-up; now that it is one
              sentence and the tills are a matrix, both fit a phone screen
              together — and a slide carrying an eyebrow, an h2 and one line
              costs a swipe to say what the next slide shows. Two columns from
              md up rebuild the desktop pair out of the same two blocks. */}
          <ReelPanels>
            <ReelPanel>
              <div className="grid content-center gap-5 tall:gap-7 md:grid-cols-[0.95fr_1.05fr] md:items-center md:gap-10">
                <SqueezePlayArgument dense />
                <SqueezePlayTills dense />
              </div>
            </ReelPanel>
          </ReelPanels>
        </ReelChapter>

        {/* ── 3. Free in person — the answer to the squeeze, and its price. Its
             own post rather than the back half of the one above: the two claims
             are different claims, and the rail should say so. ── */}
        <ReelChapter
          id="free-in-person"
          label={t("landing.reel.freeInPerson")}
          className="border-y border-[var(--brand-border)] bg-[var(--brand-surface-2)]"
        >
          <ReelPanels layout="reel:grid-cols-[1.05fr_0.95fr] reel:items-center reel:gap-8">
            <ReelPanel>
              <ZeroCostPosClaim dense />
            </ReelPanel>
            <ReelPanel>
              <ZeroCostPosPrice dense />
            </ReelPanel>
          </ReelPanels>
        </ReelChapter>

        {/* ── 4. How it works — one inventory, photo→listing, and the till the
             hero used to show ── */}
        <ReelChapter id="product" label={t("landing.reel.how")}>
          {/* The photo→listing panel takes the wider column: its drawing is a
              before/after pair side by side, so at an even third the two
              halves are ~140px each and the generated listing wraps to one
              word a line. */}
          <ReelPanels layout="reel:grid-cols-[0.9fr_1.25fr_0.85fr] reel:gap-8">
            {/* Feature 1 — one inventory, two channels. It carries the post's
                own heading rather than giving it a screen of its own: a slide
                with nothing on it but an eyebrow and an h2 costs a swipe and
                says nothing the next slide doesn't. */}
            <ReelPanel>
              <div>
                <p className="font-hand text-xl leading-none text-[var(--brand-accent)] tall:text-2xl">
                  {t("landing.howEyebrow")}
                </p>
                <h2 className="mt-1 font-serif text-xl text-[var(--brand-text)] tall:text-3xl sm:text-4xl">
                  {t("landing.howHeading")}
                </h2>
                {/* Deliberately a step below the post's h2 rather than beside
                    it in size: two headings of the same weight on one slide read
                    as two competing titles. */}
                <h3 className="mt-3.5 font-serif text-lg text-[var(--brand-text)] tall:mt-5 tall:text-xl">
                  {t("landing.inventoryTitle")}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)] tall:text-[15px]">
                  {t("landing.inventoryBody")}
                </p>
                <div className="mt-3 tall:mt-4">
                  <OneInventoryDiagram />
                </div>
              </div>
            </ReelPanel>

            {/* Feature 2 — photo to listing. "Sell first. Sort it out later."
                came down from chapter seven to sit here: it is a claim about
                what the AI does with a messy stall, and this is the panel that
                shows it doing it. The body shrank to a caption once the four
                languages moved inside the drawing. */}
            <ReelPanel>
              <div>
                <p className="font-hand text-xl leading-none text-[var(--brand-accent)] tall:text-2xl">
                  {t("landing.messyEyebrow")}
                </p>
                <h3 className="mt-1 font-serif text-2xl text-[var(--brand-text)]">
                  {t("landing.messyHeading")}
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

        {/* ── 5. What it costs — a year with the old guard against a month here,
             and the pledge that stands behind it ── */}
        <ReelChapter
          id="costs"
          label={t("landing.reel.whatItCosts")}
          className="bg-[var(--brand-surface)]"
        >
          <ReelPanels layout="reel:grid-cols-[0.95fr_1.05fr] reel:items-center reel:gap-8">
            <ReelPanel>
              {/* Cost strip (Direction A) — the mahogany band, now a panel.
                  It stays three-across on a phone rather than stacking: the
                  stacked version is 700px tall (the rotated arrow alone claims
                  a row the width of the card), and a *comparison* that puts
                  the two numbers a swipe apart isn't one. */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-2xl bg-[var(--brand-ink-deep)] px-4 py-7 text-center sm:gap-4 sm:p-6">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.16em] text-white/45 sm:text-[11px] sm:tracking-[0.2em]">
                    {st("costComparison.themLabel", COST_COMPARISON.themLabel)}
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

            {/* The pledge (Direction B) — the heart of the positioning, beside
                the number it is a promise about. It keeps its reveal: it is not
                the first thing in the post. The five itemised points render on
                /pricing, above the plans — see
                PRICING_PROMISE.restatedByPricingFeeSection. */}
            <ReelPanel>
              <ScrollReveal className="relative rounded-2xl border border-[var(--brand-border)] bg-white p-5 shadow-[0_20px_50px_-34px_rgba(45,38,32,0.4)] sm:p-8">
                {/* The pledge's own label is this post's heading — an h2, not a
                    decorative span: a post whose only words are numbers and a
                    quotation has no heading at all, and a section landmark
                    without one is a landmark nobody can navigate to. */}
                <h2 className="absolute -top-3 left-5 bg-white px-2.5 font-hand text-xl text-[var(--brand-accent)] sm:left-8">
                  {t("landing.pledgeEyebrow")}
                </h2>
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
          </ReelPanels>
        </ReelChapter>

        {/* ── 6. Trust — made in Switzerland, and the ledger that shows which
             parts aren't yet. Every row stays on the homepage rather than
             behind the link. ── */}
        <ReelChapter
          id="trust"
          label={t("landing.reel.trust")}
          className="border-y border-[var(--brand-border)] bg-[var(--brand-surface-2)]"
        >
          {/* The ledger takes the wider column: its nine rows only lay out one
              line each once they have room for the piece and its state side by
              side. See SwissMadeLedger's `dense`. */}
          <ReelPanels layout="reel:grid-cols-[0.72fr_1.28fr] reel:items-center reel:gap-6">
            <ReelPanel>
              <SwissMadeIntro dense />
            </ReelPanel>
            {/* Nine rows are a screen and a quarter on a phone, so they read
                over two slides; in reel mode the two sit back to back in the
                same column and look like the one list they are. */}
            <div className="contents reel:grid reel:content-center reel:gap-4">
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

        {/* ── 7. What's coming — the messy-stall claim and the thesis it leads
             to, the chart under it, and a market day as it actually goes. The
             proof band and the found→asked→bought mechanics moved to
             /why-zolto; the chart slide links them. ── */}
        <ReelChapter
          id="whats-coming"
          label={t("landing.reel.whatsComing")}
          className="bg-white"
        >
          <ReelPanels layout="reel:grid-cols-[1.05fr_0.85fr_1.1fr] reel:items-center reel:gap-7">
            <>
              {/* The thesis, on its own. "Sell first. Sort it out later." used
                  to sit above it, and it is a *product* claim — the AI taking
                  a messy stall and drafting the listings — which chapter four
                  already makes beside a drawing of it happening. The heading
                  moved there and the paragraph went; this post argues one
                  thing now instead of two. */}
              <ReelPanel>
                <AiNativeThesis dense />
              </ReelPanel>
              <ReelPanel>
                <div className="grid gap-4">
                  <DiscoveryShiftChart dense />
                  <Link
                    href="/why-zolto"
                    className="mx-auto text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)] reel:mx-0"
                  >
                    {t("landing.reel.whyZoltoLink")}
                  </Link>
                </div>
              </ReelPanel>
            </>
            <ReelPanel>
              <DayInTheLife />
            </ReelPanel>
          </ReelPanels>
        </ReelChapter>

        {/* ── 8. Start free — the closing CTA and the one thing on this page a
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
