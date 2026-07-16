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
        <h1 className="text-4xl font-semibold tracking-tight text-white">
          Simple pricing for makers.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-300">
          Start free. Upgrade when you're ready. No hidden fees, no surprises.
        </p>
      </div>

      {/* Plan cards */}
      <div className="mt-14 grid gap-6 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`flex flex-col rounded-2xl border p-6 ${
              plan.highlight
                ? "border-violet-500 bg-slate-900 ring-1 ring-violet-500"
                : "border-slate-800 bg-slate-900"
            }`}
          >
            {plan.highlight && (
              <span className="mb-3 inline-block w-fit rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-300">
                Most popular
              </span>
            )}
            <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-white">
                {formatPrice(plan.priceEur)}
              </span>
              <span className="text-sm text-slate-400">/ month</span>
            </div>
            <p className="mt-2 text-sm text-slate-400">{plan.blurb}</p>
            <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-300">
              {plan.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span aria-hidden className="text-violet-400">
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
              className={`mt-8 rounded-lg px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                plan.highlight
                  ? "bg-violet-500 text-white hover:bg-violet-400"
                  : "border border-slate-700 text-slate-200 hover:border-slate-500 hover:text-white"
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
      <blockquote className="mx-auto mt-20 max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-lg text-slate-200">
          "I went from selling only at markets to my first online order in a few
          days — without learning a new platform or hiring anyone."
        </p>
        <footer className="mt-4 text-sm text-slate-400">
          — Pilot maker, Zurich{" "}
          <span className="text-slate-600">(testimonial pending release)</span>
        </footer>
      </blockquote>

      {/* FAQ */}
      <div className="mx-auto mt-20 max-w-2xl">
        <h2 className="text-center text-2xl font-semibold text-white">
          Questions
        </h2>
        <dl className="mt-8 space-y-6">
          {FAQ.map((item) => (
            <div
              key={item.q}
              className="rounded-xl border border-slate-800 bg-slate-900 p-6"
            >
              <dt className="font-medium text-white">{item.q}</dt>
              <dd className="mt-2 text-sm text-slate-300">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
