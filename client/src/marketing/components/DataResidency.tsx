import { Link } from "wouter";
import { DATA_RESIDENCY } from "@shared/platform";
import { SketchUnderline } from "@/components/SketchAccents";
import { ScrollReveal } from "./ScrollReveal";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * DataResidency — where the shop physically lives.
 *
 * Every other band on this page is about what Gwinn does; this one is about
 * where it runs. For a maker selling into the EU (and for the customer who
 * eventually asks), "the database with your customers' addresses is in Germany"
 * is a concrete, checkable answer, so the section states the facts plainly and
 * lets the small facts panel carry them.
 *
 * The caveat is rendered, not optional. Card payments, AI calls and account
 * email go to third parties, some of them outside the EU; a residency band that
 * left that out would be the one paragraph on the page a merchant could catch
 * us on. Same reasoning as the pricing pledge — see DATA_RESIDENCY in
 * shared/platform.ts, where the copy lives.
 */

/**
 * The facts panel's rows — each one restates a field of DATA_RESIDENCY.
 * Labels and the two prose values are translated; the provider/region line is
 * assembled from the shared constants so it can't name a different country in
 * a different language.
 */
function useFactRows() {
  const { t, st } = useMarketingT();
  const provider = st("dataResidency.provider", DATA_RESIDENCY.provider);
  const region = st("dataResidency.region", DATA_RESIDENCY.region);
  const country = st(
    "dataResidency.primaryCountry",
    DATA_RESIDENCY.primaryCountry,
  );
  return [
    {
      label: t("dataResidency.facts.serversLabel"),
      value: t("dataResidency.facts.serversValue", {
        provider,
        region,
        country,
      }),
    },
    {
      label: t("dataResidency.facts.databaseLabel"),
      value: t("dataResidency.facts.databaseValue"),
    },
    {
      label: t("dataResidency.facts.lawLabel"),
      value: t("dataResidency.facts.lawValue"),
    },
  ];
}

export function DataResidency() {
  const { t, st } = useMarketingT();
  const factRows = useFactRows();
  return (
    <section className="border-t border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="mx-auto w-full max-w-5xl px-4 py-20 sm:px-6">
        {/* The facts panel is much shorter than the copy column; centring it
            keeps the band from reading as a half-empty right-hand margin. */}
        <ScrollReveal className="grid gap-10 md:grid-cols-[1.15fr_0.85fr] md:items-center">
          <div>
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              {st("dataResidency.eyebrow", DATA_RESIDENCY.eyebrow)}
            </p>
            <h2 className="mt-3 font-serif text-3xl leading-[1.15] text-[var(--brand-text)] sm:text-4xl">
              {st("dataResidency.headline", DATA_RESIDENCY.headline)}{" "}
              {/* Only the short second half is underlined — the stroke spans
                  its parent, so underlining the whole heading trails off the
                  moment it wraps. */}
              <span className="relative inline-block">
                {st(
                  "dataResidency.headlineEmphasis",
                  DATA_RESIDENCY.headlineEmphasis,
                )}
                <span
                  aria-hidden
                  className="absolute -bottom-2 left-0 w-full text-[var(--brand-accent)]"
                >
                  <SketchUnderline />
                </span>
              </span>
            </h2>
            <p className="mt-8 max-w-lg leading-relaxed text-[var(--brand-muted-2)]">
              {st("dataResidency.body", DATA_RESIDENCY.body)}
            </p>
            <ul className="mt-7 grid gap-3">
              {DATA_RESIDENCY.points.map((point, i) => (
                <li
                  key={point}
                  className="flex gap-3 text-[15px] leading-relaxed text-[var(--brand-muted-2)]"
                >
                  <span aria-hidden className="text-[var(--brand-accent)]">
                    —
                  </span>
                  {st(`dataResidency.points.${i}`, point)}
                </li>
              ))}
            </ul>
            <p className="mt-7 max-w-lg text-sm leading-relaxed text-[var(--brand-muted)]">
              {st("dataResidency.caveat", DATA_RESIDENCY.caveat)}
            </p>
            <Link
              href={DATA_RESIDENCY.href}
              className="mt-6 inline-block text-sm text-[var(--brand-ink)] underline decoration-[var(--brand-accent)] underline-offset-4 transition-colors hover:text-[var(--brand-accent)]"
            >
              {t("dataResidency.readPolicy")}
            </Link>
          </div>

          {/* The claim, reduced to the three lines a merchant would repeat. */}
          <div className="rounded-2xl border border-[var(--brand-border)] bg-white p-7 shadow-[0_20px_50px_-34px_rgba(45,38,32,0.4)]">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--brand-muted)]">
              {t("dataResidency.facts.title")}
            </p>
            <dl className="mt-5 grid gap-4">
              {factRows.map((row) => (
                <div
                  key={row.label}
                  className="border-b border-[var(--brand-border)] pb-4 last:border-b-0 last:pb-0"
                >
                  <dt className="text-xs uppercase tracking-[0.12em] text-[var(--brand-muted)]">
                    {row.label}
                  </dt>
                  <dd className="mt-1.5 font-serif text-lg leading-snug text-[var(--brand-text)]">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
