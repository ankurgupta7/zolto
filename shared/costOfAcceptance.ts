/**
 * What a sale actually costs, all in — the model behind the comparison pages.
 *
 * This module exists because of one sentence in the August 2026 pricing review:
 * Zolto's "0% in person, 1% online" is a *platform* fee charged on top of Stripe,
 * not the cost of acceptance. Every surface that quoted the platform fee on its
 * own — the pricing page, the pledge, the fee calculator — was answering a
 * question the reader wasn't asking. A maker doesn't want to know our cut. They
 * want to know what lands in their account.
 *
 * So a `Rate` here is deliberately split into `percent` (what the payment company
 * takes) and `platformPercent` (what Zolto adds), and the UI renders both. The
 * stack is the point. Hiding the bottom half of it is what we're fixing.
 *
 * Two rules this module enforces on itself:
 *
 *  - **Every rate names a source.** See shared/sources.ts for why the old
 *    no-competitor-pricing rule was replaced with a provenance rule instead.
 *  - **Zolto's rows are not allowed to flatter Zolto.** `basketTable()` sorts
 *    cheapest-first and Zolto does not come first. That isn't modesty, it's the
 *    finding: on raw card rate Zolto loses to SumUp Payments Plus and to
 *    Worldline Tap on Mobile. A comparison table that reordered itself until we
 *    won would be the exact behaviour the pledge is positioned against.
 */

import { REVENUE_SHARE } from "./platform";

export type Confidence =
  /** Published by the provider and read on `retrievedOn`. */
  | "verified"
  /** Published, but ambiguous or of doubtful currency — the caveat says how. */
  | "unverified";

export type Channel = "in-person" | "online";

export interface Rate {
  id: string;
  provider: "zolto" | "sumup" | "worldline";
  /** How the option is named to a reader, e.g. "Payments Plus (CHF 29/mo)". */
  label: string;
  channel: Channel;
  /** What the payment company takes, as a percentage of the basket. */
  percent: number;
  /** Fixed per-transaction amount in CHF, on top of `percent`. */
  fixedChf: number;
  /**
   * What Zolto adds on top, as a percentage. Zero for everyone else, and zero
   * for Zolto in person on every plan — sourced from REVENUE_SHARE so it can
   * never disagree with what checkout actually charges.
   */
  platformPercent: number;
  /** Fixed monthly cost of being on this option at all. */
  monthlyChf: number;
  /** One-off hardware or setup cost. */
  oneOffChf: number;
  confidence: Confidence;
  sourceId: string;
  /** Why this figure is weaker than it looks. Rendered whenever present. */
  caveat?: string;
}

/** Basis points → percent, so Zolto's rows track REVENUE_SHARE rather than copy it. */
const pct = (bps: number) => bps / 100;

/**
 * The basket the comparison is worked on: a CHF 45 craft-fair sale. Chosen
 * because it's a plausible single object from a maker's table — high enough that
 * percentage rates dominate, low enough that fixed fees still show up.
 */
export const BASKET_EXAMPLE_CHF = 45;

