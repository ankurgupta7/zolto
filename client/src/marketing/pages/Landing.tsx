import { Link } from "wouter";
import { SketchUnderline } from "@/components/SketchAccents";
import ParticleField from "@/components/ParticleField";
import {
  MAKER_PITCH,
  PRICING_PROMISE,
  COST_COMPARISON,
  INCUMBENT_COMPARISON,
  SOVEREIGNTY,
  formatPrice,
} from "@shared/platform";
import {
  OneInventoryDiagram,
  PhotoToListing,
} from "../components/MarketingIllustrations";
import {
  AiNativeBand,
  AgentProofBand,
  HowAnAiBuys,
} from "../components/AgentPitch";
import { HeroTill } from "../components/HeroTill";
import { Container } from "../components/Container";
import { DayInTheLife } from "../components/DayInTheLife";
import { ScrollReveal } from "../components/ScrollReveal";
import { DiaryTeaser } from "../components/DiaryTeaser";
import { ZeroCostPos } from "../components/ZeroCostPos";
import { SqueezePlay } from "../components/SqueezePlay";
import { SwissMade } from "../components/SwissMade";
import { useMarketingT } from "../lib/marketingI18n";

export default function Landing() {
  const { t, st, numberLocale } = useMarketingT();

  return (
    <>
      {/* Ambient gold-dust layer — glows over the mahogany hero/CTA bands,
          fades out over the light sections via screen blend. */}
      <ParticleField />

      {/* ── Hero — what Zolto is, in the merchant's nouns (see MAKER_PITCH) ── */}
      <section className="bg-[var(--brand-ink)]">
        <Container className="grid items-center gap-10 pb-20 pt-20 md:grid-cols-2">
          <div>
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              {st("makerPitch.eyebrow", MAKER_PITCH.eyebrow)}
            </p>
            {/* max-w-2xl, not xl: at xl the headline broke after "online" and
                left "shop" alone on a line of its own. */}
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
            <div className="mt-10 flex flex-wrap items-center gap-4">
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
                the ledger band further down does the explaining. */}
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

          {/* The product, drawn rather than asserted */}
          <div className="hidden md:block">
            <HeroTill />
          </div>
        </Container>
      </section>

      {/* ── The in-person argument, straight after the hero: the same phone the
           hero drew, and the one thing only this till does ── */}
      <SqueezePlay />

      {/* ── The differentiator: a real POS + catalogue, at CHF 0/month ── */}
      <ZeroCostPos />

      {/* ── Cost strip (Direction A) — a year with the old guard vs a month here ── */}
      <section className="bg-[var(--brand-ink-deep)]">
        <Container
          width="4xl"
          className="grid items-center gap-6 py-12 text-center sm:grid-cols-[1fr_auto_1fr]"
        >
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              {st("costComparison.themLabel", COST_COMPARISON.themLabel)}
            </p>
            <p className="mt-2 font-serif text-5xl font-semibold text-white/55 lining-nums tabular-nums line-through decoration-[var(--brand-accent)]/60">
              CHF {COST_COMPARISON.themPerYearChf.toLocaleString(numberLocale)}
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
            <p className="mt-2 font-serif text-6xl font-bold text-[var(--brand-accent-light)] lining-nums tabular-nums">
              {formatPrice(COST_COMPARISON.usPerMonthChf)}
            </p>
            <p className="mt-2 text-xs text-white/40">
              {st("costComparison.usNote", COST_COMPARISON.usNote)}
            </p>
          </div>
        </Container>
      </section>

      {/* ── The pledge (Direction B) — the heart of the positioning ── */}
      <section className="border-b border-[var(--brand-border)] bg-[var(--brand-surface-2)]">
        <Container width="3xl" className="py-20">
          <ScrollReveal className="relative rounded-2xl border border-[var(--brand-border)] bg-white p-9 shadow-[0_20px_50px_-34px_rgba(45,38,32,0.4)] md:p-11">
            <span className="absolute -top-3 left-9 bg-white px-2.5 font-hand text-xl text-[var(--brand-accent)]">
              {t("landing.pledgeEyebrow")}
            </span>
            <p className="font-serif text-2xl leading-snug text-[var(--brand-text)] md:text-[26px]">
              &ldquo;
              {st("pricingPromise.pledge", PRICING_PROMISE.pledge)}&rdquo;
            </p>
            <ul className="mt-7 grid gap-3">
              {PRICING_PROMISE.points.map((point, i) => (
                <li
                  key={point}
                  className="flex gap-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]"
                >
                  <span aria-hidden className="text-[var(--brand-accent)]">
                    —
                  </span>
                  {st(`pricingPromise.points.${i}`, point)}
                </li>
              ))}
            </ul>
            <p className="mt-8 font-hand text-2xl text-[var(--brand-text)]">
              {t("landing.pledgeSignature")}
            </p>
          </ScrollReveal>
        </Container>
      </section>

      {/* ── Made in Switzerland — the ledger, high on the page, not a badge ── */}
      <SwissMade />

      {/* ── Why not the old guard (Direction A) — the comparison table ── */}
      <section className="bg-[var(--brand-surface)]">
        <Container width="4xl" className="py-20">
          <div className="mb-10 text-center">
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              {t("landing.comparisonEyebrow")}
            </p>
            <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
              {t("landing.comparisonHeading")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[var(--brand-muted-2)]">
              {t("landing.comparisonBody")}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr>
                  <th className="border-b border-[var(--brand-border)] px-4 py-3" />
                  <th className="border-b border-[var(--brand-border)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand-muted)]">
                    {t("landing.colOldGuard")}
                  </th>
                  <th className="border-b border-[var(--brand-border)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand-accent)]">
                    Zolto
                  </th>
                </tr>
              </thead>
              <tbody>
                {INCUMBENT_COMPARISON.map((row) => (
                  <tr key={row.feature}>
                    <td className="border-b border-[var(--brand-border)] px-4 py-3.5 font-medium text-[var(--brand-text)]">
                      {st(`comparison.${row.feature}.feature`, row.feature)}
                    </td>
                    <td className="border-b border-[var(--brand-border)] px-4 py-3.5 text-[var(--brand-muted-2)]">
                      {st(`comparison.${row.feature}.them`, row.them)}
                    </td>
                    <td className="border-b border-[var(--brand-border)] bg-[var(--brand-accent)]/[0.07] px-4 py-3.5 font-medium text-[var(--brand-text)]">
                      <span aria-hidden className="text-[var(--brand-accent)]">
                        ✓{" "}
                      </span>
                      {st(`comparison.${row.feature}.us`, row.us)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Container>
      </section>

      {/* ── How it works — one inventory + photo→listing (kept illustrations) ── */}
      <Container as="section" id="product" className="py-20">
        <div className="mb-14 text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            {t("landing.howEyebrow")}
          </p>
          <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
            {t("landing.howHeading")}
          </h2>
        </div>

        {/* Feature 1 — one inventory, two channels */}
        <div className="grid items-center gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div>
            <h3 className="font-serif text-2xl text-[var(--brand-text)]">
              {t("landing.inventoryTitle")}
            </h3>
            <p className="mt-3 max-w-sm leading-relaxed text-[var(--brand-muted-2)]">
              {t("landing.inventoryBody")}
            </p>
          </div>
          <OneInventoryDiagram />
        </div>

        {/* Feature 2 — photo to listing */}
        <div className="mt-20 grid items-center gap-10 md:grid-cols-[0.8fr_1.2fr]">
          <div className="md:order-2">
            <h3 className="font-serif text-2xl text-[var(--brand-text)]">
              {t("landing.photoTitle")}
            </h3>
            <p className="mt-3 max-w-sm leading-relaxed text-[var(--brand-muted-2)]">
              {t("landing.photoBody")}
            </p>
          </div>
          <div className="md:order-1">
            <PhotoToListing />
          </div>
        </div>
      </Container>

      {/* ── AI-native selling loop (Direction C) — the flagship pillar ── */}
      <section className="bg-white">
        <Container className="py-20">
          <div className="mb-12 text-center">
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              {t("landing.messyEyebrow")}
            </p>
            <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
              {t("landing.messyHeading")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[var(--brand-muted-2)]">
              {t("landing.messyBody")}
            </p>
          </div>

          <DayInTheLife />

          {/* End-of-day reconciliation email mock */}
          <div className="mx-auto mt-12 max-w-xl overflow-hidden rounded-xl border border-[var(--brand-border)] bg-white shadow-[0_18px_44px_-30px_rgba(45,38,32,0.5)]">
            <div className="border-b border-[var(--brand-border)] px-5 py-3.5 text-[13px] text-[var(--brand-muted)]">
              {t("landing.emailFrom")}{" "}
              <span className="text-[var(--brand-text)]">Zolto</span> ·{" "}
              {t("landing.emailSubjectLabel")}{" "}
              <span className="text-[var(--brand-text)]">
                {t("landing.emailSubject")}
              </span>
            </div>
            <div className="px-5 py-5">
              <p className="mb-4 text-[15px] leading-relaxed text-[var(--brand-muted-2)]">
                {t("landing.emailBody")}
              </p>
              {[
                {
                  name: t("landing.emailItem1Name"),
                  meta: t("landing.emailItem1Meta"),
                },
                {
                  name: t("landing.emailItem2Name"),
                  meta: t("landing.emailItem2Meta"),
                },
              ].map((g) => (
                <div
                  key={g.name}
                  className="mb-2.5 flex items-center gap-3 rounded-lg border border-[var(--brand-border)] px-3.5 py-3"
                >
                  <span
                    aria-hidden
                    className="h-10 w-10 flex-none rounded-md bg-gradient-to-br from-[#d9c9a3] to-[var(--brand-accent)]"
                  />
                  <span className="min-w-0">
                    <span className="block font-serif text-[15px] text-[var(--brand-text)]">
                      {g.name}
                    </span>
                    <span className="text-[13px] text-[var(--brand-muted)]">
                      {g.meta}
                    </span>
                  </span>
                  <span className="ml-auto rounded-md bg-[var(--brand-accent)] px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--brand-ink)]">
                    {t("landing.emailConfirm")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ── And it's ready for what's coming ──
           The AI-native thesis, in full: the band that used to be the hero,
           its proof, and the found → asked → bought mechanics. It sits here
           rather than at the top because it argues for choosing Zolto, which
           only means something once the reader knows what Zolto is — see the
           doc comment on MAKER_PITCH. ── */}
      <AiNativeBand />
      <AgentProofBand />
      <HowAnAiBuys />

      {/* ── Proof you can go and check, before we ask for the signup ── */}
      <DiaryTeaser />

      {/* ── CTA ── */}
      <section className="bg-[var(--brand-ink)]">
        <Container width="4xl" className="py-20 text-center">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            {t("landing.ctaEyebrow")}
          </p>
          <h2 className="mt-3 font-serif text-3xl text-white sm:text-4xl">
            {t("landing.ctaHeading")}
          </h2>
          <p className="mt-4 text-white/70">{t("landing.ctaBody")}</p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            {t("landing.ctaButton")}
          </Link>
        </Container>
      </section>
    </>
  );
}
