import { Link } from "wouter";
import { PLANS, formatPrice } from "../plans";

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
          Start free. Upgrade when you're ready. No hidden fees, no surprises.
        </p>
      </div>

      {/* Plan cards */}
      <div className="mt-14 grid gap-6 lg:grid-cols-4">
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
                {formatPrice(plan.priceEur)}
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
              href={
                plan.id === "atelier"
                  ? "/signup?plan=atelier"
                  : `/signup?plan=${plan.id}`
              }
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
