/**
 * Gwinn's first-party research — the pilot store's month-one numbers, as
 * structured data rather than prose.
 *
 * These figures already existed inside the Launch Diary narrative
 * (client/src/marketing/content/launchContent.ts). Buried in a story they read
 * as colour; stated with a methodology and a sample size they become something
 * another writer or an AI assistant can actually cite. Original research and
 * citable claims are among the strongest shared traits of pages that earn AI
 * referrals — see docs/planning/ai-traffic-alignment.md.
 *
 * Rules for anything added here:
 *   - Only numbers Gwinn actually measured. No projections, no illustrative
 *     figures, no rounding in our own favour.
 *   - State the sample. One store for one month is a small sample, and saying
 *     so is what makes the rest credible.
 *   - Keep it in sync with the diary posts, which narrate the same data.
 */

import { BRAND } from "./brand";
import { maker, RESEARCH_SLUG, RESEARCH_PUBLISHED } from "./marketing";

export interface ResearchMetric {
  label: string;
  value: string;
  /** What the number does and doesn't show. */
  note: string;
}

export interface ResearchTable {
  caption: string;
  head: string[];
  rows: string[][];
}

/**
 * Scope and limits, stated up front. A single pilot store is not a study; the
 * honest framing is "here is exactly what happened to one shop", which is still
 * more than most platforms publish.
 */
export const PILOT_METHODOLOGY = {
  title: "First month online: one maker's numbers",
  slug: RESEARCH_SLUG,
  /** ISO date the reporting period ended. */
  published: RESEARCH_PUBLISHED,
  sample: `One pilot store — ${maker.founder ? `${maker.brand}, a pearl-jewelry maker in ${maker.city}` : `a pearl-jewelry maker in ${maker.city}`} — over the first 30 days after its ${BRAND.name} storefront went live.`,
  collection:
    `Order and traffic figures are taken from the store's own ${BRAND.name} dashboard over the period; offline sales are the merchant's own count. Nothing is modelled or extrapolated.`,
  limits: [
    "A single store in a single category (handmade jewelry) in a single city. These numbers describe what happened to one shop, not what will happen to yours.",
    "One month is short. Month-one traffic is inflated by a launch announcement and by an existing Instagram following, neither of which repeats.",
    "The merchant already had in-person customers. A maker starting with no audience should expect a different shape.",
    `${BRAND.name} operates the platform these numbers come from, so treat them as a vendor-published case, and weigh them accordingly.`,
  ],
} as const;

/** The headline figures. */
export const PILOT_METRICS: ResearchMetric[] = [
  {
    label: "Online orders, month one",
    value: "12",
    note: "From a standing start — the store had no online sales channel before launch.",
  },
  {
    label: "Average online order value",
    value: "CHF 61",
    note: "Ranged from CHF 52 in the quiet second week to CHF 71 in the fourth.",
  },
  {
    label: "Online conversion rate",
    value: "2.5%",
    note: "12 orders from 481 visitors across the month.",
  },
  {
    label: "Total sales, before → after",
    value: "60 → 67 / month",
    note: "Offline dipped slightly (~60 → ~55) as some regulars shifted online, so the net gain is smaller than the online figure alone suggests.",
  },
  {
    label: "Channel mix after one month",
    value: "82% in person / 18% online",
    note: "In-person selling remained the larger channel throughout.",
  },
  {
    label: "Questions resolved by the AI assistant",
    value: "81%",
    note: "Share of customer questions answered without the merchant stepping in.",
  },
];

export const PILOT_WEEKLY: ResearchTable = {
  caption: "Online orders, order value and traffic by week",
  head: ["Week", "Online orders", "Avg order value", "Visitors"],
  rows: [
    ["Week 1 (launch)", "3", "CHF 58", "156"],
    ["Week 2", "2", "CHF 52", "89"],
    ["Week 3", "4", "CHF 71", "134"],
    ["Week 4", "3", "CHF 62", "102"],
    ["Month total", "12", "CHF 61", "481"],
  ],
};

export const PILOT_SOURCES: ResearchTable = {
  caption: "Where the online orders came from",
  head: ["Source", "Orders", "% of online sales"],
  rows: [
    ["Instagram (organic)", "7", "58%"],
    ["Direct / returning", "3", "25%"],
    ["Word of mouth (shared links)", "2", "17%"],
    ["Search / Google", "0", "0%"],
  ],
};

/**
 * The finding worth stating plainly, including the uncomfortable one: search
 * sent nothing in month one. Publishing the zero is the reason the other rows
 * are worth believing.
 */
export const PILOT_FINDINGS: string[] = [
  "An existing audience did the work. 58% of online orders came from the maker's own Instagram following — the storefront converted attention she already had rather than creating new demand.",
  "Search sent zero orders in month one. A new store has no search authority yet; anyone promising otherwise is selling something.",
  "Online did not simply add to offline. Some regulars moved online, so 12 online orders produced a net gain of 7 sales, not 12.",
  "Order value held up online. The CHF 61 online average was in line with in-person selling, so the channel didn't discount the work.",
  "The AI assistant absorbed most support. 81% of customer questions were resolved without the merchant answering them.",
];

/** Plain-text rendering for /llms.txt and the crawler-facing noscript block. */
export function renderPilotResearchText(): string {
  const metrics = PILOT_METRICS.map(
    (m) => `${m.label}: ${m.value} (${m.note})`,
  ).join(" ");
  return [
    PILOT_METHODOLOGY.title,
    `Sample: ${PILOT_METHODOLOGY.sample}`,
    `Method: ${PILOT_METHODOLOGY.collection}`,
    metrics,
    `Findings: ${PILOT_FINDINGS.join(" ")}`,
    `Limits: ${PILOT_METHODOLOGY.limits.join(" ")}`,
  ].join(" ");
}
