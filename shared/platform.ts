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
  /**
   * Two claims were removed from this paragraph in the August 2026 pricing
   * review, and both should stay removed:
   *
   *  - *"for a fraction of what legacy providers charge"* — not true on card
   *    rate. SumUp Payments Plus and Worldline Tap on Mobile both beat the
   *    Stripe + Zolto stack in person, and SumUp beats it online on every plan.
   *    See shared/costOfAcceptance.ts.
   *  - *"AI assistants can find, recommend, and **buy** from it"* — MCP's
   *    `create_checkout` hands the buyer a Stripe payment link that a human
   *    completes. The assistant selects and starts the checkout; it does not
   *    complete a purchase in the chat.
   */
  summary:
    "Zolto gives independent makers and artisans a point-of-sale and an online store that share one inventory — with an AI assistant that handles setup, product photos, listings, and support. One till takes TWINT, cards and cash from a grid of your actual objects, on the phone you already own. Zolto charges nothing on in-person sales and 1% on online and AI-agent orders on the Free plan; your payment provider's own fees apply on top and go to them. Built by AI, for AI: every store ships an llms.txt and a Model Context Protocol (MCP) endpoint out of the box, so AI assistants can find, recommend, and start a checkout with it directly. Sell online and in person without managing technology.",
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
      "Connect your own Stripe account; your customers pay straight into it. Zolto never holds your money. Stripe charges its own processing fee on every sale and that money goes to Stripe — Zolto's fee is separate and on top of it: 1% on online and agent orders on the Free plan, 0% on Pro, and 0% on in-person sales on every plan.",
  },
  {
    id: "storefront",
    name: "Your own branded storefront",
    description:
      "A themed online store on your own subdomain or custom domain, with Swiss and EU shipping built in.",
  },
  {
    id: "eu-hosting",
    name: "European hosting — your data stays in Europe",
    description:
      "Zolto runs on servers rented from Hetzner in Europe, most of them in Germany. Your catalogue, your orders and your customers' details live in a European data centre, under the GDPR and the revised Swiss FADP — not in whichever cloud region happened to be the default.",
  },
  {
    id: "ai-discovery",
    name: "Discoverable by AI assistants",
    description:
      "Every store ships an llms.txt and a Model Context Protocol (MCP) endpoint, so AI assistants can read your live catalogue, recommend your products and start a checkout the buyer completes. The rails are live from day one; the platform-wide store directory fills up as makers launch, so this is infrastructure ahead of the traffic rather than a channel already sending it.",
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
      "Full POS — Tap to Pay, TWINT and cash — CHF 0 from Zolto on in-person sales",
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

  /**
   * The squeeze play — the one in-person argument that survives contact with
   * the competition, and the replacement for the retired "no card reader" lead.
   *
   * The shape of it: the two incumbents have opposite gaps. SumUp's till has a
   * genuinely good item catalogue and cannot take TWINT at all. Worldline's Tap
   * on Mobile takes TWINT at a competitive flat rate and has no catalogue to put
   * in front of it. Zolto is the only one of the three where a maker taps a
   * photo of the actual object and then picks TWINT, card or cash on the same
   * screen.
   *
   * **On the wording of `claim`.** ZERO_COST_POS (below) already reasons that a
   * blanket "nobody else does this" is a claim about every competitor's current
   * tier in every country — unverifiable the day it's written, stale the week
   * after — and platform.test.ts pins that. So this claim is scoped to the named,
   * sourced field rather than to the world. It says the same thing to a reader
   * and, unlike the broader version, it can be checked: each half of it cites the
   * vendor's own documentation via `panels[].sourceId`.
   */
  squeezePlay: {
    eyebrow: "the one that isn't a tie",
    /** Split for the hand-drawn underline — see ZERO_COST_POS on why. */
    headline: "Your catalogue and TWINT,",
    headlineEmphasis: "in the same till.",
    body: "Every till in this market now runs on an ordinary phone, so that stopped being the argument. Here's the one that's left: the two big options have opposite holes in them, and a Swiss maker falls straight down whichever one they pick.",
    /**
     * Three tills, side by side. Order matters — concede twice, then land it.
     * `has` drives which illustration variant renders, so the drawing and the
     * claim cannot disagree about which panel is missing what.
     */
    panels: [
      {
        id: "grid-no-twint",
        has: ["grid"] as const,
        label: "A till with your things in it",
        detail:
          "Photos, prices, stock counts — and no way to take the payment method half your customers reach for first. The workaround is a second, separate TWINT setup and a manual reconciliation at the end of the day.",
        sourceId: "sumup-item-catalogue",
      },
      {
        id: "twint-no-grid",
        has: ["twint"] as const,
        label: "A till that takes TWINT",
        detail:
          "TWINT, cards, a good flat rate — and nothing in it. It's a payment app: you type in an amount every time, or you buy and integrate separate till software to sit on top of it.",
        sourceId: "worldline-tap-on-mobile",
      },
      {
        id: "both",
        has: ["grid", "twint"] as const,
        label: "Zolto",
        detail:
          "Tap the photo of the actual object, then choose TWINT, card or cash on the same screen. One tap updates the stock behind your stall and on your website at once.",
      },
    ],
    claim:
      "Of the three ways a Swiss maker can take a payment at a stall today, only one puts the catalogue and TWINT on the same screen.",
  },
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
    // The correction the whole pledge was missing. Without this line, "0% in
    // person" reads as the cost of a sale, which it isn't — and the reader
    // finds out from their Stripe statement instead of from us.
    "What we charge is not what a sale costs. Your payment provider takes its own cut and that money goes to them, not to us — and on card rate alone we are not the cheapest way to get paid in Switzerland. We'd rather show you the whole stack and let you do the arithmetic.",
  ],
} as const;

/**
 * The cost-disruption headline: a year of fixed costs on a subscription-priced
 * competitor vs. a month on Zolto.
 *
 * **This figure used to have no source.** `themPerYearChf` was 2000, traceable
 * to nothing more than the founder's recollection of what a terminal costs, and
 * it was rendered on both the landing and pricing pages as if it were a
 * researched number. It was the single worst citation gap on the marketing
 * surface — flagged as G11 in docs/planning/ai-traffic-alignment.md and left
 * open there on the grounds that inventing a citation would be worse than the
 * status quo. That was right, and it is now fixed the other way: the number is
 * computed from a published rate, and the basis is stated on the page.
 *
 * The basis, deliberately narrow and deliberately unflattering to us: twelve
 * months of SumUp's Payments Plus subscription plus a Solo reader. It is a
 * *fixed-cost* comparison, not a cost-of-acceptance one — Payments Plus buys
 * a card rate that beats ours, which is why `themNote` says what the money is
 * for rather than implying it's wasted. Anyone who wants the honest per-sale
 * arithmetic gets it from shared/costOfAcceptance.ts, and the page links there.
 */
