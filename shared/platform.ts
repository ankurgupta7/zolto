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
  /** Free in person forever; 1% on online/agent orders; Pro removes the fee. */
  pricingSummary:
    "Free to sell in person, forever (no card required). Online and AI-agent orders carry a 1% platform fee on the Free plan — a month with no online sales costs CHF 0. Pro is CHF 25/month with a 14-day free trial: 0% platform fee and unmetered AI. Month-to-month, cancel anytime.",
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
      "Connect your own Stripe account; your customers pay straight into it. Zolto never holds your money — on the Free plan a 1% platform fee applies to online and agent orders only, and in-person sales are always fee-free.",
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
  id: "free" | "pro";
  name: string;
  priceChf: number;
  blurb: string;
  cta: string;
  highlight?: boolean;
  features: string[];
  /**
   * Platform fee, in basis points, applied to ONLINE and AGENT-originated
   * orders via the Stripe Connect application fee on the tenant's direct
   * charge. In-person (POS) sales always carry 0 from Zolto, on every plan —
   * in-person is not our channel to tax.
   */
  onlineFeeBps: number;
  /**
   * AI photo generations included per month. `null` means unmetered (Pro).
   * We never meter AI *queries* — plans scale on products/photos/storage,
   * and the Free plan simply includes a monthly taste of photo generation.
   */
  aiPhotoAllowancePerMonth: number | null;
  /** Scale limits — the only dimensions plans meter on. */
  maxProducts: number;
  storageGb: number;
}

/** The platform revenue share ("the skim") — one source of truth for the fee. */
export const REVENUE_SHARE = {
  /** Fee on online + agent-originated orders for Free-plan tenants. */
  freeBps: 100, // 1%
  /** Pro removes the fee entirely. */
  proBps: 0,
  percentLabel: "1%",
  appliesTo: "online and AI-agent orders",
  /** In-person sales are never Zolto's to tax, on any plan. */
  inPersonBps: 0,
} as const;

/**
 * Pricing tiers — the source of truth for the marketing pricing page and the
 * machine-readable Offers (JSON-LD / MCP / llms). Two boxes only.
 *
 * Packaging rule (docs/planning/pricing-pivot-agent-commerce.md): in-person
 * commerce is free — the whole store, POS and inventory sync cost CHF 0/month
 * and Zolto adds nothing on in-person payments. We earn only on the
 * incremental online + agent sales we create: a 1% platform fee on the Free
 * plan, or a flat Pro subscription that removes it and unlocks unmetered AI.
 * Plans are metered on scale (products, photos, storage) — never on AI usage.
 */
export const PLANS: PlatformPlan[] = [
  {
    id: "free",
    name: "Free",
    priceChf: 0,
    blurb: "A complete store. Free in person, 1% online.",
    cta: "Get started free",
    onlineFeeBps: REVENUE_SHARE.freeBps,
    aiPhotoAllowancePerMonth: 5,
    maxProducts: 200,
    storageGb: 5,
    features: [
      "Full POS — Tap to Pay, TWINT QR, cash — CHF 0 on in-person sales",
      "Online store on a zolto.shop address",
      "Real-time POS ↔ online inventory sync",
      "AI descriptions & translation (fair use)",
      "5 AI photo shots / month",
      "Found by AI agents — llms.txt, MCP & store chat",
      "1% platform fee on online & agent orders only",
      "Up to 200 products · 5 GB photo storage",
      "One-click full data export",
      "Community support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceChf: 25,
    blurb: "For makers selling online every week.",
    cta: "Start 14-day free trial",
    highlight: true,
    onlineFeeBps: REVENUE_SHARE.proBps,
    aiPhotoAllowancePerMonth: null,
    maxProducts: 5000,
    storageGb: 50,
    features: [
      "Everything in Free",
      "0% platform fee — keep every online sale",
      "Unmetered AI — photos, descriptions, chat",
      "Your own custom domain + managed SSL",
      'Your brand only — no "runs on Zolto"',
      "Advanced analytics & AI insights",
      "3 staff seats",
      "Priority human support",
      "Up to 5,000 products · 50 GB photo storage",
    ],
  },
];

/** The Pro plan (highlighted tier) — single lookup used by fee math + upsell. */
export const PRO_PLAN = PLANS.find((p) => p.id === "pro")!;

/**
 * Monthly online sales volume (CHF) above which Pro's flat fee beats the
 * Free plan's 1% skim — the in-app upsell trigger. 25 / 1% = CHF 2,500.
 */
export const PRO_BREAK_EVEN_ONLINE_CHF = Math.round(
  PRO_PLAN.priceChf / (REVENUE_SHARE.freeBps / 10_000),
);

export function formatPrice(chf: number): string {
  return chf === 0 ? "CHF 0" : `CHF ${chf}`;
}

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
  headline: "You don't pay us until the internet pays you.",
  pledge:
    "Selling in person is free, forever — your store, POS and inventory cost CHF 0/month, and Zolto adds nothing on in-person payments. We only earn on the online and AI-agent sales we help create.",
  points: [
    "In person is free forever: full POS, inventory sync and your online storefront at CHF 0/month, with no Zolto fee on market-stall sales.",
    "Online and AI-agent orders carry a 1% platform fee on the Free plan — a month with no online sales costs you CHF 0.",
    "Pro (CHF 25/month) removes the 1% entirely and unlocks unmetered AI. Past roughly CHF 2,500/month online, Pro is the cheaper choice — we'll tell you in-app when you get there.",
    "We never meter AI queries. Plans scale on products, photos and storage — not on how often you talk to the AI.",
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
    us: "Free in person. 1% online, or flat CHF 25",
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
    a: "Selling in person is free, forever — the store, POS and inventory sync cost CHF 0/month and Zolto adds nothing on in-person payments. Online and AI-agent orders carry a 1% platform fee on the Free plan (a month with no online sales costs CHF 0). Pro is CHF 25/month with a 14-day free trial: it removes the 1% and unlocks unmetered AI. Month-to-month — cancel anytime.",
  },
  {
    q: "Can I sell both in person and online?",
    a: "Yes — that's the core of Zolto. One inventory powers both your point-of-sale and your online store, and stock stays in sync in real time so you never oversell.",
  },
  {
    q: "How do I get paid?",
    a: "You connect your own Stripe account and your customers pay directly into it — Zolto never holds your money. On the Free plan a 1% platform fee is taken automatically on online and AI-agent orders only; in-person sales are always fee-free, and Pro removes the fee entirely.",
  },
  {
    q: "Do I need to buy a card reader?",
    a: "No — payments happen on the phone you already own, via the Zolto POS app: contactless card, Apple Pay / Google Pay, and TWINT QR. Nobody inserts a card anymore, they tap, so there's no reader to buy, rent, or plug in.",
  },
  {
    q: "How is Zolto cheaper than Stripe, SumUp, or Worldline?",
    a: "Those tools were built for an era when websites were hard and a card reader was king, so they charge for hardware, setup, and lock-in — easily around CHF 2,000 a year. AI builds your store in an afternoon and your phone is the terminal, so the real cost is tiny. Zolto passes that saving on: selling in person is free, online orders carry just a 1% platform fee on the Free plan, and Pro is a flat CHF 25/month — roughly one-hundredth of the old way.",
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
