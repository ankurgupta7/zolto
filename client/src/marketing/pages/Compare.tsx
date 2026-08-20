import { Link, useParams } from "wouter";
import { Container } from "../components/Container";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import {
  COMPETITORS,
  findCompetitor,
  PLATFORM,
  PRICING_PROMISE,
  BUYER_FIT,
  PLATFORM_LIMITATIONS,
  INCUMBENT_COMPARISON,
} from "@shared/platform";
import { source } from "@shared/sources";
import { CapabilityMatrix } from "../components/CapabilityMatrix";
import { CostOfAcceptance } from "../components/CostOfAcceptance";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * /compare/gwinn-vs-:slug — a decision-stage page per named incumbent.
 *
 * The comparison data already existed in shared/platform.ts but only rendered as
 * one section inside the landing page, so someone asking "Gwinn vs SumUp" had no
 * page to land on. Comparison content is what people (and AI assistants) reach
 * for at the point of choosing, which is where most referral traffic arrives.
 *
 * Each page concedes where the incumbent is the better choice. That's deliberate:
 * a comparison that never gives ground reads as an advert and gets discounted.
 */
export default function Compare() {
  const { t, st } = useMarketingT();
  const params = useParams<{ slug?: string }>();
  const slug = (params.slug ?? "").replace(/^gwinn-vs-/, "");
  const competitor = findCompetitor(slug);

  useDocumentMeta({
    title: competitor
      ? t("compare.metaTitle", {
          name: PLATFORM.name,
          competitor: competitor.name,
        })
      : t("compare.metaTitleIndex", { name: PLATFORM.name }),
    description: competitor
      ? t("compare.metaDescription", {
          name: PLATFORM.name,
          competitor: competitor.name,
        })
      : t("compare.metaDescriptionIndex", { name: PLATFORM.name }),
    path: competitor ? `/compare/gwinn-vs-${competitor.id}` : "/compare",
  });

  if (!competitor) {
    return (
      <Container className="py-20">
        <h1 className="text-center font-serif text-4xl text-[var(--brand-text)]">
          {t("compare.indexHeading", { name: PLATFORM.name })}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-[var(--brand-muted-2)]">
          {t("compare.indexIntro", { name: PLATFORM.name })}
        </p>
        <ul className="mx-auto mt-12 grid max-w-2xl gap-4">
          {COMPETITORS.map((c) => (
            <li key={c.id}>
              <Link
                href={`/compare/gwinn-vs-${c.id}`}
                className="block rounded-xl border border-[var(--brand-border)] bg-white p-6 transition-colors hover:border-[var(--brand-accent)]"
              >
                <span className="font-serif text-xl text-[var(--brand-text)]">
                  {t("compare.versus", {
                    name: PLATFORM.name,
                    competitor: c.name,
                  })}
                </span>
                <span className="mt-2 block text-sm text-[var(--brand-muted-2)]">
                  {st(`competitors.${c.id}.summary`, c.summary)}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/* The generic old-guard table. It used to be a band on the homepage,
            which became a six-chapter reel with no viewport to spare for a
            seven-row table; this index is the better home for it anyway — it is
            the page a reader lands on while choosing, and the one place where
            "them" hasn't yet been narrowed to a named product. The copy and the
            locale keys came across unchanged, `landing.comparison*` included,
            so nothing had to be re-translated to move it. */}
        <div
          data-testid="incumbent-comparison"
          className="mx-auto mt-20 max-w-4xl"
        >
          <div className="mb-10 text-center">
            <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
              {t("landing.comparisonEyebrow")}
            </p>
            <h2 className="mt-2 font-serif text-3xl text-[var(--brand-text)]">
              {t("landing.comparisonHeading")}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[var(--brand-muted-2)]">
              {t("landing.comparisonBody")}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[15px]">
              <thead>
                <tr>
                  <th className="border-b border-[var(--brand-border)] px-4 py-3" />
                  <th className="border-b border-[var(--brand-border)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand-muted)]">
                    {t("landing.colOldGuard")}
                  </th>
                  <th className="border-b border-[var(--brand-border)] px-4 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--brand-accent)]">
                    {PLATFORM.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {INCUMBENT_COMPARISON.map((row) => (
                  <tr key={row.feature}>
                    <td className="border-b border-[var(--brand-border)] px-4 py-3.5 font-medium text-[var(--brand-text)]">
                      {st(`comparison.${row.feature}.feature`, row.feature)}
                    </td>
                    <td className="border-b border-[var(--brand-border)] px-4 py-3.5 text-[var(--brand-muted-2)]">
                      {st(`comparison.${row.feature}.them`, row.them)}
                    </td>
                    <td className="border-b border-[var(--brand-border)] bg-[var(--brand-accent)]/[0.07] px-4 py-3.5 font-medium text-[var(--brand-text)]">
                      <span aria-hidden className="text-[var(--brand-accent)]">
                        ✓{" "}
                      </span>
                      {st(`comparison.${row.feature}.us`, row.us)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Three questions that settle this purchase. Two of the three route
            the reader away from us when that's the honest answer — which is
            the reason it's worth putting on the page at all. A buyer who finds
            out on day three that their customers all pay by TWINT is a refund;
            a buyer we sent to SumUp on day zero isn't. */}
        <div
          data-testid="buyer-fit"
          className="mx-auto mt-20 max-w-2xl rounded-2xl border border-[var(--brand-border)] bg-white p-8"
        >
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("compare.buyerFitHeading")}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--brand-muted-2)]">
            {t("compare.buyerFitIntro")}
          </p>
          <ol className="mt-8 grid gap-8">
            {BUYER_FIT.map((q, qi) => (
              <li key={q.question}>
                <h3 className="font-serif text-lg text-[var(--brand-text)]">
                  {st(`buyerFit.${qi}.question`, q.question)}
                </h3>
                <dl className="mt-3 grid gap-3">
                  {q.answers.map((a, ai) => (
                    <div key={a.when} className="text-sm leading-relaxed">
                      <dt className="font-medium text-[var(--brand-ink)]">
                        {st(`buyerFit.${qi}.answers.${ai}.when`, a.when)}
                      </dt>
                      <dd className="text-[var(--brand-muted-2)]">
                        {st(`buyerFit.${qi}.answers.${ai}.then`, a.then)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        </div>

        {/* Our own column of the concession. Every competitor page carries a
            "when they're the better choice" panel; this is the same courtesy
            turned on us, and it's checkable against the codebase. */}
        <div
          data-testid="gwinn-limitations"
          className="mx-auto mt-12 max-w-2xl rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface-2)] p-8"
        >
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("compare.limitationsHeading", { name: PLATFORM.name })}
          </h2>
          <ul className="mt-6 grid gap-5">
            {PLATFORM_LIMITATIONS.map((l, i) => (
              <li key={l.title}>
                <h3 className="text-sm font-medium text-[var(--brand-ink)]">
                  {st(`limitations.${i}.title`, l.title)}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-[var(--brand-muted-2)]">
                  {st(`limitations.${i}.detail`, l.detail)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-20">
      <div className="text-center">
        <p className="font-hand text-2xl leading-none text-[var(--brand-accent)]">
          {t("compare.eyebrow")}
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[var(--brand-text)]">
          {t("compare.versus", {
            name: PLATFORM.name,
            competitor: competitor.name,
          })}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--brand-muted-2)]">
          {st(`competitors.${competitor.id}.summary`, competitor.summary)}
        </p>
      </div>

      {/* The generic "old guard vs Gwinn" table used to sit here. It was
          removed once the capability matrix widened from ten payment rows to
          the whole product: on a page about ONE named competitor, a generic
          seven-row table directly above a specific twenty-two-row one is the
          same argument told twice, the second time better. INCUMBENT_COMPARISON
          renders on the /compare index above, where the reader hasn't picked a
          competitor yet and the generic version is the right altitude. */}

      {/* What each product actually does, row by row — including the row
          Gwinn loses. Only rendered for competitors we researched to that
          depth; a blank column would read as "no" rather than "we didn't
          check". */}
      {competitor.capabilities && (
        <div className="mx-auto mt-16 max-w-3xl">
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("compare.capabilitiesHeading", {
              name: PLATFORM.name,
              competitor: competitor.name,
            })}
          </h2>
          <div className="mt-6">
            <CapabilityMatrix competitor={competitor} />
          </div>
        </div>
      )}

      {/* The rates, sourced and dated. This section is the reason the old
          no-competitor-pricing rule was retired — see the COMPETITORS doc
          comment in shared/platform.ts. */}
      {competitor.rateIds && competitor.rateIds.length > 0 && (
        <div className="mx-auto mt-16 max-w-3xl">
          <CostOfAcceptance provider={competitor.id as "sumup" | "worldline"} />
        </div>
      )}

      {/* Published, primary-sourced facts about the company itself — carried
          only where "the incumbent is the safe choice" is the argument being
          weighed, which in practice means Worldline. */}
      {competitor.risks && competitor.risks.length > 0 && (
        <div
          data-testid="competitor-risks"
          className="mx-auto mt-16 max-w-3xl rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface-2)] p-8"
        >
          <h2 className="font-serif text-2xl text-[var(--brand-text)]">
            {t("compare.risksHeading", { competitor: competitor.name })}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--brand-muted-2)]">
            {t("compare.risksIntro", { competitor: competitor.name })}
          </p>
          <ul className="mt-6 grid gap-4">
            {competitor.risks.map((risk, i) => (
              <li
                key={risk.sourceId}
                className="text-sm leading-relaxed text-[var(--brand-muted-2)]"
              >
                {st(`competitors.${competitor.id}.risks.${i}`, risk.statement)}
                <span className="mt-1 block text-xs text-[var(--brand-muted)]">
                  <a
                    href={source(risk.sourceId).url}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="underline decoration-dotted underline-offset-2 hover:text-[var(--brand-accent)]"
                  >
                    {source(risk.sourceId).label}
                  </a>{" "}
                  ·{" "}
                  {t("sources.read", {
                    date: source(risk.sourceId).retrievedOn,
                  })}
                </span>
              </li>
            ))}
          </ul>
          {/* The concession that keeps this a risk note rather than a hit
              piece. Without it, the section reads as motivated and gets
              discounted along with everything above it. */}
          <p className="mt-6 rounded-lg bg-white px-4 py-3 text-sm leading-relaxed text-[var(--brand-muted-2)]">
            {t("compare.risksBalance", { competitor: competitor.name })}
          </p>
        </div>
      )}

      {/* Concede first — it's what makes the other column credible. */}
      <div className="mx-auto mt-16 grid max-w-3xl gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-[var(--brand-border)] bg-white p-6">
          <h2 className="font-serif text-xl text-[var(--brand-text)]">
            {t("compare.betterWhenHeading", { competitor: competitor.name })}
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-[var(--brand-muted-2)]">
            {competitor.betterWhen.map((point, i) => (
              <li key={point} className="flex gap-2.5">
                <span aria-hidden className="text-[var(--brand-muted)]">
                  —
                </span>
                {st(`competitors.${competitor.id}.betterWhen.${i}`, point)}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[var(--brand-accent)] bg-white p-6 ring-1 ring-[var(--brand-accent)]">
          <h2 className="font-serif text-xl text-[var(--brand-text)]">
            {t("compare.platformWhenHeading", { name: PLATFORM.name })}
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-[var(--brand-muted-2)]">
            {competitor.platformWhen.map((point, i) => (
              <li key={point} className="flex gap-2.5">
                <span aria-hidden className="text-[var(--brand-accent)]">
                  ✓
                </span>
                {st(`competitors.${competitor.id}.platformWhen.${i}`, point)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface-2)] p-8 text-center">
        <p className="font-serif text-xl italic text-[var(--brand-muted-2)] lining-nums">
          &ldquo;{st("pricingPromise.pledge", PRICING_PROMISE.pledge)}&rdquo;
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-[var(--brand-accent)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-accent-fg)] transition-colors hover:bg-[var(--brand-accent-light)]"
          >
            {t("compare.startFree")}
          </Link>
          <Link
            href="/pricing"
            className="rounded-md border border-[var(--brand-ink)]/25 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-ink)] hover:text-white"
          >
            {t("compare.seePricing")}
          </Link>
        </div>
      </div>

      <nav className="mx-auto mt-12 max-w-3xl text-center text-sm">
        <span className="text-[var(--brand-muted)]">
          {t("compare.alsoCompare")}{" "}
        </span>
        {COMPETITORS.filter((c) => c.id !== competitor.id).map((c, i) => (
          <span key={c.id}>
            {i > 0 && <span className="text-[var(--brand-muted)]"> · </span>}
            <Link
              href={`/compare/gwinn-vs-${c.id}`}
              className="text-[var(--brand-accent)] hover:underline"
            >
              {t("compare.versus", {
                name: PLATFORM.name,
                competitor: c.name,
              })}
            </Link>
          </span>
        ))}
      </nav>
    </Container>
  );
}
