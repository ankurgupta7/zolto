import { Link } from "wouter";
import { ZERO_COST_POS, FREE_PLAN, formatPrice } from "@shared/platform";
import { SketchUnderline } from "@/components/SketchAccents";
import { ScrollReveal } from "./ScrollReveal";
import { useMarketingT } from "../lib/marketingI18n";

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
 *
 * Two halves, for the same reason SqueezePlay has two: the homepage reel snaps
 * one screen at a time, and the claim and the price are a screen each on a
 * phone. In `dense` each half carries its own mahogany, so the statement keeps
 * its ground on a light chapter.
 */

interface DenseProps {
  /** The homepage-reel rendering — see the note on SqueezePlay's `dense`. */
  dense?: boolean;
}

/** What the free plan is, in words. */
export function ZeroCostPosClaim({ dense = false }: DenseProps = {}) {
  const { st } = useMarketingT();

  const content = (
    <>
      <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
        {st("zeroCostPos.eyebrow", ZERO_COST_POS.eyebrow)}
      </p>
      <h2 className="mt-3 font-serif text-3xl leading-[1.15] text-white sm:text-4xl">
        {st("zeroCostPos.headline", ZERO_COST_POS.headline)}{" "}
        {/* Only the punchline is underlined, so the stroke stays tight
            to the words however the heading wraps. */}
        <span className="relative inline-block">
          {st("zeroCostPos.headlineEmphasis", ZERO_COST_POS.headlineEmphasis)}
          <span
            aria-hidden
            className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]"
          >
            <SketchUnderline />
          </span>
        </span>
      </h2>
      <p
        className={`max-w-lg leading-relaxed text-white/70 ${
          dense ? "mt-5 text-[17px]" : "mt-8"
        }`}
      >
        {dense
          ? st("zeroCostPos.bodyShort", ZERO_COST_POS.bodyShort)
          : st("zeroCostPos.body", ZERO_COST_POS.body)}
      </p>
      {/* The catch's second sentence — that your processor still charges its
          own rate — is the longest block the homepage carried, and /pricing
          already makes it at length. On the reel it becomes the link; off the
          reel there is room to say it outright. */}
      {dense ? (
        <p className="mt-5">
          <Link
            href="/pricing"
            className="text-sm text-[var(--brand-accent-light)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-white"
          >
            {st(
              "zeroCostPos.processorNoteLink",
              ZERO_COST_POS.processorNoteLink,
            )}{" "}
            →
          </Link>
        </p>
      ) : (
        <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/55">
          {st("zeroCostPos.catch", ZERO_COST_POS.catch)}
        </p>
      )}
    </>
  );

  if (dense) {
    return (
      <div
        data-testid="zero-cost-pos"
        className="rounded-2xl bg-[var(--brand-ink)] p-6"
      >
        {content}
      </div>
    );
  }
  return <div>{content}</div>;
}

/**
 * The free plan drawn as the statement it produces.
 *
 * Every line is what the plan includes, priced; the total is the same CHF 0
 * the band used to assert, arrived at rather than claimed. A reader who
 * doubts "free forever" is looking for the line that isn't zero — so the
 * strongest form of the argument is to show them all of them.
 *
 * The zeros render through `formatPrice` and carry `lining-nums`: Cormorant
 * defaults to oldstyle figures, which sets a 0 at x-height and turns a
 * column of prices into a column of the letter o.
 */
function FreePlanReceipt() {
  const { t, st } = useMarketingT();
  const r = ZERO_COST_POS.receipt;
  const zero = formatPrice(FREE_PLAN.priceChf);

  return (
    <div data-testid="free-plan-receipt">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/15 pb-2">
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
          {st("zeroCostPos.receipt.title", r.title)}
        </p>
        <p className="text-[11px] uppercase tracking-[0.16em] text-white/35">
          {t("zeroCostPos.planInPerson", {
            plan: st("plans.free.name", FREE_PLAN.name),
          })}
        </p>
      </div>

      <ul className="mt-3 grid gap-2">
        {r.lines.map((line, i) => (
          <li
            key={line}
            className="flex items-baseline justify-between gap-4 text-sm text-white/75"
          >
            <span>{st(`zeroCostPos.receipt.lines.${i}`, line)}</span>
            {/* A dotted leader, the way a printed statement runs the eye from
                the item to the figure. */}
            <span
              aria-hidden
              className="mx-1 h-px min-w-4 flex-1 self-center border-b border-dotted border-white/20"
            />
            <span className="font-serif text-white/70 lining-nums tabular-nums">
              {zero}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-white/25 pt-3">
        <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">
          {st("zeroCostPos.receipt.total", r.total)}
        </p>
        <p
          data-testid="zero-cost-price"
          className="font-serif text-5xl font-bold text-[var(--brand-accent-light)] lining-nums tabular-nums"
        >
          {zero}
          <span className="ml-1.5 align-baseline text-base font-normal text-white/50">
            {t("zeroCostPos.perMonth")}
          </span>
        </p>
      </div>
      <p className="mt-1 text-right font-hand text-xl leading-none text-[var(--brand-accent)]">
        {st("zeroCostPos.receipt.note", r.note)}
      </p>
    </div>
  );
}

/** What it costs, stated plainly, with what it buys underneath. */
export function ZeroCostPosPrice({ dense = false }: DenseProps = {}) {
  const { t, st } = useMarketingT();

  if (dense) {
    return (
      <div className="rounded-2xl bg-[var(--brand-ink)] p-6">
        <FreePlanReceipt />
        <Link
          href="/signup"
          className="mt-5 inline-block rounded-md bg-[var(--brand-accent)] px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
        >
          {t("zeroCostPos.startFree")}
        </Link>
      </div>
    );
  }

  const card = (
    <div className="rounded-2xl border border-white/15 bg-white/[0.04] p-7">
      <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">
        {t("zeroCostPos.planInPerson", {
          plan: st("plans.free.name", FREE_PLAN.name),
        })}
      </p>
      {/* lining-nums is load-bearing, not decoration: Cormorant defaults
          to oldstyle figures, which renders this "0" at x-height so the
          price reads "CHF o". Money has to be unmistakable. */}
      <p
        data-testid="zero-cost-price"
        className="mt-2 font-serif text-6xl font-bold text-[var(--brand-accent-light)] lining-nums tabular-nums"
      >
        {formatPrice(FREE_PLAN.priceChf)}
        <span className="ml-1.5 align-baseline text-lg font-normal text-white/50">
          {t("zeroCostPos.perMonth")}
        </span>
      </p>
      <ul className="mt-6 grid gap-3">
        {ZERO_COST_POS.includes.map((item, i) => (
          <li
            key={item}
            className="flex gap-3 text-sm leading-relaxed text-white/75"
          >
            <span aria-hidden className="text-[var(--brand-accent)]">
              ✓
            </span>
            {st(`zeroCostPos.includes.${i}`, item)}
          </li>
        ))}
      </ul>
      <Link
        href="/signup"
        className="mt-7 inline-block rounded-md bg-[var(--brand-accent)] px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
      >
        {t("zeroCostPos.startFree")}
      </Link>
    </div>
  );

  return card;
}

/** The whole band, as it renders anywhere that is not the homepage reel. */
export function ZeroCostPos() {
  return (
    <section className="bg-[var(--brand-ink)]" data-testid="zero-cost-pos">
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        <ScrollReveal className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-center">
          <ZeroCostPosClaim />
          <ZeroCostPosPrice />
        </ScrollReveal>
      </div>
    </section>
  );
}
