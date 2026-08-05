import { CARD_READER_GAG, PRO_PLAN } from "@shared/platform";
import { ScrollReveal } from "./ScrollReveal";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * CardReaderGag — the comparison table's punchline, told as a joke.
 *
 * The table one section up states that the old guard sells you a reader for
 * CHF 50–300+. Rather than assert that again in a sterner voice, this re-spends
 * the top of that range on things a maker would actually recognise, and ends on
 * the one comparison that is arithmetic rather than opinion: the same money is
 * a year of Pro.
 *
 * Kept honest on purpose — no competitor is named and no price is attributed to
 * anyone. It's a joke about what CHF 300 of hardware is worth, not a claim
 * about a rival's bill.
 */
export function CardReaderGag() {
  const { t, st } = useMarketingT();
  const { anchorChf, items, proMonths } = CARD_READER_GAG;

  return (
    <ScrollReveal className="mx-auto max-w-2xl rounded-2xl border border-dashed border-[var(--brand-accent)]/50 bg-[var(--brand-surface-2)] p-8 text-center md:p-10">
      <p className="font-hand text-xl leading-none text-[var(--brand-accent)]">
        {t("cardReaderGag.eyebrow")}
      </p>
      <h3 className="mt-2 font-serif text-2xl text-[var(--brand-text)]">
        {t("cardReaderGag.heading")}
      </h3>

      <ul className="mt-6 grid gap-2.5 text-left">
        {items.map((item, i) => (
          <li
            key={item}
            className="flex gap-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]"
          >
            <span aria-hidden className="text-[var(--brand-accent)]">
              —
            </span>
            {st(`cardReaderGag.items.${i}`, item)}
          </li>
        ))}
        <li className="flex gap-3 text-[15px] leading-relaxed text-[var(--brand-text)]">
          <span aria-hidden className="text-[var(--brand-accent)]">
            —
          </span>
          <span>
            <strong className="font-medium">
              {t("cardReaderGag.punchlineStrong", {
                months: proMonths,
                plan: st("plans.pro.name", PRO_PLAN.name),
              })}
            </strong>{" "}
            {t("cardReaderGag.punchlineRest")}
          </span>
        </li>
      </ul>

      <p className="mt-6 text-sm text-[var(--brand-muted)]">
        {t("cardReaderGag.footnote", { anchor: anchorChf })}
      </p>
    </ScrollReveal>
  );
}