const SUMUP_PLUS_MONTHLY_CHF = 29;
const SUMUP_SOLO_READER_CHF = 99;

export const COST_COMPARISON = {
  themPerYearChf: SUMUP_PLUS_MONTHLY_CHF * 12 + SUMUP_SOLO_READER_CHF,
  themLabel: "A year of fixed costs elsewhere",
  themNote:
    "SumUp Payments Plus at CHF 29/month for a year, plus a CHF 99 Solo reader — which buys a card rate lower than ours",
  /** The source row backing `themPerYearChf`. Rendered, not just recorded. */
  themSourceId: "sumup-pos-lite",
  usPerMonthChf: (PLANS.find((p) => p.highlight)?.priceChf ?? 19) as number,
  usLabel: "A month with Zolto",
  usNote: "no hardware · cancel anytime · your Stripe, your money",
  /**
   * This used to read "one-hundredth the cost", which was never arithmetic —
   * it was a shape. Against a sourced figure it's plainly false, and a
   * multiplier that has to be re-checked every time a price moves is a
   * liability in four languages. Replaced with the strongest claim here that
   * is simply, permanently true and needs no number of its own.
   */
  multiplier: "and CHF 0/month if you stay on Free",
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
    "Full POS — Tap to Pay, TWINT and cash, on one screen",
    "Every piece with its photo, name and price",
    "Real-time POS ↔ online inventory sync",
    "Your online storefront, on your own zolto.ch address",
  ],
  /**
   * The catch, stated before anyone has to ask what it is.
   *
   * The second sentence is the one the pricing review forced. "CHF 0.00 at the
   * end of the month" is true of *our* bill and was being read as the cost of
   * taking a payment, which it never was. Naming the other bill here, in the
   * band that makes the boldest free claim on the site, is the cheapest place
   * to stop that misreading.
   */
  catch:
    "No trial clock. No starter tier that quietly expires. The only thing we ever charge for is the online sales we bring you — and if there aren't any, there's nothing to charge. Whoever processes your card and TWINT payments still charges their own rate, the same as they would anywhere else; that bill is between you and them, and we don't take a slice of it.",
} as const;

/**
 * Where the platform physically runs — the data-residency claim.
 *
 * Scoped, on purpose, to the part we actually operate: the application servers
 * and the database that holds a merchant's catalogue, orders and customer
 * records. Those are machines rented from Hetzner in Europe, in most cases in
 * Germany. That is a fact about our own infrastructure, checkable and stable,
 * rather than a compliance badge — so the copy says "your data lives here",
 * never "certified" or "compliant with everything".
 *
 * `caveat` is load-bearing and must stay: card payments, the AI model calls and
 * transactional email are third parties, and some of those are outside the EU.
 * A residency claim that quietly omits its sub-processors is the kind of thing
 * a merchant discovers later and stops trusting the rest of the page over —
 * which is exactly the trade the pricing pledge refuses to make elsewhere.
 * platform.test.ts pins the caveat's presence for that reason.
 */
export const DATA_RESIDENCY = {
  eyebrow: "where your shop actually lives",
  /** Split for the hand-drawn underline — see ZERO_COST_POS on why. */
  headline: "Your shop lives in Europe.",
  headlineEmphasis: "Mostly Germany.",
  /** The company whose hardware Zolto rents. */
  provider: "Hetzner",
  region: "Europe",
  primaryCountry: "Germany",
  body: "Zolto runs on machines we rent from Hetzner, a German hosting company, in European data centres — in most cases in Germany. Your catalogue, your orders and your customers' addresses sit in a database on those machines. Not on the other side of an ocean because that was the default setting.",
  points: [
    "Application servers and database in Europe — rented from Hetzner, most of them in Germany.",
    "Two data-protection regimes cover it: the GDPR and the revised Swiss FADP. Where they differ, we hold ourselves to the stricter one.",
    "Your customers' names and addresses stay under European law — useful when a customer asks, and when you're selling into the EU.",
    "One-click export on every plan, and deletion on request. Data you can take with you isn't really held hostage anywhere.",
  ],
  /** What genuinely does leave — named here rather than left to be discovered. */
  caveat:
    "The honest footnote: we don't run everything ourselves. Card payments go through Stripe, our AI features call a model provider, and account emails go out through an email service — so some data reaches those companies too, and not all of them are European. They're named in the privacy policy instead of buried in it.",
  /** Where the full detail lives. */
  href: "/legal/privacy",
} as const;

/**
 * How European a given piece of the stack is today.
 *
 * `moving` is the only state that makes a promise, and it is the reason this
 * whole structure exists rather than a paragraph of copy: a row that says
 * "moving" is a commitment the page is publishing on our behalf. When one
 * lands, flip it to `swiss`/`european` and update `today` — do not leave a
 * shipped move advertised as pending, and do not advertise a move nobody has
 * agreed to make. `foreign` is not an embarrassment to hide; it is the row
 * that makes the others believable.
 */
export type SovereigntyState = "swiss" | "european" | "moving" | "foreign";

export interface SovereigntyEntry {
  /** The part of the stack, in the merchant's words, not ours. */
  piece: string;
  /** Where it runs TODAY. Present tense, honest, no aspiration. */
  today: string;
  state: SovereigntyState;
  /** Where it's going (`moving`), or why it can't (`foreign`). */
  next?: string;
}

/**
 * Zolto's Swissness claim and the European-stack roadmap — the prominent,
 * page-level version of what DATA_RESIDENCY says about hosting alone.
 *
 * The claim is deliberately three-layered, because only the first layer is
 * finished: the company and the product are Swiss (that's a fact about where
 * we are), the infrastructure is European and moving toward Switzerland (a
 * direction, with rows still open), and some of it will never be either (card
 * schemes, phone wallets — stated rather than skipped).
 *
 * The ledger is the whole point. A "Made in Switzerland" badge with nothing
 * behind it is a flag; a row-by-row list of where each piece actually runs,
 * including the ones that are still foreign, is a claim a merchant can check
 * and an AI assistant can quote. It also creates an obligation — see
 * SovereigntyState above, and docs/planning/swiss-stack-migration.md for the
 * research the `moving` rows are drawn from.
 *
 * NOTE ON THE LABEL: "Made in Switzerland" here describes where the company
 * and the work are, which is the checkable claim. Using it as a formal origin
 * *label* is governed by Swiss "Swissness" legislation (broadly: registered
 * office and actual administration in Switzerland for a service) — worth a
 * lawyer's five minutes before it goes on anything more formal than a website.
 */
