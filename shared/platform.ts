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
    "Zolto gives independent makers and artisans a point-of-sale and an online store that share one inventory — with an AI assistant that handles setup, product photos, listings, and support. Sell online and in person without managing technology.",
  /** Who it's for — used in schema audience + llms briefs. */
  audience:
    "Independent makers, artisans, and small shop owners — people who sell at craft fairs, markets, and pop-ups and want an online store without hiring a developer.",
  /** Free to start; paid plans from €19/mo with a 14-day trial. */
  pricingSummary:
    "Free to start (no card required). Paid plans from €19/month with a 14-day free trial. Month-to-month, cancel anytime.",
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
  priceEur: number;
  blurb: string;
  cta: string;
  highlight?: boolean;
  features: string[];
}

/**
 * Pricing tiers — the source of truth for both the marketing pricing page and
 * the machine-readable Offers (JSON-LD / MCP / llms). Prices are placeholders
 * pending the VAT-inclusive-vs-exclusive decision (business-plan §7.1).
 */
export const PLANS: PlatformPlan[] = [
  {
    id: "free",
    name: "Free",
    priceEur: 0,
    blurb: "For makers exploring.",
    cta: "Get started free",
    features: [
      "Up to 50 products",
      "1 staff member",
      "Basic POS",
      "10 AI descriptions / month",
      "Community support",
    ],
  },
  {
    id: "maker",
    name: "Maker",
    priceEur: 19,
    blurb: "For solo makers.",
    cta: "Start 14-day free trial",
    highlight: true,
    features: [
      "Unlimited products",
      "Full POS + online store",
      "Unlimited AI descriptions",
      "Bulk upload",
      "Real-time inventory sync",
      "Email support",
    ],
  },
  {
    id: "studio",
    name: "Studio",
    priceEur: 49,
    blurb: "For small teams.",
    cta: "Start 14-day free trial",
    features: [
      "Everything in Maker",
      "5 staff members",
      "Custom domain",
      "Advanced analytics",
      "Priority support",
    ],
  },
  {
    id: "atelier",
    name: "Atelier",
    priceEur: 99,
    blurb: "For growing brands.",
    cta: "Contact sales",
    features: [
      "Everything in Studio",
      "20 staff members",
      "API access",
      "Custom AI training",
      "Dedicated support + SLA",
    ],
  },
];

export function formatPrice(eur: number): string {
  return eur === 0 ? "€0" : `€${eur}`;
}

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
    a: "There's a free plan (no card required). Paid plans start at €19/month for the Maker plan, with a 14-day free trial. Plans are month-to-month — cancel anytime.",
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
