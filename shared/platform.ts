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
      // Storefronts live on subdomains of the platform root, which is derived
      // from PUBLIC_BASE_URL (server/_core/platformDomain.ts) and is zolto.ch
      // in every deploy. This once named a different domain the platform does
      // not serve; because FEATURES feeds the pricing card, /llms.txt AND the
      // MCP tools, that pointed humans and AI agents alike at an address which
      // resolved to nothing. Only ever name a domain Zolto actually answers on
      // — platformDomains.test.ts enforces it.
      "Online store on your own zolto.ch address",
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

/** The Free plan — the tier the zero-cost POS claim is sourced from. */
export const FREE_PLAN = PLANS.find((p) => p.id === "free")!;

/**
 * Monthly online sales volume (CHF) above which Pro's flat fee beats the
 * Free plan's 1% skim — the in-app upsell trigger. 25 / 1% = CHF 2,500.
 */
export const PRO_BREAK_EVEN_ONLINE_CHF = Math.round(
  PRO_PLAN.priceChf / (REVENUE_SHARE.freeBps / 10_000),
);

export interface MonthlyCostBreakdown {
  /** The input, echoed back after clamping to a sane range. */
  onlineSalesChf: number;
  /** What the Free plan's percentage fee comes to, in CHF. */
  freePlanChf: number;
  /** What Pro costs — a flat subscription, with no fee on top. */
  proPlanChf: number;
  /** Which plan is cheaper at this volume. */
  cheaper: "free" | "pro" | "tie";
  /** How much the cheaper plan saves per month, in CHF. */
  savingChf: number;
}

/**
 * What a month actually costs on each plan at a given online sales volume.
 *
 * In-person sales are deliberately not a parameter: they are free on every
 * plan, so they can never change the answer. Keeping them out of the signature
 * means the calculator can't accidentally imply otherwise.
 *
 * Rounded to cents so the UI never renders a figure it would then have to
 * re-round, and so "is Pro cheaper?" is decided on the same numbers the
 * merchant is shown rather than on hidden precision.
 */
export function monthlyCostAt(onlineSalesChf: number): MonthlyCostBreakdown {
  const sales = Number.isFinite(onlineSalesChf)
    ? Math.max(0, onlineSalesChf)
    : 0;
  const toCents = (n: number) => Math.round(n * 100) / 100;

  const freePlanChf = toCents(sales * (REVENUE_SHARE.freeBps / 10_000));
  const proPlanChf = toCents(
    PRO_PLAN.priceChf + sales * (REVENUE_SHARE.proBps / 10_000),
  );

  const cheaper =
    freePlanChf === proPlanChf
      ? "tie"
      : freePlanChf < proPlanChf
        ? "free"
        : "pro";

  return {
    onlineSalesChf: sales,
    freePlanChf,
    proPlanChf,
    cheaper,
    savingChf: toCents(Math.abs(freePlanChf - proPlanChf)),
  };
}

export function formatPrice(chf: number): string {
  return chf === 0 ? "CHF 0" : `CHF ${chf}`;
}

/**
 * What each plan unlocks, as booleans the code can gate on — the machine-readable
 * counterpart to each plan's `features` copy above.
 *
 * This lives in shared/ rather than on the server because BOTH planes need it.
 * It used to live only in server/_core/trpc.ts, so every admin screen re-derived
 * the same rule by hand — `Billing.tsx` called its copy "mirrors PLAN_FEATURES"
 * in a comment. Mirrors rot silently: when the four-tier model collapsed to
 * Free/Pro, `Domain.tsx` was still gating on a Set of the retired tier names, so
 * it matched no plan at all and showed paying Pro merchants an upsell for the
 * custom domain they had already bought. One object, read by the gate and the
 * enforcement alike, is what stops that recurring.
 *
 * Scale limits (maxProducts, storageGb, aiPhotoAllowancePerMonth) are NOT
 * duplicated here — PLANS owns those. The 1% online/agent fee is owned by
 * PLANS[].onlineFeeBps and applied in checkoutSession.ts, not gated here.
 */