export const SOVEREIGNTY = {
  eyebrow: "made in switzerland",
  /** Split for the hand-drawn underline — see ZERO_COST_POS on why. */
  headline: "Made in Switzerland.",
  headlineEmphasis: "Run from Europe.",
  /** Who we build for, in order — Swiss first, Europe next, then everyone. */
  serving:
    "Zolto is built in Zürich, for Swiss makers first, for Europe next, and after that for anyone anywhere who likes how we do things.",
  body: "We're moving every piece of Zolto we control onto European infrastructure, and into Switzerland where there's a Swiss option worth having. Some of it is already there. Some of it isn't yet. Here's the whole list, including the parts that make us look bad.",
  /**
   * Every piece of the stack, in the order a merchant would care about it.
   * The servers row reads DATA_RESIDENCY so the two can't tell different
   * stories about the same machines.
   */
  ledger: [
    {
      piece: "The company and the product",
      today: "Built in Zürich, by a Swiss company",
      state: "swiss",
    },
    {
      piece: "Servers and your database",
      today: `${DATA_RESIDENCY.provider} · ${DATA_RESIDENCY.region}, mostly ${DATA_RESIDENCY.primaryCountry}`,
      state: "european",
      next: "A Swiss data centre, so the machines and the company share a country.",
    },
    // There are two TWINT paths in the till and this row used to describe only
    // the flattering one. `twint_qr` (server/pos.ts) is the merchant's own
    // sticker: Swiss end to end, 1.3%, and the money never touches us. The
    // in-app TWINT button is a Stripe PaymentIntent, so it runs on Stripe's
    // rails at Stripe's undocumented TWINT rate. Claiming "Swiss, end to end"
    // for both was the kind of quiet elision this whole ledger exists to
    // refuse — and one an auditor would have found before a merchant did.
    {
      piece: "TWINT — your own QR code",
      today:
        "Your own TWINT account at 1.3% — Swiss rails, end to end, and we never see the money",
      state: "swiss",
    },
    {
      piece: "TWINT — the button in the till",
      today:
        "A Stripe payment, not a direct TWINT one — Stripe's rails, at a rate Stripe doesn't publish",
      state: "moving",
      next: "A direct TWINT integration, so the in-app button runs on the same Swiss rails as the QR code. TWINT certifies integrators before releasing the spec, so this starts as an application rather than a branch.",
    },
    {
      piece: "Card payments and payouts",
      today: "Stripe — money goes straight to your own account, never ours",
      state: "moving",
      next: "A Swiss payment processor. Our research says it would also be cheaper per sale than what you pay now, which is the rare case of the principled option being the cheap one.",
    },
    {
      piece: "The AI (listings, translations, chat)",
      today: "A model provider outside Europe",
      state: "moving",
      next: "Swiss-hosted open models. Our AI layer already speaks a standard API, so this is the shortest hop on the list — the thing we're testing is whether the quality holds.",
    },
    {
      piece: "Your product photos",
      today: "Object storage that isn't guaranteed European yet",
      state: "moving",
      next: "The same European data centre as the servers, so your photos and your orders stop living in different jurisdictions.",
    },
    {
      piece: "Account emails",
      today: "A sending service outside Europe",
      state: "moving",
      next: "A European sender. Small job, low risk, genuinely just not done yet.",
    },
    {
      piece: "Card networks and phone wallets",
      today: "Visa, Mastercard, Apple Pay, Google Pay",
      state: "foreign",
      next: "These are not European and never will be. If you want a sale to stay in Switzerland from end to end, take it over your own TWINT QR — at 1.3% with no fixed fee it is also the cheapest way to be paid that carries no monthly cost, and less than half what the same sale costs on a card.",
    },
  ] as SovereigntyEntry[],
  /** Why we're spending money on this rather than shipping another feature. */
  why: [
    "Your customers are starting to ask where their data goes. “I don't know” is an answer that costs you the sale.",
    "Here, data protection is a right rather than an upgrade: the GDPR and the revised Swiss FADP apply to your store whether or not anyone ever audits us.",
    "The money and the data stay inside the jurisdiction whose rules they're subject to. That's the whole idea, and it stops being true the moment either one leaves.",
    "European infrastructure only keeps existing if European companies actually buy it. We'd rather be a customer of it than an argument about it.",
  ],
  /** The promise the ledger implies, said out loud so it can be held to. */
  promise:
    "This is the complete list. When a row moves we'll change it here and say what moved — an old promise quietly repainted as an achievement is worth less than the flag we'd be printing it on.",
  /** The sub-processor footnote, shared with DATA_RESIDENCY — one caveat only. */
  caveat: DATA_RESIDENCY.caveat,
  /** The page that carries the full ledger. */
  href: "/made-in-switzerland",
  /** Compact form for the hero strip — three facts, no sentence. */
  heroBadges: [
    "Made in Switzerland",
    `Servers in ${DATA_RESIDENCY.region}`,
    "TWINT built in",
  ],
} as const;

/** Ledger rows in a given state — used by the page's grouped rendering. */
export function sovereigntyByState(
  state: SovereigntyState,
): SovereigntyEntry[] {
  return SOVEREIGNTY.ledger.filter((e) => e.state === state);
}

/** Human label for a ledger state, shown as the row's chip. */
export const SOVEREIGNTY_STATE_LABEL: Record<SovereigntyState, string> = {
  swiss: "Swiss today",
  european: "European today",
  moving: "Moving",
  foreign: "Never will be",
};

export interface ComparisonRow {
  feature: string;
  them: string;
  us: string;
}

/**
 * "What you're actually paying them for" — old guard vs. Zolto, row by row.
 *
 * Two rows were retired in the August 2026 pricing review, and it's worth
 * saying why so they don't creep back:
 *
 *  - **"Card reader — sold to you, CHF 50–300+"** stopped being true of the
 *    field. SumUp Tap to Pay and Worldline Tap on Mobile both run on an
 *    ordinary phone in Switzerland now, and Worldline's carries no fixed
 *    monthly cost. "You don't need to buy a reader" is still true of Zolto and
 *    no longer distinguishes it.
 *  - **"Your catalogue on your phone — part of a paid tier"** was a claim about
 *    competitors' packaging that the review's research contradicts: SumUp's
 *    item catalogue is genuinely good and is not behind a paywall.
 *
 * What replaced them is the one in-person argument that survives contact — the
 * squeeze play. It is a claim about capability rather than price, each half of
 * it is documented by the vendor themselves, and both halves live in
 * CAPABILITIES where a test holds them.
 */
