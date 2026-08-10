import { Link } from "wouter";
import { Container } from "../components/Container";
import { CostOfAcceptance } from "../components/CostOfAcceptance";
import { FeeCalculator } from "../components/FeeCalculator";
import { PLANS, formatPrice } from "../plans";
import {
  PRICING_PROMISE,
  COST_COMPARISON,
  PRO_BREAK_EVEN_ONLINE_CHF,
  PRO_PLAN,
  REVENUE_SHARE,
  faqsByCategory,
} from "@shared/platform";
import { useMarketingT } from "../lib/marketingI18n";

// Sourced from the shared FAQ set so these answers also reach the FAQPage
// schema, /llms.txt and MCP — they used to live only in this file, which meant
// an AI assistant asking "is there a contract?" had nothing to read.
const FAQ = faqsByCategory("Pricing & billing").filter((f) =>
  [
    "Can I upgrade or downgrade anytime?",
    "Is there a contract?",
    "Do prices include VAT?",
  ].includes(f.q),
);

export default function Pricing() {
  const { t, st, numberLocale } = useMarketingT();
  const percentLabel = REVENUE_SHARE.percentLabel;
  const proName = st("plans.pro.name", PRO_PLAN.name);

  return (
    <Container className="py-20">
      <div className="text-center">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {t("pricing.eyebrow")}
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
          {t("pricing.heading")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[var(--brand-muted-2)]">
          {t("pricing.intro", { percent: percentLabel })}
        </p>
      </div>

      {/* Transparent-pricing pledge — the positioning's heart, above the plans */}
      <div className="mx-auto mt-14 max-w-3xl rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface-2)] p-8 md:p-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="font-serif text-2xl text-[var(--brand-text)]">
              {st("pricingPromise.headline", PRICING_PROMISE.headline)}
            </h2>
            <p className="mt-3 font-serif text-lg italic leading-snug text-[var(--brand-muted-2)] lining-nums">
              &ldquo;
              {st("pricingPromise.pledge", PRICING_PROMISE.pledge)}&rdquo;
            </p>
            {/* Only the pledge points the fee section further down does not
                already make — see PRICING_PROMISE.restatedByPricingFeeSection.
                The original index is carried through the filter because it is
                the translation key. */}
            <ul className="mt-5 grid gap-2.5">
              {PRICING_PROMISE.points
                .map((point, i) => ({ point, i }))
                .filter(
                  ({ i }) =>
                    !(
                      PRICING_PROMISE.restatedByPricingFeeSection as readonly number[]
                    ).includes(i),
                )
                .map(({ point, i }) => (
                  <li
                    key={point}
                    className="flex gap-2.5 text-sm leading-relaxed text-[var(--brand-muted-2)]"
                  >
                    <span aria-hidden className="text-[var(--brand-accent)]">
                      —
                    </span>
                    {st(`pricingPromise.points.${i}`, point)}
                  </li>
                ))}
            </ul>
          </div>
          <div className="shrink-0 rounded-xl border border-[var(--brand-border)] bg-white px-8 py-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--brand-muted)]">
              {t("pricing.oldWay")}
            </p>
            <p className="mt-1 font-serif text-2xl text-[var(--brand-muted-2)] line-through lining-nums tabular-nums">
              CHF {COST_COMPARISON.themPerYearChf.toLocaleString(numberLocale)}
              <span className="text-sm">{t("pricing.perYearShort")}</span>
            </p>
            <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-[var(--brand-accent)]">
              {t("pricing.zoltoPlan", { plan: proName })}
            </p>
            <p className="mt-1 font-serif text-4xl font-bold text-[var(--brand-ink)] lining-nums tabular-nums">
              {formatPrice(COST_COMPARISON.usPerMonthChf)}
              <span className="text-sm font-normal text-[var(--brand-muted)]">
                {t("pricing.perMonthShort")}
              </span>
            </p>
            <p className="mt-2 text-[11px] text-[var(--brand-muted)]">
              {st("costComparison.multiplier", COST_COMPARISON.multiplier)}
            </p>
          </div>
        </div>
      </div>

      {/* What a sale actually costs, on every option we can source — including
          the ones that beat us. The plan cards above quote Zolto's fee, which
          is not the cost of acceptance; this is the correction, and it belongs
          on the pricing page rather than only on /compare, because this is the
          page a reader arrives at asking "what will this cost me". */}
      <div className="mx-auto mt-16 max-w-3xl">
        <CostOfAcceptance channel="in-person" />
      </div>
      {/* The second table names its channel in its own heading and drops the
          framing paragraphs: the intro and the monthly-fee footnote are about
          the comparison, not about one channel, and printing them again under
          an identical heading read as the page repeating itself. */}
      <div className="mx-auto mt-14 max-w-3xl">
        <CostOfAcceptance channel="online" showFraming={false} />
      </div>

      {/* Plan cards — two boxes only */}
      <div className="mx-auto mt-14 grid max-w-3xl gap-6 md:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-xl border bg-white p-6 ${
              plan.highlight
                ? "border-[var(--brand-accent)] ring-1 ring-[var(--brand-accent)]"
                : "border-[var(--brand-border)]"
            }`}
          >
            {plan.highlight && (
              <span className="mb-3 inline-block w-fit rounded-full bg-[var(--brand-accent)]/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.1em] text-[var(--brand-ink)]">
                {t("pricing.mostPopular")}
              </span>
            )}
            <h2 className="font-serif text-xl text-[var(--brand-text)]">
              {st(`plans.${plan.id}.name`, plan.name)}
            </h2>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular-nums text-[var(--brand-ink)]">
                {formatPrice(plan.priceChf)}
              </span>
              <span className="text-sm text-[var(--brand-muted)]">
                {t("pricing.perMonth")}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--brand-muted-2)]">
              {st(`plans.${plan.id}.blurb`, plan.blurb)}
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-[var(--brand-muted-2)]">
              {plan.features.map((f, i) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-[var(--brand-accent)]">
                    ✓
                  </span>
                  {st(`plans.${plan.id}.features.${i}`, f)}
                </li>
              ))}
            </ul>
            <Link
              href={`/signup?plan=${plan.id}`}
              className={`mt-8 rounded-md px-4 py-2.5 text-center text-xs font-medium uppercase tracking-[0.12em] transition-colors ${
                plan.highlight
                  ? "bg-[var(--brand-accent)] text-[var(--brand-ink)] hover:bg-[var(--brand-accent-light)]"
                  : "border border-[var(--brand-ink)]/25 text-[var(--brand-ink)] hover:bg-[var(--brand-ink)] hover:text-white"
              }`}
            >
              {st(`plans.${plan.id}.cta`, plan.cta)}
            </Link>
          </div>
        ))}
      </div>

      {/*
        The fee, explained in the open — the one number that pays for the
        Free plan. Rendered from REVENUE_SHARE so page copy can't drift from
        what checkout actually charges.
      */}
      <div className="mx-auto mt-12 max-w-3xl rounded-2xl border border-[var(--brand-border)] bg-white p-8 md:p-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="font-hand text-xl leading-none text-[var(--brand-accent)]">
              {t("pricing.feeEyebrow")}
            </p>
            <h2 className="mt-2 font-serif text-2xl text-[var(--brand-text)]">
              {t("pricing.feeHeading", {
                percent: percentLabel,
                appliesTo: st(
                  "revenueShare.appliesTo",
                  REVENUE_SHARE.appliesTo,
                ),
              })}
            </h2>
          </div>
          <p className="font-serif text-3xl text-[var(--brand-ink)] lining-nums tabular-nums">
            {percentLabel}
            <span className="text-sm text-[var(--brand-muted)]">
              {" "}
              {t("pricing.onlineOnly")}
            </span>
          </p>
        </div>
        <ul className="mt-5 grid gap-2.5">
          {[
            t("pricing.feePoint1"),
            t("pricing.feePoint2", { percent: percentLabel }),
            t("pricing.feePoint3", {
              plan: proName,
              price: PRO_PLAN.priceChf,
              breakEven: PRO_BREAK_EVEN_ONLINE_CHF.toLocaleString(numberLocale),
            }),
            t("pricing.feePoint4"),
          ].map((point) => (
            <li
              key={point}
              className="flex gap-2.5 text-sm leading-relaxed text-[var(--brand-muted-2)]"
            >
              <span aria-hidden className="text-[var(--brand-accent)]">
                —
              </span>
              {point}
            </li>
          ))}
        </ul>
      </div>

      {/* Let the visitor check the fee claim against their own numbers. */}
      <div className="mt-12">
        <FeeCalculator />
      </div>

      {/*
        Social proof: the pricing-page-copy.md includes a named Kalakosh/Sheena Arora
        testimonial. Nothing is rendered here yet — using a real person's name and
        story in marketing requires a signed content/publicity release (business-plan
        §5.1, phase1/legal/content-release-form.md).

        An anonymized stand-in used to sit here, captioned "(testimonial pending
        release)". That caption was visible to real visitors, which reads as an
        unfinished page and undercuts the honesty the pledge above is selling — a
        quote nobody vouches for is worth less than no quote. Drop the real
        blockquote in once the release is signed.
      */}

      {/* FAQ */}
      <div className="mx-auto mt-20 max-w-2xl">
        <h2 className="text-center font-serif text-2xl text-[var(--brand-text)]">
          {t("pricing.questions")}
        </h2>
        <dl className="mt-8 space-y-6">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="rounded-xl border border-[var(--brand-border)] bg-white p-6"
            >
              <dt className="font-medium text-[var(--brand-text)]">
                {st(`faqs.${item.q}.q`, item.q)}
              </dt>
              <dd className="mt-2 text-sm text-[var(--brand-muted-2)]">
                {st(`faqs.${item.q}.a`, item.a)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Container>
  );
}
