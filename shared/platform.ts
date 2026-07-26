/**
 * Canonical facts about the Zolto platform — the single source of truth for the
 * marketing surface's SEO (JSON-LD), the /llms.txt + /llms-full.txt briefs, and
 * the platform MCP tools. Keep marketing copy that must stay consistent across
 * humans, search engines, LLMs, and agents here, not scattered across pages.
 */

export const PLATFORM = {
  name: "Zolto",
  tagline: "AI-run commerce for makers",
  /** One-liner used as the default meta description / llms.txt summary. */
  summary:
    "Zolto gives independent makers and artisans a point-of-sale and an online store that share one inventory — with an AI assistant that handles setup, product photos, listings, and support. Take payments on the phone you already own (contactless, Apple Pay / Google Pay, TWINT QR) — no card reader to buy — for a fraction of what legacy providers charge. Sell online and in person without managing technology.",
  /** Who it's for — used in schema audience + llms briefs. */
  audience:
    "Independent makers, artisans, and small shop owners — people who sell at craft fairs, markets, and pop-ups and want an online store without hiring a developer.",
  /** Free to start; paid plans from CHF 19/mo with a 14-day trial. */
  pricingSummary:
    "Free to start (no card required). Paid plans from CHF 19/month with a 14-day free trial. Month-to-month, cancel anytime.",
} as const;

export interface PlatformFeature {
  id: string;
  name: string;
  description: string;
}

/**
 * The full feature set an AI agent should be able to enumerate when a prospective
 * shop owner asks "what can this do?". Grounded in what the product actually ships.
 */
export const FEATURES: PlatformFeature[] = [
  {
    id: "pos-online-sync",
    name: "POS + online store, one inventory",
    description:
      "Sell at the market and online from the same catalogue. Stock syncs in real time with short-lived checkout holds, so you never double-sell a one-of-a-kind piece across channels.",
  },
  {
    id: "ai-photography",
    name: "AI product photography",
    description:
      "Take one rough phone photo; the AI restyles it into a clean product shot or an on-model lifestyle image — no photographer, model, or studio. Every AI-styled image is disclosed as such.",
  },
  {
    id: "ai-descriptions",
    name: "AI product descriptions",
    description:
      "Generate product titles and descriptions from a photo, in multiple languages (e.g. English + German), ready to edit for your voice.",
  },
  {
    id: "ai-support",
    name: "AI support assistant",
    description:
      "An AI chatbot answers customer questions (materials, shipping, sizing) and turns recurring requests into product improvements.",
  },
  {
    id: "multichannel-intake",
    name: "List products from WhatsApp, Slack, or Discord",
    description:
      "Send a photo and a price to a chat channel; the AI parses it and creates the listing — no admin screen required.",
  },
  {
    id: "import",
    name: "Bring your existing catalogue",
    description:
      "Import your products with CSV or bulk photo upload, so switching from another platform takes an afternoon, not a rebuild.",
  },
  {
    id: "tap-to-pay",
    name: "Tap to Pay — no card reader to buy",
    description:
      "Take contactless card, phone (Apple Pay / Google Pay) and TWINT QR payments on the phone you already own. Nobody inserts a card anymore — they tap — so there's no reader to buy, rent, or plug in.",
  },
  {
    id: "notebook-inventory",
    name: "Turn your notebook into a catalogue",
    description:
      "Keep stock however you already do — even handwritten in a diary. Snap a photo of your list and the AI reads it into a real catalogue: names, prices, and quantities, no rigid data entry.",
  },
  {
    id: "day-end-reconciliation",
    name: "Sell by amount, reconcile with AI",
    description:
      "Too busy at the stall to tag each sale? Just enter the amount and take the tap. At the end of the day Zolto emails its best guess at what you sold; one tap confirms it and the piece is marked sold across your store and POS at once.",
  },
  {
    id: "multilingual-listings",
    name: "Listings in every language you sell in",
    description:
      "The AI writes and translates your titles and descriptions, so you can sell in German, French, English and more without writing a word in a language you don't speak.",
  },
  {
    id: "payments",
    name: "Direct payments with Stripe",
    description:
      "Connect your own Stripe account; your customers pay straight into it. Zolto never touches your money.",
  },
  {
    id: "storefront",
    name: "Your own branded storefront",
    description:
      "A themed online store on your own subdomain or custom domain, with Swiss and EU shipping built in.",
  },
  {
    id: "ai-discovery",
    name: "Discoverable by AI assistants",
    description:
      "Every store ships an llms.txt and a Model Context Protocol (MCP) endpoint, so AI assistants and agents can find and recommend your products.",
  },
  {
    id: "insights",
    name: "AI sales & inventory insights",
    description:
      "Plain-language analysis of your catalogue and sales to spot best sellers and restock needs.",
  },
];

