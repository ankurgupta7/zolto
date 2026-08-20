/**
 * Audience segments — one page per kind of seller Gwinn is actually built for.
 *
 * Gwinn's audience has always been stated as a list ("makers, artisans, and
 * small shop owners — people who sell at craft fairs, markets, and pop-ups"),
 * but the marketing surface addressed all of them with one generic landing page.
 * Someone asking "is this any good for a ceramics studio?" — or an AI assistant
 * asked the same thing — had nothing specific to read.
 *
 * Grounding rule: each segment names the features that matter to it **by id**
 * from FEATURES in ./platform, never by retyping a capability. A segment page
 * therefore cannot promise something Gwinn doesn't ship, and a test asserts every
 * id still resolves. Copy that drifts from the product is worse than no page.
 */

import { BRAND } from "./brand";
import { FEATURES, type PlatformFeature } from "./platform";

export interface Segment {
  /** URL slug: /for/<id>. */
  id: string;
  /** Plural noun for this audience, e.g. "Jewelry makers". */
  name: string;
  headline: string;
  /** Who this is, in one sentence. */
  summary: string;
  /** What actually makes selling hard for them today. */
  painPoints: string[];
  /** Feature ids from FEATURES, most relevant first. */
  featureIds: string[];
  /** A concrete situation this audience will recognise. */
  scenario: string;
}

export const SEGMENTS: Segment[] = [
  {
    id: "jewelry-makers",
    name: "Jewelry makers",
    headline: "For jewelry makers selling one-of-a-kind pieces",
    summary:
      "You make pieces one at a time, often the only one of its kind, and sell them at markets, through Instagram, and to people who find you by word of mouth.",
    painPoints: [
      "Every piece is a stock quantity of one, so the same necklace can be sold twice — once at the stall and once online — before either of you notices.",
      "Photographing small, shiny things well is genuinely hard, and a bad photo costs you the sale.",
      "Writing a description for every single piece is the job nobody has time for.",
    ],
    featureIds: [
      "pos-online-sync",
      "ai-photography",
      "ai-descriptions",
      "day-end-reconciliation",
    ],
    scenario:
      "A piece sells at a Saturday market. Before the customer has walked away, it's marked sold online too — so the person browsing your site from their sofa never adds it to a cart it can't leave.",
  },
  {
    id: "ceramics-and-pottery",
    name: "Ceramics studios",
    headline: "For ceramics studios with small, irregular batches",
    summary:
      "You fire in batches, quantities vary with what survives the kiln, and no two glazes come out quite the same.",
    painPoints: [
      "Stock changes in lumps after each firing, which rigid inventory grids handle badly.",
      "Batch variation means a listing photo is never exactly the piece being sold, and customers ask about it constantly.",
      "Studio time is the scarce resource — admin comes out of making hours.",
    ],
    featureIds: [
      "notebook-inventory",
      "import",
      "ai-support",
      "pos-online-sync",
    ],
    scenario:
      "You unload a kiln, photograph the shelf, and the catalogue updates from that one photo — names, prices and quantities — instead of you typing rows after hours.",
  },
  {
    id: "market-stalls",
    name: "Market and fair sellers",
    headline: "For sellers whose shop is a table, a van, or a weekend",
    summary:
      "You sell at craft fairs, Christmas markets and pop-ups, where the queue moves fast and the connection is whatever the venue has.",
    painPoints: [
      "Card terminals cost money up front and are one more thing to charge, carry and lose.",
      "At a busy stall there is no time to tag each sale to the right item.",
      "Whatever you sell on Saturday has to be reflected online by Sunday, and usually isn't.",
    ],
    featureIds: [
      "tap-to-pay",
      "day-end-reconciliation",
      "pos-online-sync",
      "payments",
    ],
    scenario: `You take payments all day by amount on the phone in your apron. That evening ${BRAND.name} emails what it thinks you sold; one tap confirms it and your online stock matches reality again.`,
  },
  {
    id: "boutiques",
    name: "Small boutiques",
    headline: "For small shops with a counter and a website to keep in step",
    summary:
      "You have a physical shop, a modest range of stock, and customers who look online before they visit — or visit before they buy online.",
    painPoints: [
      "The counter and the website are effectively two businesses that disagree about stock.",
      "Selling to customers in more than one language means writing everything twice.",
      "Answering the same questions about opening hours, sizing and shipping eats the day.",
    ],
    featureIds: [
      "pos-online-sync",
      "multilingual-listings",
      "ai-support",
      "storefront",
    ],
    scenario:
      "A customer messages in German asking whether something's in stock. The listing is already in German, the answer comes back without you, and the stock figure is the same one your register is using.",
  },
];

export function findSegment(id: string): Segment | undefined {
  return SEGMENTS.find((s) => s.id === id);
}

/**
 * Resolve a segment's feature ids to the real feature records. Throws on an
 * unknown id rather than silently dropping it — a segment page quietly missing
 * its main selling point is the failure mode worth making loud.
 */
export function segmentFeatures(segment: Segment): PlatformFeature[] {
  return segment.featureIds.map((id) => {
    const feature = FEATURES.find((f) => f.id === id);
    if (!feature) {
      throw new Error(
        `Segment "${segment.id}" references unknown feature id "${id}"`,
      );
    }
    return feature;
  });
}

/** Plain-text rendering for /llms.txt and the crawler-facing noscript block. */
export function renderSegmentText(segment: Segment): string {
  return [
    segment.headline,
    segment.summary,
    `Common problems: ${segment.painPoints.join(" ")}`,
    `How ${BRAND.name} helps: ${segmentFeatures(segment)
      .map((f) => `${f.name} — ${f.description}`)
      .join(" ")}`,
    segment.scenario,
  ].join(" ");
}