export const PLAN_FEATURES = {
  // Free: the whole commerce engine — store, full POS, inventory sync, the
  // agent layer (llms.txt/MCP/chat, the discovery wedge) and a taste of AI.
  // Monetized via the 1% fee on online/agent orders, not by gating.
  free: {
    maxStaff: 1,
    customDomain: false,
    whiteLabel: false,
    analytics: "basic",
    multiCurrency: false,
    prioritySupport: false,
    pos: true,
    onlineStore: true,
  },
  // Pro (CHF 25/mo): removes the 1% fee, unmetered AI, and everything a
  // maker selling online every week needs — domain, team, analytics, support.
  pro: {
    maxStaff: 3,
    customDomain: true,
    whiteLabel: true,
    analytics: "advanced",
    multiCurrency: true,
    prioritySupport: true,
    pos: true,
    onlineStore: true,
  },
} as const;

/**
 * A plan's storage allowance in bytes, from the GB figure on its pricing card.
 *
 * Binary GB (1024³) to match how object sizes are reported, so "5 GB" on the
 * card and the number the quota compares against are the same quantity.
 */
export function storageBytesForPlan(plan: string): number {
  const p =
    PLANS.find((x) => x.id === plan) ?? PLANS.find((x) => x.id === "free")!;
  return p.storageGb * 1024 * 1024 * 1024;
}

export type PlanId = keyof typeof PLAN_FEATURES;
export type PlanFeature = keyof typeof PLAN_FEATURES.free;

/**
 * Features for a plan id that may have come from the database or a URL, where
 * a retired id (maker/studio/atelier) or nonsense can still show up. Falls back
 * to Free rather than throwing: under-granting a feature is recoverable, and
 * silently treating an unknown plan as Pro would give away paid features.
 */