export interface PlatformPlan {
  id: "free" | "maker" | "studio" | "atelier";
  name: string;
  priceChf: number;
  blurb: string;
  cta: string;
  highlight?: boolean;
  features: string[];
  /**
   * AI photo credits granted with the plan each month (see AI_PHOTO_CREDITS).
   * Photo generation has a real per-image GPU cost, so it is metered rather
   * than bundled as "unlimited" — plans include a monthly bucket, and extra
   * images are pay-as-you-go.
   */
  includedPhotoCredits: number;
}

/**
 * Pricing tiers — the source of truth for both the marketing pricing page and
 * the machine-readable Offers (JSON-LD / MCP / llms). Prices are placeholders
 * pending the VAT-inclusive-vs-exclusive decision (business-plan §7.1).
 *
 * Packaging rule (honest-pricing-strategy.md): we never gate a feature that
 * costs us ~nothing to run. The whole commerce engine — unlimited products,
 * full POS, an online store, real-time inventory sync, AI *text* (descriptions
 * + translation), and one-click data export — is therefore on the Free plan.
 * Paid plans sell the things that carry a real *recurring* cost: a custom
 * domain + managed SSL, human support, more staff seats, an SLA. The one AI
 * feature with a real *per-use* cost, photo generation, is metered as an
 * add-on (AI_PHOTO_CREDITS) with a monthly bucket per plan — not sold as a
 * fictional "unlimited".
 */
