import { useId, useState } from "react";
import {
  monthlyCostAt,
  PRO_PLAN,
  PRO_BREAK_EVEN_ONLINE_CHF,
  REVENUE_SHARE,
} from "@shared/platform";

/**
 * FeeCalculator — drag your month, see the bill.
 *
 * The pledge above it makes a claim ("you don't pay us until the internet pays
 * you"); this lets a visitor test that claim themselves instead of trusting the
 * sentence. Every figure comes from `monthlyCostAt`, the same shared function
 * the pricing copy is derived from, so the widget cannot quote a number the
 * platform wouldn't actually charge.
 *
 * Two honesty rules shape the design:
 *  - It models *this* platform's fee only. It makes no claim about what any
 *    competitor would charge for the same month — that comparison depends on
 *    contract, country and volume, and inventing it would be the exact
 *    behaviour the pledge is positioned against.
 *  - It recommends Free whenever Free is cheaper, which is most of the range.
 *    A calculator that always concludes "buy the paid plan" is an ad.
 */

const MAX_SALES_CHF = 6000;
const STEP_CHF = 50;
/** Where the slider starts — a plausible month, comfortably below break-even. */
const DEFAULT_SALES_CHF = 800;

function chf(amount: number): string {
  return `CHF ${amount.toFixed(2)}`;
}

export function FeeCalculator() {
  const [sales, setSales] = useState(DEFAULT_SALES_CHF);
  const sliderId = useId();
  const cost = monthlyCostAt(sales);

  const isFree = cost.cheaper === "free" || cost.cheaper === "tie";
  const nothingOwed = cost.freePlanChf === 0;

  return (
    <div
      data-testid="fee-calculator"
      className="mx-auto max-w-3xl rounded-2xl border border-[var(--brand-border)] bg-white p-8 md:p-10"
    >
      <p className="font-hand text-xl leading-none text-[var(--brand-accent)]">
        do the math yourself
      </p>
      <h2 className="mt-2 font-serif text-2xl text-[var(--brand-text)]">
        What would we actually charge you?
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)]">
        Drag your month. We&rsquo;ll show you the bill — and tell you when
        you&rsquo;d be better off on the cheaper plan, even when that&rsquo;s
        not the one we&rsquo;d rather sell you.
      </p>

      <div className="mt-8">
        <label
          htmlFor={sliderId}
          className="flex flex-wrap items-baseline justify-between gap-2"
        >
          <span className="text-sm font-medium text-[var(--brand-text)]">
            Your online sales this month
          </span>
          <span className="font-serif text-2xl text-[var(--brand-ink)] lining-nums tabular-nums">
            CHF {sales.toLocaleString("en-US")}
            {sales === MAX_SALES_CHF && "+"}
          </span>
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={MAX_SALES_CHF}
          step={STEP_CHF}
          value={sales}
          onChange={(e) => setSales(Number(e.target.value))}
          className="mt-3 w-full accent-[var(--brand-accent)]"
        />
        <p className="mt-2 text-xs text-[var(--brand-muted)]">
          Market-stall sales aren&rsquo;t in this box on purpose — they&rsquo;re
          free on every plan, so they could never change the answer.
        </p>
      </div>

      {/* The verdict. aria-live so a screen-reader user dragging the slider
          hears the outcome, not just the number they set. */}
      <div
        aria-live="polite"
        className="mt-8 grid gap-4 sm:grid-cols-2"
        data-testid="fee-calculator-result"
      >
        <div
          data-testid="fee-free"
          className={`rounded-xl border p-5 ${
            isFree
              ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/[0.07]"
              : "border-[var(--brand-border)]"
          }`}
        >
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--brand-muted)]">
            On Free
          </p>
          <p className="mt-1 font-serif text-3xl text-[var(--brand-ink)] lining-nums tabular-nums">
            {chf(cost.freePlanChf)}
          </p>
          <p className="mt-1 text-xs text-[var(--brand-muted-2)]">
            {REVENUE_SHARE.percentLabel} of online sales · no subscription
          </p>
        </div>
        <div
          data-testid="fee-pro"
          className={`rounded-xl border p-5 ${
            !isFree
              ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/[0.07]"
              : "border-[var(--brand-border)]"
          }`}
        >
          <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--brand-muted)]">
            On {PRO_PLAN.name}
          </p>
          <p className="mt-1 font-serif text-3xl text-[var(--brand-ink)] lining-nums tabular-nums">
            {chf(cost.proPlanChf)}
          </p>
          <p className="mt-1 text-xs text-[var(--brand-muted-2)]">
            flat monthly · 0% on every sale
          </p>
        </div>
      </div>

      <p
        data-testid="fee-calculator-verdict"
        className="mt-6 font-serif text-lg leading-snug text-[var(--brand-text)]"
      >
        {nothingOwed ? (
          <>
            No online sales? Then we don&rsquo;t get paid.{" "}
            <span className="text-[var(--brand-accent)]">CHF 0.00.</span> Sell
            at the stall all month and we&rsquo;ll happily earn nothing.
          </>
        ) : isFree ? (
          <>
            Stay on Free — it&rsquo;s cheaper for you by{" "}
            <span className="text-[var(--brand-accent)]">
              {chf(cost.savingChf)}
            </span>{" "}
            this month. We&rsquo;ll tell you the day that flips, around CHF{" "}
            {PRO_BREAK_EVEN_ONLINE_CHF.toLocaleString("en-US")} online.
          </>
        ) : (
          <>
            Nice month. {PRO_PLAN.name} would save you{" "}
            <span className="text-[var(--brand-accent)]">
              {chf(cost.savingChf)}
            </span>{" "}
            — and your dashboard nudges you the moment that&rsquo;s true, so you
            don&rsquo;t have to keep checking.
          </>
        )}
      </p>
    </div>
  );
}
