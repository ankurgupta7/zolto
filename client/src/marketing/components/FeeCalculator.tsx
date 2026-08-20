import { useId, useState } from "react";
import { Trans } from "react-i18next";
import {
  monthlyCostAt,
  PRO_PLAN,
  PRO_BREAK_EVEN_ONLINE_CHF,
  REVENUE_SHARE,
} from "@shared/platform";
import { BASKET_EXAMPLE_CHF, monthlyStack } from "@shared/costOfAcceptance";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * FeeCalculator — drag your month, see where the money goes.
 *
 * The pledge above it makes a claim ("you don't pay us until the internet pays
 * you"); this lets a visitor test that claim themselves instead of trusting the
 * sentence. Every figure comes from the same shared modules the pricing copy is
 * derived from, so the widget cannot quote a number the platform wouldn't
 * actually charge.
 *
 * **This used to model Gwinn's fee and nothing else**, and its own doc comment
 * defended that as an honesty rule: it "makes no claim about what any competitor
 * would charge". That was the wrong boundary. Nobody asked what Gwinn invoices;
 * they asked what they keep — and answering "CHF 0.00" while Stripe quietly took
 * three times our cut was the most misleading thing on the pricing page. The
 * boundary that actually matters is between *our* fee and *their* fee, and the
 * fix is to show both, labelled, rather than to show one.
 *
 * Two honesty rules survive from the original design:
 *  - It still makes no claim about a competitor's rate. Stripe's numbers are
 *    here because Stripe is the rail Gwinn runs on, not as a comparison; the
 *    comparison lives on /compare where it can carry its sources.
 *  - It still recommends Free whenever Free is cheaper, which is most of the
 *    range. A calculator that always concludes "buy the paid plan" is an ad.
 */

const MAX_SALES_CHF = 6000;
const STEP_CHF = 50;
/** Where the slider starts — a plausible month, comfortably below break-even. */
const DEFAULT_SALES_CHF = 800;

/** Basket sizes a maker can pick between, rather than one we choose for them. */
const BASKET_CHOICES = [20, BASKET_EXAMPLE_CHF, 90, 150];

function chf(amount: number): string {
  return `CHF ${amount.toFixed(2)}`;
}

/** The gold highlight the verdict's <hl> tag maps onto. */
const highlight = <span className="text-[var(--brand-accent)]" />;

/** One line of the where-it-goes breakdown. */
function StackRow({
  label,
  amount,
  muted,
}: {
  label: string;
  amount: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className={muted ? "text-[var(--brand-muted)]" : undefined}>
        {label}
      </span>
      <span className="font-medium lining-nums tabular-nums">{amount}</span>
    </div>
  );
}

export function FeeCalculator() {
  const { t, st, numberLocale } = useMarketingT();
  const [sales, setSales] = useState(DEFAULT_SALES_CHF);
  const [basket, setBasket] = useState(BASKET_EXAMPLE_CHF);
  const sliderId = useId();
  const basketId = useId();

  const cost = monthlyCostAt(sales);
  const free = monthlyStack(sales, basket, "free");
  const pro = monthlyStack(sales, basket, "pro");

  const isFree = cost.cheaper === "free" || cost.cheaper === "tie";
  const nothingOwed = cost.freePlanChf === 0;
  const proName = st("plans.pro.name", PRO_PLAN.name);

  return (
    <div
      data-testid="fee-calculator"
      className="mx-auto max-w-3xl rounded-2xl border border-[var(--brand-border)] bg-white p-8 md:p-10"
    >
      <p className="font-hand text-xl leading-none text-[var(--brand-accent)]">
        {t("feeCalculator.eyebrow")}
      </p>
      <h2 className="mt-2 font-serif text-2xl text-[var(--brand-text)]">
        {t("feeCalculator.heading")}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--brand-muted-2)]">
        {t("feeCalculator.intro")}
      </p>

      <div className="mt-8">
        <label
          htmlFor={sliderId}
          className="flex flex-wrap items-baseline justify-between gap-2"
        >
          <span className="text-sm font-medium text-[var(--brand-text)]">
            {t("feeCalculator.sliderLabel")}
          </span>
          <span className="font-serif text-2xl text-[var(--brand-ink)] lining-nums tabular-nums">
            CHF {sales.toLocaleString(numberLocale)}
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
          {t("feeCalculator.sliderNote")}
        </p>
      </div>

      {/* The basket size is an input rather than an assumption: Stripe's fixed
          CHF 0.30 lands per ORDER, so thirty small sales and three big ones
          cost very different amounts to accept. Choosing a default silently
          would make that decision on the reader's behalf. */}
      <fieldset className="mt-6">
        <legend
          id={basketId}
          className="text-sm font-medium text-[var(--brand-text)]"
        >
          {t("feeCalculator.basketLabel")}
        </legend>
        <div
          role="radiogroup"
          aria-labelledby={basketId}
          className="mt-3 flex flex-wrap gap-2"
        >
          {BASKET_CHOICES.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={basket === value}
              onClick={() => setBasket(value)}
              className={`rounded-full border px-4 py-1.5 text-xs font-medium lining-nums tabular-nums transition-colors ${
                basket === value
                  ? "border-[var(--brand-accent)] bg-[var(--brand-accent)]/10 text-[var(--brand-ink)]"
                  : "border-[var(--brand-border)] text-[var(--brand-muted-2)] hover:border-[var(--brand-accent)]"
              }`}
            >
              CHF {value}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--brand-muted)]">
          {t("feeCalculator.basketNote", { orders: free.orders })}
        </p>
      </fieldset>

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
            {t("feeCalculator.onFree")}
          </p>
          <p
            data-testid="fee-free-total"
            className="mt-1 font-serif text-3xl text-[var(--brand-ink)] lining-nums tabular-nums"
          >
            {chf(cost.freePlanChf)}
          </p>
          <p className="mt-1 text-xs text-[var(--brand-muted-2)]">
            {t("feeCalculator.freeMeta", {
              percent: REVENUE_SHARE.percentLabel,
            })}
          </p>
          <div
            data-testid="stack-free"
            className="mt-4 space-y-1.5 border-t border-[var(--brand-border)] pt-3 text-[var(--brand-muted-2)]"
          >
            <StackRow
              label={t("feeCalculator.toProcessor")}
              amount={chf(free.processorChf)}
            />
            <StackRow
              label={t("feeCalculator.toPlatform")}
              amount={chf(free.platformChf)}
            />
            <StackRow
              label={t("feeCalculator.youKeep")}
              amount={chf(free.keepChf)}
            />
          </div>
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
            {t("feeCalculator.onPlan", { plan: proName })}
          </p>
          <p
            data-testid="fee-pro-total"
            className="mt-1 font-serif text-3xl text-[var(--brand-ink)] lining-nums tabular-nums"
          >
            {chf(cost.proPlanChf)}
          </p>
          <p className="mt-1 text-xs text-[var(--brand-muted-2)]">
            {t("feeCalculator.proMeta")}
          </p>
          <div
            data-testid="stack-pro"
            className="mt-4 space-y-1.5 border-t border-[var(--brand-border)] pt-3 text-[var(--brand-muted-2)]"
          >
            <StackRow
              label={t("feeCalculator.toProcessor")}
              amount={chf(pro.processorChf)}
            />
            <StackRow
              label={t("feeCalculator.toPlatform")}
              amount={chf(pro.platformChf)}
            />
            <StackRow
              label={t("feeCalculator.youKeep")}
              amount={chf(pro.keepChf)}
            />
          </div>
        </div>
      </div>

      {/* The line the whole rebuild exists for. The big number above is OUR
          invoice; this says what a sale actually costs, and who gets the rest. */}
      <p
        data-testid="fee-calculator-stack-note"
        className="mt-6 rounded-lg bg-[var(--brand-surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--brand-muted-2)]"
      >
        {t("feeCalculator.stackNote")}
      </p>

      <p
        data-testid="fee-calculator-verdict"
        className="mt-6 font-serif text-lg leading-snug text-[var(--brand-text)]"
      >
        {nothingOwed ? (
          <Trans
            t={t}
            i18nKey="feeCalculator.verdictNoSales"
            components={{ hl: highlight }}
          />
        ) : isFree ? (
          <Trans
            t={t}
            i18nKey="feeCalculator.verdictFree"
            values={{
              saving: chf(cost.savingChf),
              breakEven: PRO_BREAK_EVEN_ONLINE_CHF.toLocaleString(numberLocale),
            }}
            components={{ hl: highlight }}
          />
        ) : (
          <Trans
            t={t}
            i18nKey="feeCalculator.verdictPro"
            values={{ plan: proName, saving: chf(cost.savingChf) }}
            components={{ hl: highlight }}
          />
        )}
      </p>
    </div>
  );
}
