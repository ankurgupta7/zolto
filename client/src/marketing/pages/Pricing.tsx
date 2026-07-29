import { Link } from "wouter";
import { PLANS, formatPrice } from "../plans";
import {
  PRICING_PROMISE,
  COST_COMPARISON,
  PRO_BREAK_EVEN_ONLINE_CHF,
  PRO_PLAN,
  REVENUE_SHARE,
} from "@shared/platform";

const FAQ = [
  {
    q: "Can I upgrade or downgrade anytime?",
    a: "Yes. Changes take effect at your next billing cycle.",
  },
  {
    q: "Is there a contract?",
    a: "No. All paid plans are month-to-month. Cancel anytime.",
  },
  {
    q: "Do prices include VAT?",
    a: "Taxes are shown at checkout based on your location. See our terms for details.",
  },
];

export default function Pricing() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <div className="text-center">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          fair &amp; simple
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
          Simple pricing for makers.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[var(--brand-muted-2)]">
          Selling in person is free, forever. We only earn on the online and
          AI-agent sales we bring you — {REVENUE_SHARE.percentLabel} on Free, or
          a flat Pro plan that removes it.
        </p>
      </div>

      {/* Transparent-pricing pledge — the positioning's heart, above the plans */}
      <div className="mx-auto mt-14 max-w-3xl rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface-2)] p-8 md:p-10">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="font-serif text-2xl text-[var(--brand-text)]">
              {PRICING_PROMISE.headline}
            </h2>
            <p className="mt-3 font-serif text-lg italic leading-snug text-[var(--brand-muted-2)]">
              &ldquo;{PRICING_PROMISE.pledge}&rdquo;
            </p>
            <ul className="mt-5 grid gap-2.5">
              {PRICING_PROMISE.points.map((point) => (
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
          <div className="shrink-0 rounded-xl border border-[var(--brand-border)] bg-white px-8 py-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--brand-muted)]">
              The old way
            </p>
            <p className="mt-1 font-serif text-2xl text-[var(--brand-muted-2)] line-through tabular-nums">
              CHF {COST_COMPARISON.themPerYearChf.toLocaleString("en-US")}
              <span className="text-sm">/yr</span>
            </p>
            <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-[var(--brand-accent)]">
              Zolto {PRO_PLAN.name}
            </p>
            <p className="mt-1 font-serif text-4xl font-bold text-[var(--brand-ink)] tabular-nums">
              {formatPrice(COST_COMPARISON.usPerMonthChf)}
              <span className="text-sm font-normal text-[var(--brand-muted)]">
                /mo
              </span>
            </p>
            <p className="mt-2 text-[11px] text-[var(--brand-muted)]">
              {COST_COMPARISON.multiplier}
            </p>
          </div>
        </div>
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
                Most popular
              </span>
            )}
            <h2 className="font-serif text-xl text-[var(--brand-text)]">
              {plan.name}
            </h2>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular-nums text-[var(--brand-ink)]">
                {formatPrice(plan.priceChf)}
              </span>
              <span className="text-sm text-[var(--brand-muted)]">/ month</span>
            </div>
            <p className="mt-2 text-sm text-[var(--brand-muted-2)]">
              {plan.blurb}
            </p>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-[var(--brand-muted-2)]">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-[var(--brand-accent)]">
                    ✓
                  </span>
                  {f}
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
              {plan.cta}
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
              the only fee we charge
            </p>
            <h2 className="mt-2 font-serif text-2xl text-[var(--brand-text)]">
              {REVENUE_SHARE.percentLabel} on {REVENUE_SHARE.appliesTo} —
              nothing in person
            </h2>
          </div>
          <p className="font-serif text-3xl text-[var(--brand-ink)] tabular-nums">
            {REVENUE_SHARE.percentLabel}
            <span className="text-sm text-[var(--brand-muted)]">
              {" "}
              online only
            </span>
          </p>
        </div>
        <ul className="mt-5 grid gap-2.5">
          {[
            "At the market stall, Zolto adds nothing — take TWINT QR and Tap to Pay all season for CHF 0.",
            `Online and AI-agent orders on the Free plan carry a ${REVENUE_SHARE.percentLabel} platform fee, taken automatically inside the Stripe payment — no separate bill, and a month with no online sales costs CHF 0.`,
            `${PRO_PLAN.name} (CHF ${PRO_PLAN.priceChf}/month) removes the fee entirely. Past about CHF ${PRO_BREAK_EVEN_ONLINE_CHF.toLocaleString("en-US")}/month online it's the cheaper option — your dashboard will tell you when.`,
            "AI is never the meter: descriptions, translations and chat aren't counted, and Pro's AI is unmetered. Plans scale on products, photos and storage.",
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

      {/*
        Social proof: the pricing-page-copy.md includes a named Kalakosh/Sheena Arora
        testimonial. It is intentionally NOT shipped here yet — using a real person's
        name and story in marketing requires a signed content/publicity release
        (business-plan §5.1, phase1/legal/content-release-form.md). Swap in the real
        quote once that's signed.
      */}
      <blockquote className="mx-auto mt-20 max-w-2xl rounded-xl border border-[var(--brand-border)] bg-white p-8 text-center">
        <p className="font-serif text-xl italic text-[var(--brand-text)]">
          “I went from selling only at markets to my first online order in a few
          days — without learning a new platform or hiring anyone.”
        </p>
        <footer className="mt-4 text-sm text-[var(--brand-muted)]">
          — Pilot maker, Zurich{" "}
          <span className="text-[var(--brand-muted)]/70">
            (testimonial pending release)
          </span>
        </footer>
      </blockquote>

      {/* FAQ */}
      <div className="mx-auto mt-20 max-w-2xl">
        <h2 className="text-center font-serif text-2xl text-[var(--brand-text)]">
          Questions
        </h2>
        <dl className="mt-8 space-y-6">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="rounded-xl border border-[var(--brand-border)] bg-white p-6"
            >
              <dt className="font-medium text-[var(--brand-text)]">{item.q}</dt>
              <dd className="mt-2 text-sm text-[var(--brand-muted-2)]">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
