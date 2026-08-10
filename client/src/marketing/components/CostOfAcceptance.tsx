import {
  BASKET_EXAMPLE_CHF,
  basketTable,
  negotiatedFor,
  NEGOTIATED,
  type Channel,
  type Rate,
} from "@shared/costOfAcceptance";
import { source } from "@shared/sources";
import { useMarketingT } from "../lib/marketingI18n";

/**
 * CostOfAcceptance — what one sale actually costs, on every option we can source.
 *
 * The marketing surface used to publish no competitor rates at all, on the
 * grounds that any figure would be stale the day it shipped. The silence
 * flattered us: a reader who can't see the rates assumes the platform charging
 * "0% in person" is the cheap one, and on cards it isn't. This table is the
 * correction, and the correction only works if it's allowed to lose — so it
 * sorts by cost and Zolto lands where it lands.
 *
 * Every row carries the source it came from and the date that source was read.
 * Rows we couldn't pin down stay visible with their doubt attached rather than
 * being quietly rounded into confidence: Stripe doesn't say which bucket Swiss
 * cards fall into, so both readings are shown and both are marked.
 *
 * Options priced by negotiation get their own list underneath. "They won't tell
 * you until you ask" is itself a finding a buyer should weigh, and inventing a
 * plausible number for them would break the rule the rest of this table runs on.
 */

function chf(amount: number): string {
  return `CHF ${amount.toFixed(2)}`;
}

function SourceLine({ rate }: { rate: Rate }) {
  const { t } = useMarketingT();
  const s = source(rate.sourceId);
  return (
    <span className="mt-1 block text-xs font-normal text-[var(--brand-muted)]">
      <a
        href={s.url}
        target="_blank"
        rel="noreferrer nofollow"
        className="underline decoration-dotted underline-offset-2 hover:text-[var(--brand-accent)]"
      >
        {s.label}
      </a>{" "}
      · {t("sources.read", { date: s.retrievedOn })}
    </span>
  );
}

/**
 * Headings and captions are held per channel rather than composed from a
 * fragment: German puts the channel before the verb ("Was ein Verkauf … vor Ort
 * kostet"), so "{{heading}} {{channel}}" would only ever read correctly in
 * English.
 */
const HEADING_KEY: Record<Channel, string> = {
  "in-person": "costOfAcceptance.headingInPerson",
  online: "costOfAcceptance.headingOnline",
};
const CAPTION_KEY: Record<Channel, string> = {
  "in-person": "costOfAcceptance.tableCaptionInPerson",
  online: "costOfAcceptance.tableCaptionOnline",
};