export const INCUMBENT_COMPARISON: ComparisonRow[] = [
  {
    // The headline row, first on purpose. Not "we're cheaper" — we aren't —
    // but "only one of these takes both, from a grid of your actual objects".
    feature: "Your catalogue and TWINT in the same till",
    them: "One or the other: a till app that can't take TWINT, or a TWINT app with no catalogue in it",
    us: "Both, on one screen — tap the photo, then choose TWINT, card or cash",
  },
  {
    feature: "What a sale costs",
    them: "Their rate, all in — and at a stall, every one of them beats ours on cards",
    us: "Your processor's rate, plus 0% from us in person and 1% online on Free — so take TWINT, which is in the same till",
  },
  {
    feature: "Building the store",
    them: "A developer, weeks in a builder, or no online store at all",
    us: "AI drafts, writes and photographs it in an afternoon",
  },
  {
    feature: "Inventory",
    them: "Rigid grids you maintain by hand",
    us: "Scan your notebook; the AI keeps it",
  },
  {
    feature: "Pricing",
    them: "A monthly fee, a higher per-sale rate, or a negotiated contract",
    us: "Free in person. 1% online, or flat CHF 25",
  },
  {
    feature: "Your money",
    them: "Held, then paid out",
    us: "Straight into your own Stripe",
  },
  {
    // A difference in *where*, phrased so it stays checkable: we say exactly
    // where ours is and point at their sub-processor list for theirs, rather
    // than asserting a region for companies that run in several and move
    // between them.
    feature: "Where your data lives",
    them: "Whichever cloud regions they use — check their sub-processor list",
    us: `${DATA_RESIDENCY.region}, mostly ${DATA_RESIDENCY.primaryCountry} — servers we rent from ${DATA_RESIDENCY.provider}`,
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

/**
 * The AI-native main pitch — the landing hero and its proof sections.
 *
 * The thesis: buying is moving from search results into assistant
 * conversations, and assistants can only recommend stores they can read.
 * Zolto's answer is structural, not retrofitted — llms.txt, MCP and agent
 * checkout ship with every store (see FREE_PLAN "Found by AI agents…"), so
 * the claim set here is pinned to the Free plan by platform.test.ts the same
 * way ZERO_COST_POS is.
 *
 * The chart is deliberately schematic: two labelled curves and a caption, a
 * claim about direction rather than data. No numbers, no source to go stale.
 */
export const AI_NATIVE_PITCH = {
  eyebrow: "commerce is moving into the chat window",
  headline: "Your next customer",
  /** Split so the sketch underline hugs the punchline (see ZERO_COST_POS). */
  headlineEmphasis: "is an AI.",
  body: "Search built the last era of shops. Assistants are building this one — and they can only recommend stores they can read. Every Zolto store ships llms.txt, MCP and agent checkout from day one, kept current as the protocols move, so your shop compounds in the answers while retrofitted websites fade out of them.",
  chart: {
    title: "where buyers start their search",
    decliningLabel: "search engines",
    risingLabel: "AI assistants",
    startYear: "2023",
    endYear: "2027",
    caption:
      "Assistants only recommend stores they can read. A store that's invisible to them isn't in the answer — no matter how good its SEO was.",
  },
  /**
   * The proof band: an agent shopping a store, inside the conversation.
   *
   * Scoped down in the August 2026 review. It used to say "watch an AI buy"
   * and "places the order", which overstated `create_checkout`: the tool
   * returns a Stripe payment link, and a human completes the payment. The
   * rails are genuinely live — that part was never the problem — so the fix is
   * to describe what the tool does rather than to soften the whole claim.
   */
  proof: {
    eyebrow: "the rails are live — the traffic is still arriving",
    headline: "Watch an AI shop a Zolto store.",
    body: "Your customer asks their assistant. The assistant reads the store's brief, checks live stock over MCP, picks the piece and opens a checkout — your customer taps pay, and the money lands in the maker's own Stripe like any other sale. Point your own AI at zolto.ch/llms.txt and ask it about us.",
  },
  /** The mechanics band — each step names something the Free plan ships. */
  steps: [
    {
      k: "Found",
      title: "The assistant reads your brief",
      body: "Every store publishes yourstore.zolto.ch/llms.txt — a plain-language summary of who you are and what you sell, written for AI readers.",
    },
    {
      k: "Asked",
      title: "It checks live stock over MCP",
      body: "Real products, real prices, real quantities — straight from your inventory, not a stale scrape from last month.",
    },
    {
      k: "Bought",
      title: "It opens the checkout, your customer pays",
      body: "The assistant hands over a checkout for the piece it picked. Your customer taps pay, and the order lands like any other sale: stock syncs, you get the notification, and the money goes straight into your Stripe.",
    },
  ],
  footnote:
    "You don't set any of this up. It ships with the store — on the Free plan too, and 1% only when an agent actually sells for you.",
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
  "Privacy & data",
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
    category: "About Zolto",
    q: "Is Zolto Swiss?",
    a: "Yes — Zolto is built in Zürich by a Swiss company, for Swiss makers first, for Europe next, and after that for anyone anywhere. Prices are in Swiss francs, TWINT is built in rather than bolted on, and the infrastructure is European with an open plan to move the rest of it into Switzerland. The full row-by-row list of what already runs where lives at /made-in-switzerland.",
  },
  {
    category: "Getting started",
    q: "How long does it take to set up a store?",
    a: "About an afternoon. Upload a few products (or import a CSV), let the AI draft descriptions and style your photos, connect payments, and you can be live the same day.",
  },
  {
    category: "Getting started",
    q: "I already sell with Stripe, SumUp or Worldline — how do I switch?",
    a: "Bring your catalogue with you instead of re-typing it. If you're on Stripe, link the Stripe account you already have — your checkout keeps working and your products import in one click. From SumUp or Worldline/SIX, upload the CSV export from their dashboard and Zolto reads it (including German/French headers and Swiss price formats). You review every item before anything is written to your shop.",
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
    category: "Privacy & data",
    q: "Where is my store's data stored?",
    a: "In Europe. Zolto runs on servers we rent from Hetzner, a German hosting company, in European data centres — in most cases in Germany. Your products, orders and customers' details live in a database on those machines, not on a cloud region on the other side of an ocean.",
  },
  {
    category: "Privacy & data",
    q: "Does any of my data leave Europe?",
    a: "Some of it reaches companies we don't run ourselves: card payments are handled by Stripe (card numbers never touch Zolto's servers), our AI features send text and photos to a model provider, and account emails go through an email service — and not all of those are European. Everything Zolto itself stores stays on our European servers. The sub-processors are named in the privacy policy, and the current list is available on request.",
  },
  {
    category: "Privacy & data",
    q: "Is Zolto covered by the GDPR and Swiss data protection?",
    a: "Both apply. Zolto serves merchants in Switzerland and the EU, so the revised Swiss Federal Act on Data Protection (revFADP) and the GDPR both come into play — where they differ we work to the stricter one. Hosting in the EU makes that a much shorter conversation, and where we process your customers' data on your behalf, a Data Processing Agreement governs it.",
  },
  {
    category: "Privacy & data",
    q: "Are you moving the rest of the stack to Europe?",
    a: "Yes, piece by piece, and we publish the state of it rather than the ambition. Servers and your database are already European; TWINT already runs on Swiss rails. Card payments, the AI, product-photo storage and account email are the ones still outside Europe, each with a stated next step — the whole ledger is at /made-in-switzerland, including the parts (card networks, phone wallets) that are never going to be European.",
  },
  {
    category: "Privacy & data",
    q: "Can I get my data out again?",
    a: "Yes, on every plan — including Free. Export your catalogue and store profile as a JSON file from Data & privacy in your admin, any time, without asking us. Deleting your store is a support request purely so we can confirm it's really you.",
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

/**
 * Whether a product does the thing, in the only four states worth having.
 * `"n/a"` is not a softer `false`: Worldline doesn't track stock in person
 * because it has no catalogue to track it against, which is a different fact
 * about the product than choosing not to build the feature.
 */
export type Support = boolean | "partial" | "n/a";

/**
 * A row of the capability matrix, carrying its own Zolto answer.
 *
 * The rows live here rather than on each competitor so the columns can't fall
 * out of alignment, and so Zolto answers every question it asks of anyone else
 * — including the two it answers badly (no PostFinance Pay, and a slower setup
 * than SumUp's).
 */
/**
 * The sections of the capability matrix, in reading order.
 *
 * The matrix was ten payment-shaped rows, which quietly conceded the frame:
 * it compared Zolto to payment companies on payment questions, where the best
 * available outcome is a tie. The product is a till, a shop, one inventory and
 * an AI that runs all three — so the matrix now asks about all of it, grouped,
 * and the payment section is one of four rather than the whole thing.
 */
export const CAPABILITY_GROUPS = [
  "The till",
  "The shop",
  "The AI",
  "The money",
] as const;
export type CapabilityGroup = (typeof CAPABILITY_GROUPS)[number];

export interface Capability {
  /** Stable id used to align a competitor's answer with this row. */
  key: string;
  group: CapabilityGroup;
  label: string;
  zolto: string;
  zoltoSupported: Support;
}

export const CAPABILITIES: Capability[] = [
  // ── The till ───────────────────────────────────────────────────────────
  {
    key: "no-hardware",
    group: "The till",
    label: "Takes a payment with no hardware to buy",
    zolto: "Yes — Tap to Pay on the phone you already own",
    zoltoSupported: true,
  },
  {
    key: "item-grid",
    group: "The till",
    label: "Your catalogue as a grid in the till",
    zolto: "Yes — photo, name and price for every piece",
    zoltoSupported: true,
  },
  {
    key: "twint",
    group: "The till",
    label: "TWINT in the same till",
    zolto: "Yes — beside cards and cash, on one screen",
    zoltoSupported: true,
  },
  {
    // Zolto answers this one badly, on purpose. A matrix that only asks
    // questions we win is a scorecard we wrote for ourselves.
    key: "postfinance",
    group: "The till",
    label: "PostFinance Pay",
    zolto: "No",
    zoltoSupported: false,
  },
  {
    key: "stock-in-person",
    group: "The till",
    label: "Stock counts down as you sell in person",
    zolto: "Yes",
    zoltoSupported: true,
  },
  {
    key: "sell-by-amount",
    group: "The till",
    label: "Sell by amount when it's busy, tidy it up later",
    zolto:
      "Yes — take the tap without tagging the item; at close of day Zolto emails its best guess and one tap confirms it",
    zoltoSupported: true,
  },

  // ── The shop ───────────────────────────────────────────────────────────
  {
    key: "online-store",
    group: "The shop",
    label: "A real online shop, not a payment link",
    zolto: "Yes — themed storefront on your own address, Swiss and EU shipping",
    zoltoSupported: true,
  },
  {
    key: "builds-storefront",
    group: "The shop",
    label: "Somebody builds the shop for you",
    zolto: "Yes — the AI drafts the theme, the copy and the photography",
    zoltoSupported: true,
  },
  {
    key: "stock-shared",
    group: "The shop",
    label: "One stock count across the stall and the shop",
    zolto: "Yes — with a short-lived hold while a customer is in checkout",
    zoltoSupported: true,
  },
  {
    key: "multilingual",
    group: "The shop",
    label: "Listings in German, French, Italian and English",
    zolto: "Yes — written and translated for you, not by you",
    zoltoSupported: true,
  },
  {
    key: "setup",
    group: "The shop",
    label: "Time to your first sale",
    zolto: "Same day",
    zoltoSupported: true,
  },

  // ── The AI ─────────────────────────────────────────────────────────────
  {
    key: "ai-listings",
    group: "The AI",
    label: "Titles and descriptions written for you",
    zolto: "Yes — from a photo, in every language you sell in",
    zoltoSupported: true,
  },
  {
    key: "ai-photography",
    group: "The AI",
    label: "One phone photo becomes a catalogue shot",
    zolto:
      "Yes — restyled into a clean product or on-model image, disclosed as AI-styled",
    zoltoSupported: true,
  },
  {
    key: "ai-intake",
    group: "The AI",
    label: "Get stock in without typing it",
    zolto:
      "Yes — photograph a handwritten list, or send a photo and a price to WhatsApp, Slack or Discord",
    zoltoSupported: true,
  },
  {
    key: "ai-support",
    group: "The AI",
    label: "Something answers customer questions for you",
    zolto: "Yes — materials, shipping and sizing, without you at the keyboard",
    zoltoSupported: true,
  },
  {
    key: "ai-insights",
    group: "The AI",
    label: "Plain-language read on what's selling",
    zolto: "Yes — best sellers and restock needs, in sentences (Pro)",
    zoltoSupported: true,
  },

  // ── Found and bought by AI ─────────────────────────────────────────────
  {
    key: "ai-discovery",
    group: "The AI",
    label: "AI assistants can read your shop",
    zolto: "Yes — every store ships an llms.txt and an MCP endpoint",
    zoltoSupported: true,
  },
  {
    key: "agent-checkout",
    group: "The AI",
    label: "An assistant can pick a piece and open a checkout",
    zolto:
      "Yes — it checks live stock over MCP and hands your customer a checkout to complete",
    zoltoSupported: true,
  },

  // ── The money ──────────────────────────────────────────────────────────
  {
    key: "who-holds-money",
    group: "The money",
    label: "Who holds your money",
    zolto: "Nobody but you — straight into your own Stripe and TWINT accounts",
    zoltoSupported: true,
  },
  {
    key: "card-rate",
    group: "The money",
    label: "What a card costs you",
    // The row we lose, stated as a figure rather than a shrug. Sourced from
    // costOfAcceptance's `zolto-card`, so it can't drift from the rate table.
    zolto: "2.9% + CHF 0.20 — Stripe's Swiss rate, and we add nothing to it",
    zoltoSupported: false,
  },
  {
    key: "commitment",
    group: "The money",
    label: "What you sign",
    zolto: "Nothing — month to month, and one-click export on every plan",
    zoltoSupported: true,
  },
  {
    key: "swiss",
    group: "The money",
    label: "Built and run where you are",
    zolto: "Built in Zürich; servers in Europe, mostly Germany",
    zoltoSupported: true,
  },
];

/** Rows in one section, in declaration order. */
export function capabilitiesInGroup(group: CapabilityGroup): Capability[] {
  return CAPABILITIES.filter((c) => c.group === group);
}

export function capability(key: string): Capability {
  const found = CAPABILITIES.find((c) => c.key === key);
  if (!found) throw new Error(`Unknown capability key: ${key}`);
  return found;
}

export interface CompetitorCapability {
  key: string;
  value: string;
  supported: Support;
  /**
   * What the tick costs, where a competitor does have the capability but only
   * behind hardware, a subscription or a contract.
   *
   * This is the field that makes the matrix worth publishing. A column of ✕
   * against a column of ✓ is a scorecard nobody believes; *"yes — but on a
   * terminal, on a contract, after a week of paperwork"* is both more honest
   * and more damaging, because the reader can check it. Only ever set it with
   * a `costSourceId` — an unsourced cost is exactly the kind of claim the
   * August 2026 review was written to remove.
   */
  cost?: string;
  costSourceId?: string;
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
  /**
   * Answers to the CAPABILITIES rows. Optional because we only publish a matrix
   * for the competitors we actually researched to that depth — an empty column
   * would read as "no" rather than "we didn't check".
   *
   * Where present it must answer EVERY row: a silently missing row is a blank
   * cell the reader fills in themselves, usually in our favour.
   */
  capabilities?: CompetitorCapability[];
  /** Ids into shared/costOfAcceptance.ts RATES — this competitor's own rates. */
  rateIds?: string[];
  /** Ids into shared/sources.ts backing everything asserted on this page. */
  sourceIds?: string[];
  /**
   * Publicly-recorded facts about the company that bear on choosing it, where
   * they exist and are material. Only used where "the incumbent is the safe
   * choice" is the argument being weighed — see the Worldline entry.
   */
  risks?: { statement: string; sourceId: string }[];
}

/**
 * The named incumbents Zolto positions against, for the /compare/* pages.
 *
 * **This used to be a pricing-free zone.** The old rule was that competitors'
 * rates change by country, contract and volume, so any figure here would be
 * stale and unverifiable the day it shipped — so the pages compared models and
 * linked out for numbers.
 *
 * The August 2026 pricing review retired that rule, because it was solving the
 * wrong problem. It kept the pages from saying the most useful thing a buyer
 * needs to hear, and it did nothing about the figure we *were* publishing with
 * no basis at all (COST_COMPARISON's "a year with the old guard"). Worse, the
 * silence flattered us: a reader who can't see the rates assumes the platform
 * charging "0% in person" is the cheap one, and on cards it isn't.
 *
 * What replaced it is a provenance rule, not a free-for-all. Numbers live in
 * shared/costOfAcceptance.ts, every one names a row in shared/sources.ts, and
 * every source carries the date it was read. A figure we can't source doesn't
 * ship — Worldline's negotiated terminal pricing stays on the NEGOTIATED list
 * with no number rather than getting a plausible one.
 *
 * Claims about Zolto still come from PLANS / REVENUE_SHARE, as before.
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
      "A well-established mobile card-payment company for small merchants and market traders. It offers cheap readers, Tap to Pay on iPhone and Android, a genuinely capable till app with an item catalogue and stock tracking, and a basic online store. Its European merchants contract with SumUp Limited in Dublin, an EU-regulated e-money institution.",
    betterWhen: [
      "Your customers don't pay by TWINT — SumUp is cheaper and simpler on cards, and setup takes under an hour.",
      "You sell enough on cards for a monthly subscription to beat a per-sale percentage.",
      "You want a mature till app: variants, modifiers, selling layouts, supplier lists, reconciliation. On pure till features it is further along than Zolto.",
      "You want a decade of track record behind the company taking your money. Zolto does not have one.",
    ],
    zoltoWhen: [
      "Your customers reach for TWINT first. A SumUp till cannot take it at all — the workaround is a second, separate TWINT setup and a manual reconciliation at the end of the day.",
      "You sell one-of-a-kind pieces and can't afford to sell the same one twice across two channels.",
      "You want the shop built, written and photographed for you rather than a template to fill in yourself.",
      "You'd rather photograph your notebook than type a catalogue in by hand.",
    ],
    capabilities: [
      // ── The till ──
      {
        key: "no-hardware",
        value: "Yes — Tap to Pay, iPhone XS and later / Android 11+",
        supported: true,
      },
      {
        // The row SumUp wins, kept in SumUp's own words. Their item catalogue
        // is in the FREE app — not, as is sometimes assumed, behind a terminal
        // purchase — and it is more developed than ours. Checked before
        // publishing precisely because the opposite claim would be disproved
        // by one click on their pricing page.
        key: "item-grid",
        value:
          "Yes — Selling Layouts, categories, SKUs, variants and images, in the free app. More developed than Zolto's.",
        supported: true,
        cost: "Free — no terminal needed",
        costSourceId: "sumup-pos-software",
      },
      { key: "twint", value: "No", supported: false },
      { key: "postfinance", value: "No", supported: false },
      {
        key: "stock-in-person",
        value: "Yes, including low-stock alerts and a “Sold out” label",
        supported: true,
      },
      {
        key: "sell-by-amount",
        value: "You can charge an amount, but nothing reconciles it afterwards",
        supported: "partial",
      },

      // ── The shop ──
      {
        key: "online-store",
        value: "Yes — a basic online store and payment links",
        supported: true,
      },
      {
        key: "builds-storefront",
        value: "No — a template you fill in yourself",
        supported: false,
      },
      {
        key: "stock-shared",
        value:
          "Yes — SumUp states the till and Online Store sync automatically. Stock updates when a sale completes, not when a checkout starts.",
        supported: true,
      },
      {
        key: "multilingual",
        value: "You write every listing, in every language, yourself",
        supported: false,
      },
      {
        key: "setup",
        value: "Under an hour — faster than ours",
        supported: true,
      },

      // ── The AI ──
      { key: "ai-listings", value: "No", supported: false },
      { key: "ai-photography", value: "No", supported: false },
      {
        key: "ai-intake",
        value: "No — you build the catalogue by hand",
        supported: false,
      },
      { key: "ai-support", value: "No", supported: false },
      {
        key: "ai-insights",
        value: "Sales reports and a dashboard — figures, not a read on them",
        supported: "partial",
      },
      { key: "ai-discovery", value: "No", supported: false },
      { key: "agent-checkout", value: "No", supported: false },

      // ── The money ──
      {
        key: "who-holds-money",
        value: "SumUp settles to your bank in 2–3 days",
        supported: "partial",
      },
      {
        key: "card-rate",
        // The row they beat us on, in their favour, with the catch attached
        // rather than omitted.
        value:
          "0.99% domestic on Payments Plus, or 1.5% debit / 2.5% credit pay-as-you-go — cheaper than ours either way",
        supported: true,
        cost: "0.99% needs Payments Plus at CHF 29/month, owed whether or not you sell",
        costSourceId: "sumup-pos-lite",
      },
      {
        key: "commitment",
        value: "No contract; a reader is CHF 49–99 if you want one",
        supported: true,
      },
      {
        key: "swiss",
        value:
          "Available in Switzerland; your contract is with SumUp Limited in Dublin, an EU-regulated e-money institution",
        supported: true,
      },
    ],
    rateIds: [
      "sumup-payments-plus",
      "sumup-debit",
      "sumup-credit",
      "sumup-online",
    ],
    sourceIds: [
      "sumup-pos-lite",
      "sumup-item-catalogue",
      "sumup-inventory",
      "sumup-cbi-register",
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
      "A large French payments processor that absorbed SIX Payment Services in 2018 and became the incumbent for Swiss card terminals. It offers in-store terminals, Tap on Mobile on an ordinary phone, and the Saferpay online gateway — and it supports the full Swiss payment mix, PostFinance Pay included.",
    betterWhen: [
      "You need PostFinance Pay. Worldline is the only one of the three that supports it, and if you need it the comparison ends there.",
      "Tap on Mobile suits you: 1.7% flat, no fixed monthly cost, and it takes TWINT. For a small merchant who doesn't need a catalogue, that is a genuinely competitive offer.",
      "You have real volume and want negotiated rates with dedicated account management.",
      "You want an established Swiss acquiring relationship with formal contract terms.",
    ],
    zoltoWhen: [
      "You want your products in the till. Tap on Mobile is a payment app — you type in an amount every time, or buy and integrate separate till software.",
      "You want an online shop, not a checkout to bolt onto a site you commission. Saferpay is a gateway, not a store.",
      "You're one person or a small studio, and a multi-year terminal contract is overkill.",
      "You want to be selling this weekend rather than after a sales process.",
    ],
    capabilities: [
      // ── The till ──
      {
        key: "no-hardware",
        value: "Yes — Tap on Mobile, iPhone / Android 12+",
        supported: true,
      },
      {
        key: "item-grid",
        value:
          "Not on Tap on Mobile — it is payment-only, so you type an amount each time. It integrates app-to-app with third-party till software.",
        supported: false,
        cost: "A catalogue means buying and integrating separate till software",
        costSourceId: "worldline-tap-on-mobile",
      },
      { key: "twint", value: "Yes", supported: true },
      {
        key: "postfinance",
        value: "Yes — the only one of the three that supports it",
        supported: true,
      },
      {
        key: "stock-in-person",
        value: "Not applicable — there is no catalogue to count against",
        supported: "n/a",
      },
      {
        key: "sell-by-amount",
        value: "Typing an amount is the only mode",
        supported: "n/a",
      },

      // ── The shop ──
      {
        key: "online-store",
        value:
          "No shop — Saferpay is a checkout gateway you bolt onto a site you commission",
        supported: false,
        cost: "Saferpay Go / Easy / Flex at CHF 9.95 / 19.95 / 39.95 per month plus a one-time CHF 49–299, on top of acquiring — and you still pay someone to build the site",
        costSourceId: "worldline-saferpay-prices",
      },
      { key: "builds-storefront", value: "No", supported: false },
      {
        key: "stock-shared",
        value: "No online store to share stock with",
        supported: false,
      },
      {
        key: "multilingual",
        value: "Whatever your own site does",
        supported: "n/a",
      },
      {
        key: "setup",
        value:
          "Up to a week to activate the acceptance contract, after a document pack: commercial-register extract, ID, bank details, financial statements",
        supported: "partial",
        cost: "Sales-led onboarding, not self-serve",
        costSourceId: "worldline-ch-selfonboarding",
      },

      // ── The AI ──
      { key: "ai-listings", value: "No", supported: false },
      { key: "ai-photography", value: "No", supported: false },
      { key: "ai-intake", value: "No", supported: false },
      { key: "ai-support", value: "No", supported: false },
      {
        key: "ai-insights",
        value: "Merchant reporting — figures, not a read on them",
        supported: "partial",
      },
      { key: "ai-discovery", value: "No", supported: false },
      { key: "agent-checkout", value: "No", supported: false },

      // ── The money ──
      {
        key: "who-holds-money",
        value: "Worldline settles per contract",
        supported: "partial",
      },
      {
        key: "card-rate",
        value:
          "Tap on Mobile is 1.7% flat with no monthly fee — cheaper than ours, and it takes TWINT. Terminals are interchange++, negotiated.",
        supported: true,
        cost: "Terminal pricing is a negotiation, and terminal contracts are typically multi-year",
        costSourceId: "moneyland-merchant-fees",
      },
      {
        key: "commitment",
        value: "Negotiated contract; terminal contracts typically multi-year",
        supported: false,
      },
      {
        key: "swiss",
        value:
          "The Swiss incumbent, via SIX Payment Services — though SIX has since written the holding down and given up its board seat",
        supported: true,
      },
    ],
    rateIds: ["worldline-tap-on-mobile"],
    sourceIds: [
      "worldline-tap-on-mobile",
      "worldline-saferpay-prices",
      "moneyland-merchant-fees",
    ],
    /**
     * Published, primary-sourced, and material to the one argument Worldline is
     * usually chosen on: that the incumbent is the safe option. Deliberately
     * limited to the credit rating and SIX's own disclosure — both are matters
     * of record about Swiss continuity. The fraud reporting and the market-cap
     * collapse are omitted on purpose: they read as attack rather than
     * analysis, and this page's credibility rests on conceding fairly.
     */
    risks: [
      {
        statement:
          "S&P downgraded Worldline to BB — below investment grade — in August 2025, citing weaker-than-expected operating performance, with a negative outlook.",
        sourceId: "worldline-sp-downgrade",
      },
      {
        statement:
          "SIX Group, which bought 27% of Worldline as part of the SIX Payment Services deal, booked an impairment of roughly CHF 550 million in November 2025, declined to take part in Worldline's capital increase, gave up its board seat, and reclassified the holding from a strategic to a financial investment.",
        sourceId: "six-worldline-participation",
      },
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

/**
 * What Zolto is bad at, published rather than left to be discovered.
 *
 * The August 2026 pricing review ended its case for Zolto with a list of
 * Zolto's own risks, on the grounds that a comparison which concedes nothing
 * about itself gets discounted along with everything else on the page. That
 * reasoning is already the repo's own — it's why `Competitor.betterWhen`
 * exists, and why the research page keeps its unflattering finding — but it
 * had never been turned on us.
 *
 * Every entry here is either checkable against this codebase or already
 * disclosed in a planning document nobody reads. That's the test for adding
 * one: if a merchant would be annoyed to learn it three months in, it belongs
 * on the page rather than in a doc.
 */
export interface Limitation {
  /** The short form, for a heading. */
  title: string;
  /** The honest version, including why it isn't fixed yet. */
  detail: string;
}

export const ZOLTO_LIMITATIONS: Limitation[] = [
  {
    title: "We have no track record",
    detail:
      "SumUp and Worldline have a decade or more each. Zolto is new, and a new company is a risk on its own terms however good the product is. What we can offer against that: no contract, no hardware to buy, and one-click export of everything you've put in — on the Free plan too. Leaving costs you an afternoon, not a termination fee.",
  },
  {
    title: "Taking a card through us is the dearest option on our own table",
    detail:
      "Swiss-issued cards bill at Stripe's non-EEA rate — 2.9% plus CHF 0.20 — and Zolto adds nothing on top, which still leaves every other in-person option on our comparison cheaper than ours. SumUp's online rate beats ours on every plan too. Two honest responses: take TWINT where you can, which sits in the same till and costs less than half as much; and choose Zolto because it removes the work, not because it removes the fee. If cost per card sale is your deciding number, it decides against us.",
  },
  {
    title: "Everything runs on Stripe, and Stripe sets the real price",
    detail:
      "Stripe holds the funds until payout, runs the identity checks, owns the chargeback process, and sets the rate that dominates what a sale costs you. Zolto never touches your money, which is the good half of that arrangement; the other half is that our own sovereignty ledger lists card payments as still moving, and until it stops moving, a hard dependency is what it is.",
  },
  {
    title: "Parts of our stack are still outside Europe",
    detail:
      "Four rows of the Made in Switzerland ledger say so by name: card payments, the AI model provider, product-photo storage and account email. The ledger is published with those rows in it rather than without them, and each one carries the next step we've committed to.",
  },
  {
    title: "The AI discovery channel has no shoppers in it yet",
    detail:
      "Every store ships llms.txt and an MCP endpoint, and the platform directory that lets an assistant find a Swiss maker is live — and currently empty, because storefronts are only now launching. The infrastructure is real; the traffic is a bet. Treat it as a reason to be early, not as a channel already selling for you.",
  },
  {
    title: "We are below the Swiss VAT threshold",
    detail:
      "Swiss VAT registration is mandatory only above CHF 100,000 of annual turnover, and Zolto is under it, so the prices you see are simply the prices. It also tells you how small we are. If that changes, prices will say which way they're quoted, and we'll say so before it happens.",
  },
];

/**
 * The three questions that decide this purchase, answered honestly — including
 * when the answer is "not us".
 *
 * Taken from the review's closing section. It is a routing tool rather than a
 * pitch: two of the three outcomes send the reader to a competitor, and that is
 * the point. A buyer who discovers on day three that their customers all pay by
 * TWINT, or that they needed PostFinance Pay, is a refund and a bad review; a
 * buyer we sent to SumUp on day zero is neither.
 */
export interface BuyerQuestion {
  question: string;
  /** What follows from each answer, stated without hedging. */
  answers: { when: string; then: string }[];
}

export const BUYER_FIT: BuyerQuestion[] = [
  {
    question: "Do your customers pay by TWINT?",
    answers: [
      {
        when: "Yes, most of them",
        then: "SumUp is out, whatever it costs — its till cannot take TWINT at all. That leaves Zolto and Worldline, and the question becomes whether you want your catalogue in the till. It's also the cheapest answer for you: TWINT at 1.3% is the least you can pay to be handed money at a stall without a monthly subscription.",
      },
      {
        when: "No, they mostly tap a card",
        then: "Then the card rate is your number, and ours is the highest on this page — Swiss cards bill at Stripe's non-EEA rate and we add nothing to it. SumUp is cheaper and its till app is more mature. Choose Zolto for the shop, the listings and the one inventory, or don't choose it.",
      },
    ],
  },
  {
    question: "Do you need PostFinance Pay?",
    answers: [
      {
        when: "Yes",
        then: "Only Worldline supports it. Nothing else on this page qualifies, and no amount of the rest of our argument changes that.",
      },
      { when: "No", then: "All three are still in play." },
    ],
  },
  {
    question: "How much do you sell on cards each month?",
    answers: [
      {
        when: "Above roughly CHF 1,900 on credit cards, or CHF 5,700 on debit",
        then: "SumUp's Payments Plus subscription pays for itself and beats our card rate outright. Our case has to be made on the shop and the inventory, not the arithmetic.",
      },
      {
        when: "Below that, or wildly seasonal",
        then: "A subscription you owe in a quiet month is the wrong shape. Zolto's Free plan costs nothing in a month you don't sell online, and nothing ever on in-person sales.",
      },
    ],
  },
];
