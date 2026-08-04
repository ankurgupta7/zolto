import { useId, useState } from "react";
import { Trans } from "react-i18next";
import {
  monthlyCostAt,
  PRO_PLAN,
  PRO_BREAK_EVEN_ONLINE_CHF,
  REVENUE_SHARE,
} from "@shared/platform";
import { useMarketingT } from "../lib/marketingI18n";

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

/** The gold highlight the verdict's <hl> tag maps onto. */
const highlight = <span className="text-[var(--brand-accent)]" />;

export function FeeCalculator() {
  const { t, st, numberLocale } = useMarketingT();
  const [sales, setSales] = useState(DEFAULT_SALES_CHF);
  const sliderId = useId();
  const cost = monthlyCostAt(sales);

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
          <p className="mt-1 font-serif text-3xl text-[var(--brand-ink)] lining-nums tabular-nums">
            {chf(cost.freePlanChf)}
          </p>
          <p className="mt-1 text-xs text-[var(--brand-muted-2)]">
            {t("feeCalculator.freeMeta", {
              percent: REVENUE_SHARE.percentLabel,
            })}
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
            {t("feeCalculator.onPlan", { plan: proName })}
          </p>
          <p className="mt-1 font-serif text-3xl text-[var(--brand-ink)] lining-nums tabular-nums">
            {chf(cost.proPlanChf)}
          </p>
          <p className="mt-1 text-xs text-[var(--brand-muted-2)]">
            {t("feeCalculator.proMeta")}
          </p>
        </div>
      </div>

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
