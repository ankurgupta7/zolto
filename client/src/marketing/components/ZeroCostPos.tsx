import { Link } from "wouter";
import { ZERO_COST_POS, FREE_PLAN, formatPrice } from "@shared/platform";
import { SketchUnderline } from "@/components/SketchAccents";
import { ScrollReveal } from "./ScrollReveal";

/**
 * ZeroCostPos — the differentiator, given the loudest band on the page.
 *
 * Sits on the mahogany so it reads as a statement rather than another feature
 * card: a full point-of-sale, carrying the real catalogue (photo, name, price,
 * stock), for CHF 0/month.
 *
 * Every line is sourced from FREE_PLAN via ZERO_COST_POS, and the price is
 * rendered from the plan rather than typed in, so the boast can't drift past
 * what the plan actually includes. The section names no competitor and makes
 * no claim about anyone else's pricing — it's specific about what Zolto ships
 * and lets the comparison table handle the contrast.
 */
export function ZeroCostPos() {
  return (
    <section className="bg-[var(--brand-ink)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        <ScrollReveal className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-center">
          <div>
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              {ZERO_COST_POS.eyebrow}
            </p>
            <h2 className="mt-3 font-serif text-3xl leading-[1.15] text-white sm:text-4xl">
              <span className="relative inline-block">
                {ZERO_COST_POS.headline}
                <span
                  aria-hidden
                  className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]"
                >
                  <SketchUnderline />
                </span>
              </span>
            </h2>
            <p className="mt-8 max-w-lg leading-relaxed text-white/70">
              {ZERO_COST_POS.body}
            </p>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-white/55">
              {ZERO_COST_POS.catch}
            </p>
          </div>

          {/* The price, stated plainly, with what it buys underneath. */}
          <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              {FREE_PLAN.name} plan, in person
            </p>
            <p
              data-testid="zero-cost-price"
              className="mt-2 font-serif text-6xl font-bold text-[var(--brand-accent-light)] tabular-nums"
            >
              {formatPrice(FREE_PLAN.priceChf)}
              <span className="text-lg font-normal text-white/50">/mo</span>
            </p>
            <ul className="mt-6 grid gap-3">
              {ZERO_COST_POS.includes.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm leading-relaxed text-white/75"
                >
                  <span aria-hidden className="text-[var(--brand-accent)]">
                    ✓
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="mt-7 inline-block rounded-md bg-[var(--brand-accent)] px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
            >
              Start free →
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