export const RATES: Rate[] = [
  // ---- In person --------------------------------------------------------
  {
    id: "zolto-twint-qr",
    provider: "zolto",
    label: "TWINT — your own QR, your own TWINT account",
    channel: "in-person",
    percent: 1.3,
    fixedChf: 0,
    platformPercent: pct(REVENUE_SHARE.inPersonBps),
    monthlyChf: 0,
    oneOffChf: 0,
    confidence: "verified",
    sourceId: "twint-merchant-fees",
    caveat:
      "This is the merchant's own TWINT QR: the money never passes through Stripe or Zolto, and the sale is recorded in the till rather than captured by it.",
  },
  {
    id: "sumup-payments-plus",
    provider: "sumup",
    label: "Payments Plus (CHF 29/mo)",
    channel: "in-person",
    percent: 0.99,
    fixedChf: 0,
    platformPercent: 0,
    monthlyChf: 29,
    oneOffChf: 0,
    confidence: "verified",
    sourceId: "sumup-pos-lite",
    caveat:
      "Domestic rate. Non-EU cards are charged at 1.99%. The CHF 29/month is owed whether or not you sell.",
  },
  {
    id: "sumup-debit",
    provider: "sumup",
    label: "Debit card, pay-as-you-go",
    channel: "in-person",
    percent: 1.5,
    fixedChf: 0,
    platformPercent: 0,
    monthlyChf: 0,
    oneOffChf: 0,
    confidence: "verified",
    sourceId: "sumup-pos-lite",
  },
  {
    id: "worldline-tap-on-mobile",
    provider: "worldline",
    label: "Tap on Mobile",
    channel: "in-person",
    percent: 1.7,
    fixedChf: 0,
    platformPercent: 0,
    monthlyChf: 0,
    oneOffChf: 0,
    confidence: "verified",
    sourceId: "worldline-tap-on-mobile",
    caveat:
      "Flat rate with no fixed monthly cost, and it accepts TWINT. A genuinely competitive small-merchant offer.",
  },
  {
    id: "zolto-card-eea",
    provider: "zolto",
    label: "Tap to Pay — card, if Swiss cards bill at Stripe's EEA rate",
    channel: "in-person",
    percent: 1.4,
    // Stripe's CHF 0.10 per transaction, plus CHF 0.10 per Tap to Pay authorisation.
    fixedChf: 0.2,
    platformPercent: pct(REVENUE_SHARE.inPersonBps),
    monthlyChf: 0,
    oneOffChf: 0,
    confidence: "unverified",
    sourceId: "stripe-ch-pricing",
    caveat:
      "Stripe does not state which bucket Swiss-issued cards fall into. This row assumes the EEA one; the row below assumes it doesn't. Confirm with Stripe before relying on either.",
  },
  {
    id: "sumup-credit",
    provider: "sumup",
    label: "Credit card, pay-as-you-go",
    channel: "in-person",
    percent: 2.5,
    fixedChf: 0,
    platformPercent: 0,
    monthlyChf: 0,
    oneOffChf: 0,
    confidence: "verified",
    sourceId: "sumup-pos-lite",
  },
  {
    id: "zolto-card-non-eea",
    provider: "zolto",
    label: "Tap to Pay — card, if Swiss cards bill at Stripe's non-EEA rate",
    channel: "in-person",
    percent: 2.9,
    fixedChf: 0.2,
    platformPercent: pct(REVENUE_SHARE.inPersonBps),
    monthlyChf: 0,
    oneOffChf: 0,
    confidence: "unverified",
    sourceId: "stripe-ch-pricing",
    caveat:
      "The pessimistic reading of the same ambiguity. Between this row and the EEA one there is more than a full percentage point, which is why it's worth asking Stripe rather than guessing.",
  },

  // ---- Online -----------------------------------------------------------
  {
    id: "sumup-online",
    provider: "sumup",
    label: "Online store checkout",
    channel: "online",
    percent: 2.5,
    fixedChf: 0,
    platformPercent: 0,
    monthlyChf: 0,
    oneOffChf: 0,
    confidence: "verified",
    sourceId: "sumup-pos-lite",
    caveat: "Flat, with no fixed fee. Cheaper than Zolto online on every plan.",
  },
  {
    id: "zolto-online-pro",
    provider: "zolto",
    label: "Storefront checkout — Pro",
    channel: "online",
    percent: 2.9,
    fixedChf: 0.3,
    platformPercent: pct(REVENUE_SHARE.proBps),
    monthlyChf: 25,
    oneOffChf: 0,
    confidence: "verified",
    sourceId: "stripe-ch-pricing",
  },
  {
    id: "zolto-online-free",
    provider: "zolto",
    label: "Storefront checkout — Free",
    channel: "online",
    percent: 2.9,
    fixedChf: 0.3,
    platformPercent: pct(REVENUE_SHARE.freeBps),
    monthlyChf: 0,
    oneOffChf: 0,
    confidence: "verified",
    sourceId: "stripe-ch-pricing",
    caveat:
      "Stripe's domestic online rate plus Zolto's platform fee. On rate alone this is the most expensive row on the page — Zolto's online argument is what the store does, not what the transaction costs.",
  },
];

/**
 * Options whose price is a conversation rather than a number.
 *
 * These are kept as a first-class list rather than dropped, because "they won't
 * tell you until you ask" is itself a finding a buyer should weigh — and because
 * inventing a plausible figure for them would break the rule the rest of this
 * module is built on.
 */
