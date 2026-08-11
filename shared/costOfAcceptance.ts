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
  /**
   * Published, but ambiguous or of doubtful currency — the caveat says how,
   * and the UI marks the row so a reader can weigh it.
   *
   * No rate currently uses this. That is the mechanism working rather than
   * dead code: the Swiss-card bucket shipped as two `unverified` rows for
   * exactly as long as it took to get an answer out of Stripe, and the next
   * figure we can't pin down needs the same escape hatch. Do not remove it to
   * tidy up — removing it means the only options are "publish a guess as
   * fact" or "publish nothing", which is the choice this module exists to
   * avoid.
   */
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
      "This is the merchant's own TWINT QR: the money never passes through Stripe or Zolto, and the sale is recorded in the register rather than captured by it.",
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
    // **Confirmed August 2026: Swiss-issued cards bill at Stripe's non-EEA
    // rate.** This used to be two rows — an optimistic 1.4% and a pessimistic
    // 2.9% — both published as unverified because Stripe does not state the
    // answer and guessing would have been choosing a number rather than
    // reporting one. The owner confirmed the pessimistic reading, so the
    // optimistic row is gone rather than kept as a hopeful footnote.
    //
    // The consequence is worth stating plainly, because several claims across
    // the site now depend on it: at 2.9% + CHF 0.20, taking a card through
    // Zolto is the MOST expensive in-person option on the comparison — dearer
    // even than a SumUp credit-card sale. TWINT, at 1.30%, is the second
    // cheapest way a Swiss maker can be paid at all, and the cheapest with no
    // monthly fee. That is the argument in person now.
    id: "zolto-card",
    provider: "zolto",
    label: "Tap to Pay — card",
    channel: "in-person",
    percent: 2.9,
    // Stripe's CHF 0.10 per transaction, plus CHF 0.10 per Tap to Pay
    // authorisation.
    fixedChf: 0.2,
    platformPercent: pct(REVENUE_SHARE.inPersonBps),
    monthlyChf: 0,
    oneOffChf: 0,
    confidence: "verified",
    sourceId: "stripe-ch-pricing",
    caveat:
      "Swiss-issued cards fall in Stripe's non-EEA bucket, confirmed with Stripe. Zolto adds nothing on top — this is Stripe's rate — but it makes cards the dearest way to take a payment at your stall. If your customer offers TWINT, take it: same register, same tap, less than half the cost.",
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
  const acquirer =
    (basket * rate.percent) / 100 + (basket > 0 ? rate.fixedChf : 0);
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

export interface MonthlyStack {
  salesChf: number;
  /** How many orders that volume implies at the given average basket. */
  orders: number;
  /** What the payment processor takes across the month. */
  processorChf: number;
  /** What Zolto's platform fee takes across the month. */
  platformChf: number;
  /** The plan's monthly subscription. */
  subscriptionChf: number;
  /** Everything that leaves — processor + platform + subscription. */
  totalChf: number;
  /** What's left of the sales after all of it. */
  keepChf: number;
  /** Total cost as a percentage of sales. */
  effectivePct: number;
}

/**
 * A whole month of online selling, with every party that takes a cut named.
 *
 * `monthlyCostAt` in shared/platform.ts answers "what will Zolto invoice me",
 * which is a real question and the one the fee calculator used to answer on its
 * own. This answers the question a maker was actually asking — "of the CHF 2,000
 * I sold, how much do I keep" — and the difference between the two is the entire
 * finding of the pricing review.
 *
 * An average basket is required rather than assumed because Stripe's fixed
 * CHF 0.30 per order can't be spread over a month's volume without knowing how
 * many orders it was. Thirty CHF-20 orders and three CHF-200 ones cost very
 * different amounts to accept, and picking a default silently would decide that
 * for the reader.
 */
export function monthlyStack(
  salesChf: number,
  avgOrderChf: number,
  plan: "free" | "pro",
): MonthlyStack {
  const sales = Number.isFinite(salesChf) && salesChf > 0 ? salesChf : 0;
  const avg =
    Number.isFinite(avgOrderChf) && avgOrderChf > 0
      ? avgOrderChf
      : BASKET_EXAMPLE_CHF;
  const r = rate(plan === "pro" ? "zolto-online-pro" : "zolto-online-free");

  const orders = sales > 0 ? Math.max(1, Math.round(sales / avg)) : 0;
  const processor = (sales * r.percent) / 100 + orders * r.fixedChf;
  const platform = (sales * r.platformPercent) / 100;
  // Owed whether or not anything sold — that's what a subscription is, and
  // it's the reason Pro loses to Free in a quiet month.
  const subscription = r.monthlyChf;
  const total = processor + platform + subscription;

  return {
    salesChf: cents(sales),
    orders,
    processorChf: cents(processor),
    platformChf: cents(platform),
    subscriptionChf: cents(subscription),
    totalChf: cents(total),
    keepChf: cents(sales - total),
    effectivePct: sales > 0 ? cents((total / sales) * 100) : 0,
  };
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
