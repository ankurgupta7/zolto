import { Link, useParams } from "wouter";
import { Container } from "../components/Container";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import {
  COMPETITORS,
  findCompetitor,
  INCUMBENT_COMPARISON,
  PLATFORM,
  PRICING_PROMISE,
  REVENUE_SHARE,
} from "@shared/platform";
import { source } from "@shared/sources";
import { CapabilityMatrix } from "../components/CapabilityMatrix";
import { CostOfAcceptance } from "../components/CostOfAcceptance";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * /compare/zolto-vs-:slug — a decision-stage page per named incumbent.
 *
 * The comparison data already existed in shared/platform.ts but only rendered as
 * one section inside the landing page, so someone asking "Zolto vs SumUp" had no
 * page to land on. Comparison content is what people (and AI assistants) reach
 * for at the point of choosing, which is where most referral traffic arrives.
 *
 * Each page concedes where the incumbent is the better choice. That's deliberate:
 * a comparison that never gives ground reads as an advert and gets discounted.
 */
export default function Compare() {
  const { t, st } = useMarketingT();
  const params = useParams<{ slug?: string }>();
  const slug = (params.slug ?? "").replace(/^zolto-vs-/, "");
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
    path: competitor ? `/compare/zolto-vs-${competitor.id}` : "/compare",
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
                href={`/compare/zolto-vs-${c.id}`}
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

      {/* The model comparison — shared rows, so it can't drift from the landing page. */}
      <div className="mx-auto mt-14 max-w-3xl overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            {t("compare.tableCaption", { name: PLATFORM.name })}
          </caption>
          <thead>
            <tr className="border-b border-[var(--brand-border)]">
              <th scope="col" className="py-3 pr-4 font-medium">
                &nbsp;
              </th>
              <th
                scope="col"
                className="py-3 pr-4 font-medium text-[var(--brand-muted-2)]"
              >
                {t("compare.traditionalWay")}
              </th>
              <th
                scope="col"
                className="py-3 font-medium text-[var(--brand-ink)]"
              >
                {PLATFORM.name}
              </th>
            </tr>
          </thead>
          <tbody>
            {INCUMBENT_COMPARISON.map((row) => (
              <tr
                key={row.feature}
                className="border-b border-[var(--brand-border)]/60"
              >
                <th
                  scope="row"
                  className="py-4 pr-4 align-top font-medium text-[var(--brand-text)]"
                >
                  {st(`comparison.${row.feature}.feature`, row.feature)}
                </th>
                <td className="py-4 pr-4 align-top text-[var(--brand-muted-2)]">
                  {st(`comparison.${row.feature}.them`, row.them)}
                </td>
                <td className="py-4 align-top text-[var(--brand-ink)]">
                  {st(`comparison.${row.feature}.us`, row.us)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-[var(--brand-muted)]">
          {t("compare.rateNote", {
            name: PLATFORM.name,
            competitor: competitor.name,
            percent: REVENUE_SHARE.percentLabel,
            appliesTo: st("revenueShare.appliesTo", REVENUE_SHARE.appliesTo),
          })}
        </p>
      </div>

      {/* What each product actually does, row by row — including the row
          Zolto loses. Only rendered for competitors we researched to that
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
            {t("compare.zoltoWhenHeading", { name: PLATFORM.name })}
          </h2>
          <ul className="mt-4 space-y-3 text-sm text-[var(--brand-muted-2)]">
            {competitor.zoltoWhen.map((point, i) => (
              <li key={point} className="flex gap-2.5">
                <span aria-hidden className="text-[var(--brand-accent)]">
                  ✓
                </span>
                {st(`competitors.${competitor.id}.zoltoWhen.${i}`, point)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-16 max-w-3xl rounded-2xl border border-[var(--brand-accent)]/40 bg-[var(--brand-surface-2)] p-8 text-center">
        <p className="font-serif text-xl italic text-[var(--brand-muted-2)]">
          &ldquo;{st("pricingPromise.pledge", PRICING_PROMISE.pledge)}&rdquo;
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-[var(--brand-accent)] px-5 py-2.5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--brand-ink)] transition-colors hover:bg-[var(--brand-accent-light)]"
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
              href={`/compare/zolto-vs-${c.id}`}
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