export interface NegotiatedOffering {
  id: string;
  provider: Rate["provider"];
  label: string;
  channel: Channel;
  /** What is known, and what has to be negotiated. */
  detail: string;
  sourceId: string;
}

export const NEGOTIATED: NegotiatedOffering[] = [
  {
    id: "worldline-terminal",
    provider: "worldline",
    label: "Countertop and portable terminals",
    channel: "in-person",
    detail:
      "Interchange++ pricing, negotiated per merchant, with the terminal bought or rented on a contract that is typically multi-year.",
    sourceId: "moneyland-merchant-fees",
  },
  {
    id: "worldline-saferpay",
    provider: "worldline",
    label: "Saferpay online gateway",
    channel: "online",
    detail:
      "A gateway fee (Go CHF 9.95 / Easy CHF 19.95 / Flex CHF 39.95 per month, plus a one-time CHF 49–299) on top of acquiring, which is negotiated separately. Saferpay is a checkout for a site you build; it is not a shop.",
    sourceId: "worldline-saferpay-prices",
  },
];

export interface BasketCost {
  rate: Rate;
  /** What the payment company takes, in CHF. */
  acquirerChf: number;
  /** What Zolto adds, in CHF. Zero for every competitor and in person. */
  platformChf: number;
  /** The two above, rounded to whole cents. */
  totalChf: number;
  /** Total as a percentage of the basket, to two decimals. */
  effectivePct: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * What one basket of `chf` costs on `rate`.
 *
 * `monthlyChf` is deliberately NOT amortised in here. A monthly fee spread over
 * an unknown number of sales is a number we'd be choosing rather than reporting,
 * and the choice would decide the winner — SumUp Payments Plus is the cheapest
 * row per transaction and the most expensive one in a quiet month. The monthly
 * cost is carried on the rate and shown beside the per-sale figure so the reader
 * does that arithmetic against their own volume.
 */
export function costOfBasket(chf: number, rate: Rate): BasketCost {
  const basket = Number.isFinite(chf) && chf > 0 ? chf : 0;
  const acquirer = (basket * rate.percent) / 100 + (basket > 0 ? rate.fixedChf : 0);
  const platform = (basket * rate.platformPercent) / 100;
  const total = acquirer + platform;
  return {
    rate,
    acquirerChf: cents(acquirer),
    platformChf: cents(platform),
    totalChf: cents(total),
    effectivePct: basket > 0 ? cents((total / basket) * 100) : 0,
  };
}

/**
 * Every rate on one basket, cheapest first.
 *
 * Sorted by cost rather than by provider, and Zolto is not pinned to the top —
 * see the module comment. `costOfAcceptance.test.ts` asserts a competitor wins
 * the in-person table, so a future edit can't quietly reorder it.
 */
export function basketTable(
  chf: number = BASKET_EXAMPLE_CHF,
  channel?: Channel,
): BasketCost[] {
  return RATES.filter((r) => !channel || r.channel === channel)
    .map((r) => costOfBasket(chf, r))
    .sort((a, b) => a.totalChf - b.totalChf);
}

/** A single rate by id, throwing if it doesn't exist (see sources.ts on why). */
export function rate(id: string): Rate {
  const found = RATES.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown rate id: ${id}`);
  return found;
}

/** Every rate and negotiated offering a given provider has, in table order. */
export function ratesFor(provider: Rate["provider"]): Rate[] {
  return RATES.filter((r) => r.provider === provider);
}

export function negotiatedFor(
  provider: Rate["provider"],
): NegotiatedOffering[] {
  return NEGOTIATED.filter((n) => n.provider === provider);
}

/**
 * The volume at which SumUp's Payments Plus subscription pays for itself against
 * its own pay-as-you-go rates — the number that decides whether Zolto's card
 * pricing is competitive for a given maker.
 *
 * Computed rather than quoted, so it moves if any of the three rates do.
 */
export function sumUpPlusBreakEvenChf(payAsYouGoRateId: string): number {
  const plus = rate("sumup-payments-plus");
  const payg = rate(payAsYouGoRateId);
  const saved = (payg.percent - plus.percent) / 100;
  if (saved <= 0) return Infinity;
  return Math.round(plus.monthlyChf / saved / 100) * 100;
}
