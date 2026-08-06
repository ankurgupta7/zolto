/**
 * The citation registry — every third-party figure on the marketing surface
 * points at a row in here.
 *
 * Why this exists: the marketing surface used to carry a standing rule that it
 * would quote no competitor pricing at all, on the grounds that any figure would
 * be stale and unverifiable the day it shipped. That rule was right about the
 * failure mode and wrong about the remedy — it left the comparison pages unable
 * to say the single most useful thing a buyer needs, and it left our own
 * "a year with the old guard" figure sitting on the page with no basis at all.
 *
 * The remedy is not silence, it's provenance. A figure may be published if, and
 * only if, it names where it came from and when it was read. `retrievedOn` is the
 * load-bearing field: it converts "this is true" into "this was true on this date,
 * here's where to check", which is a claim that ages honestly instead of rotting.
 *
 * `note` is for a source that is itself suspect — a price list with an old date on
 * it, a rate the provider doesn't publish. It renders. A caveat we knew about and
 * didn't show is worse than no citation.
 */

export interface Source {
  /** Stable id referenced by rates, comparison rows and competitor entries. */
  id: string;
  /** How the source is named on the page. */
  label: string;
  url: string;
  /** ISO date (YYYY-MM-DD) the figure was read from the source. */
  retrievedOn: string;
  /** Anything that makes the source weaker than it looks. Rendered, not hidden. */
  note?: string;
}

/** The date the August 2026 pricing review read every source below. */
const REVIEWED = "2026-08-06";

export const SOURCES: Source[] = [
  // ---- Zolto's own rails -------------------------------------------------
  {
    id: "stripe-ch-pricing",
    label: "Stripe — Pricing & fees (Switzerland)",
    url: "https://stripe.com/ch/pricing",
    retrievedOn: REVIEWED,
    note: "Stripe publishes an EEA and a non-EEA in-person bucket without saying which one Swiss-issued cards fall into. Confirmed with Stripe in August 2026: Swiss cards bill at the non-EEA rate, so that is the only figure we publish.",
  },
  {
    id: "twint-merchant-fees",
    label: "TWINT — Merchant fees",
    url: "https://www.twint.ch/en/business-customers/twint-fees/",
    retrievedOn: REVIEWED,
  },

  // ---- SumUp -------------------------------------------------------------
  {
    id: "sumup-pos-lite",
    label: "SumUp — POS Lite",
    url: "https://www.sumup.com/en-us/pos/pos-lite/",
    retrievedOn: REVIEWED,
  },
  {
    id: "sumup-item-catalogue",
    label: "SumUp — Item catalogue (help centre)",
    url: "https://help.sumup.com/en-GB/articles/1ZHM8V5zKlAdEriUqiXwHu-item-catalogue",
    retrievedOn: REVIEWED,
  },
  {
    id: "sumup-inventory",
    label: "SumUp — Manage my inventory (help centre)",
    url: "https://help.sumup.com/en-US/articles/WcT1PpyBZHREhzgn7Wstl-manage-inventory",
    retrievedOn: REVIEWED,
  },
  {
    id: "sumup-cbi-register",
    label: "Central Bank of Ireland register — SumUp Limited",
    url: "http://registers.centralbank.ie/FirmRegisterDataPage.aspx?firmReferenceNumber=C195030&register=63",
    retrievedOn: REVIEWED,
  },

  // ---- Worldline ---------------------------------------------------------
  {
    id: "worldline-tap-on-mobile",
    label: "Worldline — Tap on Mobile (Switzerland)",
    url: "https://worldline.com/en-ch/campaigns/ms/worldline-tap-on-mobile",
    retrievedOn: REVIEWED,
  },
  {
    id: "worldline-saferpay-prices",
    label: "Worldline — Saferpay price list (Switzerland)",
    url: "https://support.worldline.com/content/dam/support-worldline/local/en-ch/documents/flyers/110023002-ds-saferpay-price-list-che-en-opt.pdf",
    retrievedOn: REVIEWED,
    note: "The PDF itself is dated 09.2022. Treat the figures as indicative until Worldline confirms they are current.",
  },
  {
    id: "worldline-sp-downgrade",
    label:
      "S&P Global Ratings — Worldline S.A. downgraded to 'BB', outlook negative (22 Aug 2025)",
    url: "https://investors.worldline.com/content/dam/investors-worldline-com/assets/documents/regulated-information/dept-and-rating/ratings-direct-research-update-worldline-s-a-downgraded-to-bb-following-weaker-than-expected-operating-performance-outlook-negative-3429307-aug-22-2025.pdf",
    retrievedOn: REVIEWED,
  },
  {
    id: "six-worldline-participation",
    label: "SIX Group — Update on the Worldline participation (6 Nov 2025)",
    url: "https://www.six-group.com/en/newsroom/media-releases/2025/20251106-worldline-participation.html",
    retrievedOn: REVIEWED,
  },

  // ---- Swiss market context ---------------------------------------------
  {
    id: "moneyland-merchant-fees",
    label: "moneyland.ch — Card payment merchant fees",
    url: "https://www.moneyland.ch/en/card-payment-merchant-fees",
    retrievedOn: REVIEWED,
  },
  {
    id: "payrexx-tap-to-pay-2026",
    label: "Payrexx — Tap to Pay in Switzerland, 2026 comparison",
    url: "https://payrexx.com/en-ch/guides/tap-to-pay-smartphone-terminal-switzerland-comparison",
    retrievedOn: REVIEWED,
  },
];

const BY_ID = new Map(SOURCES.map((s) => [s.id, s]));

/**
 * Resolve a source id, throwing if it doesn't exist.
 *
 * Deliberately throws rather than returning undefined, matching
 * `segmentFeatures()` in shared/segments.ts: a citation that silently
 * disappears leaves a figure on the page with nothing behind it, which is the
 * exact state this module was built to end. Fail at the test, not in front of a
 * reader.
 */
export function source(id: string): Source {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown source id: ${id}`);
  return found;
}

/** Resolve several ids at once, preserving order. */
export function sources(ids: readonly string[]): Source[] {
  return ids.map(source);
}