export function featuresForPlan(plan: string): (typeof PLAN_FEATURES)[PlanId] {
  return PLAN_FEATURES[plan as PlanId] ?? PLAN_FEATURES.free;
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
    "Selling in person is free, forever — your store, POS and inventory cost CHF 0/month, and Zolto adds nothing on in-person payments. Here's the honest version: we already have enough money. We're not here to skim off small makers — we're here to help you keep what you earn, and that's not changing.",
  points: [
    "Sell at the market and pay us nothing, forever: full POS, inventory sync and your online storefront, all included at CHF 0/month.",
    "Online and AI-agent orders carry a 1% fee on the Free plan. No online sales this month? You pay CHF 0. That's it.",
    "Pro (CHF 25/month) kills the 1% fee entirely and unlocks unmetered AI. Selling past roughly CHF 2,500/month online? Pro's cheaper — we'll tell you in-app the moment it's worth switching.",
    "We'll never nickel-and-dime your AI usage. Talk to it as much as you want — plans scale on products, photos and storage, not on how chatty you get.",
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

/**
 * The zero-cost phone POS — the headline differentiator.
 *
 * The claim is deliberately scoped to what Zolto ships rather than to what
 * anyone else doesn't: every line here is checkable against FREE_PLAN, and the
 * tests pin it there. A blanket "nobody else does this" would be a claim about
 * every competitor's current tier in every country, which is unverifiable the
 * day it's written and stale the week after — the same reasoning that keeps
 * COMPETITORS free of pricing (see below).
 *
 * What makes it land is that it's specific and falsifiable: a full till, with
 * photos, names and prices, at CHF 0/month, with no clock on it.
 */
export const ZERO_COST_POS = {
  eyebrow: "the bit people re-read",
  /**
   * Split so the hand-drawn underline can hug the punchline. Underlining the
   * whole sentence leaves the stroke trailing off across the column once the
   * headline wraps, which reads as a rendering fault rather than a flourish.
   */
  headline: "A whole shop in your pocket.",
  headlineEmphasis: "For nothing.",
  body: "Photos, names, prices, stock counts — your actual catalogue, in the till on your phone. Tap to take the payment. Watch it sync to your website. Then pay us CHF 0.00 at the end of the month, and again the month after that.",
  /** Each item must be true of the Free plan — asserted in platform.test.ts. */
  includes: [
    "Full POS — Tap to Pay, TWINT QR and cash",
    "Every piece with its photo, name and price",
    "Real-time POS ↔ online inventory sync",
    "Your online storefront, on your own zolto.ch address",
  ],
  /** The catch, stated before anyone has to ask what it is. */
  catch:
    "No trial clock. No starter tier that quietly expires. The only thing we ever charge for is the online sales we bring you — and if there aren't any, there's nothing to charge.",
} as const;

export interface ComparisonRow {
  feature: string;
  them: string;
  us: string;
}

/** "What you're actually paying them for" — old guard vs. Zolto, row by row. */
export const INCUMBENT_COMPARISON: ComparisonRow[] = [
  {
    // The headline row, first on purpose — see ZERO_COST_POS. Phrased as a
    // difference in *model* (what's bundled into a paid tier vs. what's free),
    // which is checkable, rather than as a price claim about any one company.
    feature: "Your catalogue on your phone",
    them: "Part of a paid tier, or a separate product entirely",
    us: "Photos, names & prices — CHF 0/month, no clock on it",
  },
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

/**
 * The card-reader joke, with its numbers pinned to real ones.
 *
 * `anchorChf` is the top of the hardware range already quoted in
 * INCUMBENT_COMPARISON — the gag re-spends a figure the page has already
 * stated rather than inventing a new claim about anyone's pricing. The
 * punchline (a year of Pro for the same money) is computed, not written down,
 * so it stays true if the plan price ever moves.
 *
 * Deliberately no competitor is named in the items: this riffs on what CHF 300
 * of hardware is worth, not on what any particular company charges.
 */
export const CARD_READER_GAG = {
  anchorChf: 300,
  items: [
    "Roughly sixty flat whites.",
    "A really good pair of flush cutters, and the case.",
    "A season of stall fees, depending on the market.",
  ],
  /** Months of Pro the same money buys — the punchline. */
  get proMonths(): number {
    return Math.floor(this.anchorChf / PRO_PLAN.priceChf);
  },
} as const;

export interface SellingStep {
  title: string;
  detail: string;
  /**
   * When in a market day this step happens — the anchor the landing page's
   * scroll-through "day in the life" sequence is pegged to. Lives here rather
   * than in the component so the narrative order and the copy stay in one
   * place.
   */
  timeOfDay: string;
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
    timeOfDay: "07:40 — stall going up",
  },
  {
    title: "Tap to take payment",
    detail:
      "Enter an amount and let the customer tap their phone or card. NFC and TWINT QR — nothing to buy or plug in.",
    timeOfDay: "11:15 — first rush",
  },
  {
    title: "Confirm at day's end",
    detail:
      "Zolto emails what it thinks you sold. Tap to confirm and stock syncs across your POS and online store.",
    timeOfDay: "18:30 — packing up",
  },
];

/** Grouping for the /faq page. Order here is the order sections render in. */
export const FAQ_CATEGORIES = [
  "About Zolto",
  "Getting started",
  "Selling",
  "Pricing & billing",
  "AI & discovery",
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export interface Faq {
  q: string;
  a: string;
  category: FaqCategory;
}

/** Questions a prospective maker actually asks — feeds FAQPage schema + llms + MCP. */
export const FAQS: Faq[] = [
  {
    category: "About Zolto",
    q: "What is Zolto?",
    a: "Zolto is an AI-run commerce platform for independent makers. It gives you a point-of-sale and an online store that share one inventory, plus an AI assistant that handles product photos, descriptions, and customer support.",
  },
  {
    category: "About Zolto",
    q: "Who is Zolto for?",
    a: "Makers, artisans, and small shop owners who sell at craft fairs, markets, and pop-ups and want to sell online too — without hiring a developer or learning complex software.",
  },
  {
    category: "Getting started",
    q: "How long does it take to set up a store?",
    a: "About an afternoon. Upload a few products (or import a CSV), let the AI draft descriptions and style your photos, connect payments, and you can be live the same day.",
  },
  {
    category: "Getting started",
    q: "Do I need to be technical?",
    a: "No. Zolto is built for makers, not store managers. The AI does the setup busywork, and a guided tour walks you through the dashboard.",
  },
  {
    category: "Pricing & billing",
    q: "How much does it cost?",
    a: "Selling in person is free, forever — the store, POS and inventory sync cost CHF 0/month and Zolto adds nothing on in-person payments. Online and AI-agent orders carry a 1% platform fee on the Free plan (a month with no online sales costs CHF 0). Pro is CHF 25/month with a 14-day free trial: it removes the 1% and unlocks unmetered AI. Month-to-month — cancel anytime.",
  },
  {
    category: "Selling",
    q: "Can I sell both in person and online?",
    a: "Yes — that's the core of Zolto. One inventory powers both your point-of-sale and your online store, and stock stays in sync in real time so you never oversell.",
  },
  {
    category: "Pricing & billing",
    q: "How do I get paid?",
    a: "You connect your own Stripe account and your customers pay directly into it — Zolto never holds your money. On the Free plan a 1% platform fee is taken automatically on online and AI-agent orders only; in-person sales are always fee-free, and Pro removes the fee entirely.",
  },
  {
    category: "Selling",
    q: "Do I need to buy a card reader?",
    a: "No — payments happen on the phone you already own, via the Zolto POS app: contactless card, Apple Pay / Google Pay, and TWINT QR. Nobody inserts a card anymore, they tap, so there's no reader to buy, rent, or plug in.",
  },
  {
    category: "Pricing & billing",
    q: "How is Zolto cheaper than Stripe, SumUp, or Worldline?",
    a: "Those tools were built for an era when websites were hard and a card reader was king, so they charge for hardware, setup, and lock-in — easily around CHF 2,000 a year. AI builds your store in an afternoon and your phone is the terminal, so the real cost is tiny. Zolto passes that saving on: selling in person is free, online orders carry just a 1% platform fee on the Free plan, and Pro is a flat CHF 25/month — roughly one-hundredth of the old way.",
  },
  {
    category: "Selling",
    q: "What if I keep my inventory in a notebook?",
    a: "That's fine — keep it however you already do. Snap a photo of your handwritten list and the AI reads it into a real catalogue (names, prices, quantities). AI is good with ambiguity, so you don't have to become an 'inventory person.'",
  },
  {
    category: "Selling",
    q: "Do I have to tag every sale at a busy market?",
    a: "No. Just enter the amount and take the tap. At the end of the day Zolto emails its best guess at what you sold; you tap to confirm and each piece is marked sold across your store and POS automatically.",
  },
  {
    category: "Getting started",
    q: "Can I bring products from another platform?",
    a: "Yes. Import your catalogue with CSV or bulk photo upload, so switching from Shopify, Square, or a spreadsheet is quick.",
  },
  {
    category: "AI & discovery",
    q: "Will AI assistants be able to find my products?",
    a: "Yes. Every store publishes an llms.txt and a Model Context Protocol (MCP) endpoint, so AI assistants and agents can discover and recommend your products, alongside normal search-engine SEO.",
  },
  {
    category: "AI & discovery",
    q: "What about product photos?",
    a: "Take one rough phone photo and the AI restyles it into a clean product shot or an on-model image — no photographer or studio needed. AI-styled images are always disclosed.",
  },
  {
    category: "Pricing & billing",
    q: "Can I upgrade or downgrade anytime?",
    a: "Yes. Changes take effect at your next billing cycle.",
  },
  {
    category: "Pricing & billing",
    q: "Is there a contract?",
    a: "No. All paid plans are month-to-month. Cancel anytime.",
  },
  {
    category: "Pricing & billing",
    q: "Do prices include VAT?",
    a: "There's no VAT to add. Zolto is under the CHF 100,000 Swiss VAT registration threshold, so the price you see is the price you pay. If that ever changes, we'll say so before it does.",
  },
];

/** FAQs for one category, in declaration order. */
export function faqsByCategory(category: FaqCategory): Faq[] {
  return FAQS.filter((f) => f.category === category);
}

export interface Competitor {
  /** URL slug fragment: /compare/zolto-vs-<id>. */
  id: string;
  name: string;
  /** What the product actually is — neutral, checkable, no pricing claims. */
  summary: string;
  /**
   * When the incumbent is genuinely the better choice. This is not a hedge:
   * a comparison that never concedes anything reads as marketing and gets
   * discounted by readers and AI assistants alike. Being straight about where
   * we don't fit is what makes the rest of the page worth believing.
   */
  betterWhen: string[];
  /** When Zolto is the better fit. */
  zoltoWhen: string[];
}

/**
 * The named incumbents Zolto positions against, for the /compare/* pages.
 *
 * Deliberately free of competitor pricing: their plans and rates change often
 * and vary by country, contract and volume, so any number hard-coded here would
 * be stale and unverifiable. The pages compare *models* — hardware, setup effort,
 * where the money lands — and point at the incumbent's own pricing page for
 * current figures. Claims about Zolto stay sourced from PLANS / REVENUE_SHARE.
 */
export const COMPETITORS: Competitor[] = [
  {
    id: "stripe",
    name: "Stripe",
    summary:
      "A developer-first payments platform. Stripe powers checkout for a large share of the web, and Zolto itself settles payments through Stripe Connect — your customers pay into your own Stripe account.",
    betterWhen: [
      "You have engineering resources and want to build a bespoke checkout.",
      "Your business model needs Stripe's full API surface — marketplaces, subscriptions, complex payouts.",
      "You already run a storefront you're happy with and only need payments.",
    ],
    zoltoWhen: [
      "You want a store and a point-of-sale, not an API to build against.",
      "You'd rather photograph your notebook than write a product catalogue by hand.",
      "You sell at markets and online and want one inventory across both.",
    ],
  },
  {
    id: "sumup",
    name: "SumUp",
    summary:
      "A card-reader-first payments company aimed at small merchants and market traders, selling handheld terminals alongside a payments account.",
    betterWhen: [
      "You want a dedicated physical terminal rather than using your phone.",
      "You take payments in places where handing over a separate device matters.",
      "You don't need an online store at all.",
    ],
    zoltoWhen: [
      "You'd rather not buy hardware — modern phones take contactless and TWINT QR already.",
      "You want the same catalogue behind your stall and your website.",
      "You want AI to do the listing, translating and customer answering.",
    ],
  },
  {
    id: "shopify",
    name: "Shopify",
    summary:
      "The best-known hosted e-commerce platform, with its own point-of-sale app alongside the online store. Built for retail businesses that grow into staff, warehouses and multi-channel fulfilment.",
    betterWhen: [
      "You're running a large catalogue with staff, stock locations and complex fulfilment.",
      "You want the biggest third-party app ecosystem and someone to assemble it.",
      "You need established multi-channel retail tooling and have time to administer it.",
    ],
    zoltoWhen: [
      "You're one person, and a platform you have to administer is the problem, not the solution.",
      "You want the till and the catalogue on the phone in your apron without a monthly bill for it.",
      "You'd rather photograph your notebook than fill in a product grid by hand.",
    ],
  },
  {
    id: "worldline",
    name: "Worldline",
    summary:
      "A large European payments processor (it acquired SIX Payment Services, long the default for Swiss card terminals), serving merchants from corner shops to enterprises.",
    betterWhen: [
      "You need enterprise payment infrastructure and formal procurement.",
      "You want an established Swiss acquiring relationship with contract terms.",
      "Your volume justifies negotiated rates and dedicated account management.",
    ],
    zoltoWhen: [
      "You're one person or a small studio, and contracts and terminals are overkill.",
      "You want to be selling this weekend, not after an onboarding process.",
      "You want your online store, POS and AI assistant in one place.",
    ],
  },
];

export function findCompetitor(id: string): Competitor | undefined {
  return COMPETITORS.find((c) => c.id === id);
}

/** The steps to open a store — used by the platform MCP `how_to_start` tool + llms. */
export const HOW_TO_START: string[] = [
  "Sign up free at /signup with your email — no card required.",
  "Add your first products by hand, by CSV import, or by sending photos to WhatsApp/Slack/Discord.",
  "Let the AI draft descriptions and restyle your product photos.",
  "Connect your Stripe account so customers pay directly into it.",
  "Share your storefront link — you're live, online and in person, from one inventory.",
];
