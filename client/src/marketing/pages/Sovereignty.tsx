import { Link } from "wouter";
import { SOVEREIGNTY, PLATFORM } from "@shared/platform";
import { Container } from "../components/Container";
import { StateChip } from "../components/SwissMade";
import { DataResidency } from "../components/DataResidency";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * /made-in-switzerland — the Swissness claim in full, with the ledger.
 *
 * The landing band (components/SwissMade.tsx) shows where each piece of the
 * stack is today; this page adds what happens next to each one, why we're
 * spending money on it at all, and the hosting detail via the DataResidency
 * band (which carries the sub-processor caveat, so it isn't restated here).
 *
 * It exists as its own route mostly because of who reads it: "where is my data
 * / is this company European" is a question a customer asks a merchant, and a
 * merchant needs a link they can paste back. It's also the shape of page AI
 * assistants quote from, which is why the whole ledger is in the server-side
 * noscript too (server/marketingSeo.ts).
 */
export default function Sovereignty() {
  const { t, st } = useMarketingT();
  useDocumentMeta({
    title: t("sovereigntyPage.metaTitle", { platform: PLATFORM.name }),
    description: t("sovereigntyPage.metaDescription", {
      platform: PLATFORM.name,
    }),
    path: SOVEREIGNTY.href,
  });

  return (
    <>
      <section className="bg-band">
        <Container width="4xl" className="py-20">
          <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
            {st("sovereignty.eyebrow", SOVEREIGNTY.eyebrow)}
          </p>
          <h1 className="mt-3 max-w-2xl font-serif text-4xl leading-[1.1] text-band-fg sm:text-5xl">
            {st("sovereignty.headline", SOVEREIGNTY.headline)}{" "}
            {st("sovereignty.headlineEmphasis", SOVEREIGNTY.headlineEmphasis)}
          </h1>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed text-band-fg/80">
            {st("sovereignty.serving", SOVEREIGNTY.serving)}
          </p>
          <p className="mt-4 max-w-2xl leading-relaxed text-band-fg/60">
            {st("sovereignty.body", SOVEREIGNTY.body)}
          </p>
        </Container>
      </section>

      {/* The ledger, this time with what happens next to each row. */}
      <Container width="4xl" as="section" className="py-20">
        <h2 className="font-serif text-3xl text-[var(--brand-text)]">
          {t("sovereigntyPage.ledgerTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--brand-muted-2)]">
          {t("sovereigntyPage.ledgerIntro")}
        </p>

        <ul className="mt-10 grid gap-4">
          {SOVEREIGNTY.ledger.map((entry, i) => (
            <li
              key={entry.piece}
              className="rounded-2xl border border-[var(--brand-border)] bg-white p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-serif text-xl leading-snug text-[var(--brand-text)]">
                    {st(`sovereignty.ledger.${i}.piece`, entry.piece)}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                    {st(`sovereignty.ledger.${i}.today`, entry.today)}
                  </p>
                </div>
                <StateChip state={entry.state} />
              </div>
              {entry.next && (
                <p className="mt-4 border-t border-[var(--brand-border)] pt-4 text-[15px] leading-relaxed text-[var(--brand-text)]">
                  <span className="font-medium">
                    {entry.state === "foreign"
                      ? t("sovereigntyPage.whyNotLabel")
                      : t("sovereigntyPage.nextLabel")}
                  </span>
                  {st(`sovereignty.ledger.${i}.next`, entry.next)}
                </p>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-[var(--brand-muted)]">
          {st("sovereignty.promise", SOVEREIGNTY.promise)}
        </p>
      </Container>

      {/* Why any of this is worth the engineering time. */}
      <section className="border-y border-[var(--brand-border)] bg-[var(--brand-surface-2)]">
        <Container width="4xl" className="py-20">
          <h2 className="font-serif text-3xl text-[var(--brand-text)]">
            {t("sovereigntyPage.whyTitle")}
          </h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2">
            {SOVEREIGNTY.why.map((reason, i) => (
              <li
                key={reason}
                className="rounded-2xl border border-[var(--brand-border)] bg-white p-6 text-[15px] leading-relaxed text-[var(--brand-muted-2)]"
              >
                {st(`sovereignty.why.${i}`, reason)}
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* The hosting detail — and, in its caveat, what still leaves Europe. */}
      <DataResidency />

      <section className="bg-band">
        <Container width="4xl" className="py-20 text-center">
          <h2 className="font-serif text-3xl text-band-fg sm:text-4xl">
            {t("sovereigntyPage.ctaTitle")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-band-fg/70">
            {t("sovereigntyPage.ctaBody")}
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-block rounded-md bg-[var(--brand-accent)] px-7 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--brand-accent-fg)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            {t("sovereigntyPage.ctaButton")}
          </Link>
        </Container>
      </section>
    </>
  );
}