export function CostOfAcceptance({
  channel,
  basketChf = BASKET_EXAMPLE_CHF,
  provider,
  showFraming = true,
}: {
  /** Omit to show both channels in one table. */
  channel?: Channel;
  basketChf?: number;
  /** Narrow the negotiated list to one provider (used on /compare pages). */
  provider?: Rate["provider"];
  /**
   * The intro and the monthly-fee footnote frame the whole comparison, not one
   * channel's table. The pricing page renders a table per channel, so it showed
   * both paragraphs twice, word for word — pass `false` on the second table and
   * they are stated once.
   */
  showFraming?: boolean;
}) {
  const { t, st, numberLocale } = useMarketingT();
  // On a "Zolto vs X" page, a third party's rates are noise. Everywhere else
  // (the pricing page) the whole field is the point, so an absent `provider`
  // shows everything.
  const rows = basketTable(basketChf, channel).filter(
    (r) =>
      !provider || r.rate.provider === provider || r.rate.provider === "zolto",
  );
  // Filtered by BOTH axes. Filtering only by provider made the pricing page
  // render Worldline's terminal contract and its online gateway twice — once
  // under the in-person table and again under the online one — which reads as
  // a rendering fault and undermines a section whose whole job is precision.
  const negotiated = (provider ? negotiatedFor(provider) : NEGOTIATED).filter(
    (n) => !channel || n.channel === channel,
  );

  return (
    <div data-testid="cost-of-acceptance">
      <h3 className="font-serif text-xl text-[var(--brand-text)]">
        {t(channel ? HEADING_KEY[channel] : "costOfAcceptance.heading", {
          basket: basketChf.toLocaleString(numberLocale),
        })}
      </h3>
      {showFraming && (
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--brand-muted-2)]">
          {t("costOfAcceptance.intro")}
        </p>
      )}

      {/* Wide table, narrow phone: it scrolls inside its own box rather than
          pushing the page sideways. */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
          <caption className="sr-only">
            {t(
              channel ? CAPTION_KEY[channel] : "costOfAcceptance.tableCaption",
              {
                basket: basketChf.toLocaleString(numberLocale),
              },
            )}
          </caption>
          <thead>
            <tr className="border-b border-[var(--brand-border)]">
              <th scope="col" className="py-3 pr-4 font-medium">
                {t("costOfAcceptance.colOption")}
              </th>
              <th scope="col" className="py-3 pr-4 text-right font-medium">
                {t("costOfAcceptance.colCost")}
              </th>
              <th scope="col" className="py-3 pr-4 text-right font-medium">
                {t("costOfAcceptance.colRate")}
              </th>
              <th scope="col" className="py-3 text-right font-medium">
                {t("costOfAcceptance.colMonthly")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rate, totalChf, effectivePct }) => (
              <tr
                key={rate.id}
                data-testid={`cost-row-${rate.id}`}
                className={`border-b border-[var(--brand-border)]/60 ${
                  rate.provider === "zolto"
                    ? "bg-[var(--brand-accent)]/[0.06]"
                    : ""
                }`}
              >
                <th
                  scope="row"
                  className="py-4 pr-4 align-top font-medium text-[var(--brand-text)]"
                >
                  {st(`rates.${rate.id}.label`, rate.label)}
                  {rate.confidence === "unverified" && (
                    <span
                      data-testid={`unverified-${rate.id}`}
                      className="ml-2 inline-block rounded-full border border-[var(--brand-border)] px-2 py-0.5 align-middle text-[10px] uppercase tracking-[0.12em] text-[var(--brand-muted)]"
                    >
                      {t("costOfAcceptance.unverified")}
                    </span>
                  )}
                  <SourceLine rate={rate} />
                  {rate.caveat && (
                    <span className="mt-1.5 block text-xs font-normal leading-relaxed text-[var(--brand-muted-2)]">
                      {st(`rates.${rate.id}.caveat`, rate.caveat)}
                    </span>
                  )}
                </th>
                {/* lining-nums is load-bearing: Cormorant defaults to oldstyle
                    figures, which renders money at x-height. */}
                <td className="py-4 pr-4 text-right align-top font-medium text-[var(--brand-ink)] lining-nums tabular-nums">
                  {chf(totalChf)}
                </td>
                <td className="py-4 pr-4 text-right align-top text-[var(--brand-muted-2)] lining-nums tabular-nums">
                  {effectivePct.toFixed(2)}%
                </td>
                <td className="py-4 text-right align-top text-[var(--brand-muted-2)] lining-nums tabular-nums">
                  {rate.monthlyChf === 0
                    ? t("costOfAcceptance.noMonthly")
                    : chf(rate.monthlyChf)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The line that stops the table reading as a scoreboard we won. */}
      {showFraming && (
        <p
          data-testid="cost-of-acceptance-note"
          className="mt-5 max-w-2xl rounded-lg bg-[var(--brand-surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--brand-muted-2)]"
        >
          {t("costOfAcceptance.note")}
        </p>
      )}

      {negotiated.length > 0 && (
        <div className="mt-8" data-testid="negotiated-offerings">
          <h4 className="font-serif text-lg text-[var(--brand-text)]">
            {t("costOfAcceptance.negotiatedHeading")}
          </h4>
          <ul className="mt-3 grid gap-3">
            {negotiated.map((n) => (
              <li
                key={n.id}
                className="text-sm leading-relaxed text-[var(--brand-muted-2)]"
              >
                <span className="font-medium text-[var(--brand-text)]">
                  {st(`negotiated.${n.id}.label`, n.label)}
                </span>{" "}
                — {st(`negotiated.${n.id}.detail`, n.detail)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