export const PLANS: PlatformPlan[] = [
  {
    id: "free",
    name: "Free",
    priceChf: 0,
    blurb: "A complete store, not a demo.",
    cta: "Get started free",
    includedPhotoCredits: 0,
    features: [
      "Unlimited products",
      "Full POS — Tap to Pay, TWINT QR, cash",
      "Online store on a zolto.shop address",
      "Real-time POS ↔ online inventory sync",
      "AI descriptions & translation (fair use)",
      "CSV & photo bulk upload",
      "One-click full data export",
      "Community support",
    ],
  },
  {
    id: "maker",
    name: "Maker",
    priceChf: 19,
    blurb: "For solo makers going pro.",
    cta: "Start 14-day free trial",
    highlight: true,
    includedPhotoCredits: 10,
    features: [
      "Everything in Free",
      "Your own custom domain + managed SSL",
      'Your brand only — no "runs on Zolto"',
      "Human email support (next business day)",
      "3 staff seats",
      "10 AI photo credits / month included",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    priceChf: 49,
    blurb: "For small teams.",
    cta: "Start 14-day free trial",
    includedPhotoCredits: 40,
    features: [
      "Everything in Maker",
      "10 staff seats",
      "Advanced analytics",
      "Priority support (same day)",
      "Multi-currency checkout",
      "40 AI photo credits / month included",
    ],
  },
  {
    id: "atelier",
    name: "Atelier",
    priceChf: 99,
    blurb: "For growing brands.",
    cta: "Contact sales",
    includedPhotoCredits: 150,
    features: [
      "Everything in Studio",
      "20 staff seats",
      "API access + SSO",
      "Audit logs",
      "Dedicated support + SLA",
      "150 AI photo credits / month included",
    ],
  },
];

export function formatPrice(chf: number): string {
  return chf === 0 ? "CHF 0" : `CHF ${chf}`;
}

export interface PlatformAddOn {
  id: string;
  name: string;
  priceChf: number;
  /** Human-readable billing unit, e.g. "per image". */
  unit: string;
  blurb: string;
  points: string[];
}

/**
 * AI Photo Credits — the one AI feature metered per use, because image
 * generation costs Zolto real GPU money per image (unlike near-free text AI,
 * which is free within fair use on every plan). Pay-as-you-go and non-expiring,
 * so a maker only pays for images she actually generates — never a recurring
 * add-on fee that bills whether or not it's used. Decision + competitive
 * anchor: docs/planning/phase1/marketing/ai-photography-pitch.md.
 *
 * NOTE: CHF 1/image is the marketing anchor from that pitch; it must be
 * confirmed against Zolto's real per-image generation cost before launch.
 */
export const AI_PHOTO_CREDITS: PlatformAddOn = {
  id: "ai-photo-credits",
  name: "AI Photo Credits",
  priceChf: 1,
  unit: "per image",
  blurb:
    "Turn one rough phone photo into a clean catalogue shot or a full lifestyle image — no photographer, model, or studio.",
  points: [
    "CHF 1 per image, pay-as-you-go — buy credits and use them whenever.",
    "Credits never expire and there's no monthly commitment.",
    "Metered because image generation costs us real money per image — so you pay for images you actually make, not a fee that bills whether you use it or not.",
    "Every AI-styled image is disclosed as AI-generated.",
  ],
};

/**
 * The positioning thesis, as structured facts the marketing surface renders and
 * the llms/MCP briefs can quote. Zolto's stance: the legacy website + POS market
 * (Stripe, SumUp, Worldline) is previous-era software that overcharges small
 * merchants and upsells card-reader hardware — two shifts (AI setup, NFC phones +
 * QR payments) make that obsolete, so pricing is radically transparent.
 */
export const POSITIONING = {
  /** Legacy players Zolto positions against, named on the comparison. */
  incumbents: ["Stripe", "SumUp", "Worldline"] as const,
  /** The two shifts that make the old model obsolete. */
  shifts: [
    "With AI, a maker's whole store can be built in an afternoon, not weeks.",
    "Phones carry NFC chips and QR payments (TWINT) are everywhere — nobody inserts a card, they tap — so there's no reader to sell and server costs are tiny.",
  ] as const,
} as const;

/** The written pricing pledge — the emotional core of the positioning. */
export const PRICING_PROMISE = {
  headline: "We only make money when it's fair to.",
  pledge:
    "We will never charge you for anything that isn't charged to us. No card reader to buy. No lock-in. No surprises on the bill.",
  points: [
    "Your store, POS, catalogue and data export are free — we never charge for what costs us nothing to run.",
    "Extras with a real cost, like AI photo generation, are pay-as-you-go — never padded into a monthly fee you pay whether you use them or not.",
    "Your customers pay into your own Stripe account — we take 0% of your sales and never touch your money.",
    "If we ever stop being the honest, cheapest option for a maker your size, we've failed at our one job.",
  ],
} as const;

/**
 * The cost-disruption headline: a year on legacy tooling vs. a month on Zolto.
 * `usPerMonth` tracks the highlighted paid plan so it never drifts from PLANS.
 */
export const COST_COMPARISON = {
  themPerYearChf: 2000,
  themLabel: "A year with the old guard",
  themNote: "reader hardware · monthly fees · lock-in",
  usPerMonthChf: (PLANS.find((p) => p.highlight)?.priceChf ?? 19) as number,
  usLabel: "A month with Zolto",
  usNote: "no hardware · cancel anytime · your Stripe, your money",
  /** "one-hundredth the cost" framing. */
  multiplier: "one-hundredth the cost",
} as const;

export interface ComparisonRow {
  feature: string;
  them: string;
  us: string;
}

/** "What you're actually paying them for" — old guard vs. Zolto, row by row. */
export const INCUMBENT_COMPARISON: ComparisonRow[] = [
  {
    feature: "Card reader",
    them: "Sold to you, CHF 50–300+",
    us: "Your phone — NFC tap & TWINT QR",
  },
  {
    feature: "Building the store",
    them: "A developer, or weeks in Shopify",
    us: "AI drafts it in an afternoon",
  },
  {
    feature: "Inventory",
    them: "Rigid grids you maintain by hand",
    us: "Scan your notebook; the AI keeps it",
  },
  {
    feature: "Pricing",
    them: "Opaque tiers, surprise fees",
    us: "We never charge for what isn't charged to us",
  },
  {
    feature: "Your money",
    them: "Held, then paid out",
    us: "Straight into your own Stripe",
  },
];

export interface SellingStep {
  title: string;
  detail: string;
}

/**
 * The AI-native, ambiguity-tolerant selling loop — the flagship pillar.
 * Scan a messy notebook, sell by tapping, let the AI reconcile at day's end.
 */
export const SELLING_FLOW: SellingStep[] = [
  {
    title: "Scan your notebook",
    detail:
      "Photograph your handwritten stock list. The AI reads it into a real catalogue — names, prices, quantities.",
  },
  {
    title: "Tap to take payment",
    detail:
      "Enter an amount and let the customer tap their phone or card. NFC and TWINT QR — nothing to buy or plug in.",
  },
  {
    title: "Confirm at day's end",
    detail:
      "Zolto emails what it thinks you sold. Tap to confirm and stock syncs across your POS and online store.",
  },
];

export interface Faq {
  q: string;
  a: string;
}

/** Questions a prospective maker actually asks — feeds FAQPage schema + llms + MCP. */
export const FAQS: Faq[] = [
  {
    q: "What is Zolto?",
    a: "Zolto is an AI-run commerce platform for independent makers. It gives you a point-of-sale and an online store that share one inventory, plus an AI assistant that handles product photos, descriptions, and customer support.",
  },
  {
    q: "Who is Zolto for?",
    a: "Makers, artisans, and small shop owners who sell at craft fairs, markets, and pop-ups and want to sell online too — without hiring a developer or learning complex software.",
  },
  {
    q: "How long does it take to set up a store?",
    a: "About an afternoon. Upload a few products (or import a CSV), let the AI draft descriptions and style your photos, connect payments, and you can be live the same day.",
  },
  {
    q: "Do I need to be technical?",
    a: "No. Zolto is built for makers, not store managers. The AI does the setup busywork, and a guided tour walks you through the dashboard.",
  },
  {
    q: "How much does it cost?",
    a: "There's a free plan (no card required). Paid plans start at CHF 19/month for the Maker plan, with a 14-day free trial. Plans are month-to-month — cancel anytime.",
  },
  {
    q: "Can I sell both in person and online?",
    a: "Yes — that's the core of Zolto. One inventory powers both your point-of-sale and your online store, and stock stays in sync in real time so you never oversell.",
  },
  {
    q: "How do I get paid?",
    a: "You connect your own Stripe account and your customers pay directly into it. Zolto never holds your money.",
  },
  {
    q: "Do I need to buy a card reader?",
    a: "No — payments happen on the phone you already own, via the Zolto POS app (currently in pilot): contactless card, Apple Pay / Google Pay, and TWINT QR. Nobody inserts a card anymore, they tap, so there's no reader to buy, rent, or plug in.",
  },
  {
    q: "How is Zolto cheaper than Stripe, SumUp, or Worldline?",
    a: "Those tools were built for an era when websites were hard and a card reader was king, so they charge for hardware, setup, and lock-in — easily around CHF 2,000 a year. AI builds your store in an afternoon and your phone is the terminal, so the real cost is tiny. Zolto passes that saving on: paid plans start at CHF 19/month, roughly one-hundredth of the old way, and we never charge for anything that isn't charged to us.",
  },
  {
    q: "What if I keep my inventory in a notebook?",
    a: "That's fine — keep it however you already do. Snap a photo of your handwritten list and the AI reads it into a real catalogue (names, prices, quantities). AI is good with ambiguity, so you don't have to become an 'inventory person.'",
  },
  {
    q: "Do I have to tag every sale at a busy market?",
    a: "No. Just enter the amount and take the tap. At the end of the day Zolto emails its best guess at what you sold; you tap to confirm and each piece is marked sold across your store and POS automatically.",
  },
  {
    q: "Can I bring products from another platform?",
    a: "Yes. Import your catalogue with CSV or bulk photo upload, so switching from Shopify, Square, or a spreadsheet is quick.",
  },
  {
    q: "Will AI assistants be able to find my products?",
    a: "Yes. Every store publishes an llms.txt and a Model Context Protocol (MCP) endpoint, so AI assistants and agents can discover and recommend your products, alongside normal search-engine SEO.",
  },
  {
    q: "What about product photos?",
    a: "Take one rough phone photo and the AI restyles it into a clean product shot or an on-model image — no photographer or studio needed. AI-styled images are always disclosed.",
  },
];

/** The steps to open a store — used by the platform MCP `how_to_start` tool + llms. */
export const HOW_TO_START: string[] = [
  "Sign up free at /signup with your email — no card required.",
  "Add your first products by hand, by CSV import, or by sending photos to WhatsApp/Slack/Discord.",
  "Let the AI draft descriptions and restyle your product photos.",
  "Connect your Stripe account so customers pay directly into it.",
  "Share your storefront link — you're live, online and in person, from one inventory.",
];
