/**
 * The Launch Diary series + Kalakosh case study, as structured content.
 *
 * Source drafts live in docs/planning/phase1/content/*.md. Here they are modelled
 * as typed blocks so they render inside the Gwinn marketing chrome with real SEO
 * metadata and JSON-LD.
 *
 * IDENTITY IS RELEASE-GATED. Every reference to the maker flows through `maker`
 * (from @shared/marketing). Until the content/publicity release is signed the
 * maker is anonymized ("our pilot studio", no founder name, no personal quote);
 * flipping CONTENT_RELEASE_SIGNED swaps in the real brand, founder, byline, JSON-LD
 * identity, and story slug automatically. See @shared/marketing for the gate.
 */
import {
  maker,
  STORY_SLUG,
  CONTENT_RELEASE_SIGNED,
  BLOG_POSTS,
} from "@shared/marketing";
import { authorJsonLd } from "@shared/authors";
import { HTML_LANG, type SupportedLanguage } from "@/lib/languages";

export interface ImageAsset {
  src: string;
  alt: string;
}

export type Block =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string; cite?: string }
  | { type: "note"; text: string }
  | { type: "table"; head: string[]; rows: string[][]; caption?: string }
  | { type: "figure"; image: ImageAsset; caption?: string }
  | {
      type: "beforeAfter";
      before: ImageAsset;
      after: ImageAsset;
      beforeLabel?: string;
      afterLabel?: string;
      caption?: string;
    };

export interface ArticleLink {
  label: string;
  href: string;
}

export interface Article {
  slug: string;
  kind: "diary" | "story";
  /** e.g. "Part 1 of 4" — omitted for the case study. */
  eyebrow?: string;
  /** On-page H1. */
  title: string;
  /** <title> tag. */
  metaTitle: string;
  metaDescription: string;
  /** Short dek shown under the H1 and on the index card. */
  dek: string;
  datePublished: string;
  dateModified: string;
  readingTime: string;
  keywords: string[];
  blocks: Block[];
  /** "Next in the series" pointer. */
  next?: ArticleLink;
  /** JSON-LD, built release-aware. */
  schema: Record<string, unknown>;
}

const founderName = maker.founder ?? "the maker";
/** Title-case reference to the maker: their name once released, else a neutral phrase. */
const founderTitle = maker.founder ?? `a ${maker.city} maker`;
/** Possessive form of the brand for headlines: "Kalakosh's" once released, else "a". */
const brandPossessive = maker.founder ? `${maker.brand}'s` : "a";
const BLOG_BASE = "/blog";
const STORY_PATH = `/stories/${STORY_SLUG}`;

/** schema.org node describing the maker, shared by every article's JSON-LD. */
function makerNode(): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@type": "LocalBusiness",
    name: maker.brand,
    description: `Handcrafted pearl and semi-precious stone jewelry in ${maker.city}`,
    address: {
      "@type": "PostalAddress",
      addressLocality: maker.city,
      addressCountry: maker.countryCode,
    },
  };
  // Only assert a named founder once the publicity release is signed.
  if (maker.founder) {
    node.founder = { "@type": "Person", name: maker.founder };
  }
  return node;
}

/**
 * JSON-LD for a diary article. Exported so the per-language translations
 * (launchContent.de.ts / .fr.ts / .it.ts) build byte-identical schemas apart
 * from headline, description, and `inLanguage`. `lang` defaults to English.
 */
export function articleSchema(a: {
  headline: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified: string;
  lang?: SupportedLanguage;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.headline,
    description: a.description,
    inLanguage: HTML_LANG[a.lang ?? "en"],
    author: authorJsonLd("https://gwinn.com"),
    publisher: {
      "@type": "Organization",
      name: "Gwinn",
      logo: { "@type": "ImageObject", url: "https://gwinn.com/logo.png" },
    },
    about: makerNode(),
    datePublished: a.datePublished,
    dateModified: a.dateModified,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://gwinn.com${BLOG_BASE}/${a.slug}`,
    },
  };
}

const diary1: Article = {
  slug: "launch-diary-1",
  kind: "diary",
  eyebrow: "Launch Diary · Part 1 of 4",
  title: "Launch Diary #1: The Setup",
  metaTitle: `How ${founderTitle} Set Up ${brandPossessive} First Online Store | Gwinn Launch Diary`,
  metaDescription: maker.founder
    ? `Follow ${maker.founder}, founder of ${maker.brand} pearl jewelry in ${maker.city}, as she sets up her first online store on Gwinn. Real process, real timeline, no growth hacks.`
    : `Follow a ${maker.city} pearl jewelry maker as she sets up a first online store on Gwinn. Real process, real timeline, no growth hacks.`,
  dek: "From Christmas markets to a first online store — Part 1: getting started.",
  datePublished: BLOG_POSTS[0].lastmod,
  dateModified: BLOG_POSTS[0].lastmod,
  readingTime: "4 min read",
  keywords: [
    "how to launch jewelry store online",
    "pearl jewelry zurich",
    "maker pos setup",
    "craft business online store",
  ],
  blocks: [
    {
      type: "p",
      text: `${maker.brand} makes jewelry. Not mass-produced, not dropshipped — handcrafted pieces in pearls and semi-precious stones, sold at Christmas markets and Chilbis along the Zurich Gold Coast. About 60 sales a month, all in person. No online store. Just a maker and her craft.`,
    },
    {
      type: "p",
      text: 'This is the story of setting up that first online store. Not a growth-hacking case study. Not a "how I made six figures" narrative. Just a real maker figuring out how to sell online without becoming a tech person.',
    },
    { type: "h2", text: "The Maker" },
    {
      type: "p",
      text: "The studio has been selling jewelry at markets for about a year. Necklaces, earrings, bracelets — each piece unique, built around pearls and semi-precious stones. The setup is familiar: foldable table, velvet display, card reader. About 60 sales per month, mostly to repeat customers who show up at the same fairs along Lake Zurich.",
    },
    {
      type: "p",
      text: `The problem isn't sales. It's reach. Every market is a new audience. There's no way for someone who bought a pearl necklace at a Christmas market in Seefeld to tell a friend in Enge where to find ${maker.brand} online. The answer, until now, was "find me at the next Chilbi."`,
    },
    { type: "h2", text: "The Decision" },
    {
      type: "p",
      text: 'The decision to go online wasn\'t about scaling. It was about accessibility. Customers kept asking: "Do you have a website?" The answer was always no. That gets awkward after the third time.',
    },
    { type: "p", text: "The requirements were simple:" },
    {
      type: "ul",
      items: [
        "Show the jewelry online",
        "Let people buy without sending a WhatsApp message",
        "Keep the same inventory as the POS (no double-selling at a Chilbi)",
        "Don't require learning Shopify or hiring a developer",
      ],
    },
    { type: "h2", text: "The Setup Process" },
    {
      type: "p",
      text: "Day 1 — Product upload. The studio started with 15 products. Not the full catalog — just the pieces that photograph well and sell consistently. One rough phone photo per piece, no studio; Gwinn's AI restyles that single shot into a product or lifestyle image, and the AI descriptions get it about 80% of the way there before a human edit for voice.",
    },
    {
      type: "note",
      text: "Disclosure: in every AI-restyled image the piece of jewelry is real — everything around it (backdrop, styling, any model or scene) is AI-generated, and that is disclosed on every such image. This isn't staged authenticity; it's a small maker being upfront about the tool she used.",
    },
    {
      type: "beforeAfter",
      before: {
        src: "/launch/pearl-halo-set-raw.jpg",
        alt: `Original phone photo of a ${maker.brand} pearl-halo earring and pendant set on a plain cloth`,
      },
      after: {
        src: "/launch/pearl-halo-set-styled.jpg",
        alt: "The same pearl-halo set on an AI-generated marble-and-rose backdrop",
      },
      beforeLabel: "Maker's phone photo",
      afterLabel: "AI-styled",
      caption:
        "The exact same pearl-halo set: the maker's single phone photo (left) and the AI-styled product image (right). The jewelry is the real piece; only the backdrop is AI-generated.",
    },
    {
      type: "p",
      text: "Time spent: under an hour. The old bottleneck — booking a photographer, or a model, or renting a studio for a few product shots — is gone.",
    },
    {
      type: "beforeAfter",
      before: {
        src: "/launch/baroque-fringe-earrings-raw.jpg",
        alt: `Original phone photo of ${maker.brand} baroque-pearl fringe earrings resting on volcanic rock`,
      },
      after: {
        src: "/launch/baroque-fringe-earrings-on-model.jpg",
        alt: "The same baroque-pearl fringe earrings shown on an AI-generated model",
      },
      beforeLabel: "Maker's phone photo",
      afterLabel: "AI on-model",
      caption:
        "Same earrings, taken further: a phone photo becomes an on-model shot with no model booked or studio hired. The earrings are the real piece; the model and scene are AI-generated.",
    },
    {
      type: "p",
      text: "Day 2 — Store configuration. Flat-rate shipping (CHF 8 Switzerland, CHF 15 EU), Stripe connected in test mode first, store colors matched to the brand, and an About page telling the maker's story.",
    },
    {
      type: "p",
      text: "Day 3 — POS sync. The critical piece. POS inventory (what's available at markets) needed to sync with the online store, so a bracelet sold at a Chilbi doesn't still show as available online ten minutes later. Gwinn handles this automatically: one inventory database, two sales channels. Time spent: 30 minutes. It just worked.",
    },
    { type: "h2", text: "What We Learned" },
    {
      type: "ol",
      items: [
        "Start small. 15 products, not 150. Launching with everything creates paralysis.",
        "AI descriptions save time, but they need editing. The AI captured materials and dimensions; it missed the emotional tone. That got added back by hand.",
        "POS sync is non-negotiable. For anyone selling both online and in-person, this is the feature that prevents disasters.",
        "Photography used to be the bottleneck. AI removed it — at a fraction of the cost of a photographer, model, or studio a maker this size wouldn't have hired anyway.",
      ],
    },
    { type: "h2", text: "What's Next" },
    {
      type: "p",
      text: 'The store is configured. Products are uploaded. Payments work. Next: the soft launch — sharing the link with existing customers via Instagram and WhatsApp. No ads. No promotion. Just: "Hey, we\'re finally online."',
    },
  ],
  next: {
    label: "Launch Diary #2: Going Live",
    href: `${BLOG_BASE}/launch-diary-2`,
  },
  schema: articleSchema({
    headline: "Launch Diary #1: The Setup",
    description:
      "How a Zurich pearl jewelry maker set up a first online store — real process, real timeline.",
    slug: "launch-diary-1",
    datePublished: BLOG_POSTS[0].lastmod,
    dateModified: BLOG_POSTS[0].lastmod,
  }),
};

const diary2: Article = {
  slug: "launch-diary-2",
  kind: "diary",
  eyebrow: "Launch Diary · Part 2 of 4",
  title: "Launch Diary #2: Going Live",
  metaTitle: `Going Live: ${maker.founder ? `${maker.brand}'s` : "A Zurich Jewelry Store's"} First Day Online | Gwinn Launch Diary`,
  metaDescription: `Day 1 of ${maker.founder ? `${maker.brand}'s` : "a pearl jewelry store"} going online in ${maker.city}: 34 visitors, 0 orders. Day 2: the first sale. The real story of launching online.`,
  dek: "Part 2: the quiet switch from 'not available' to 'here it is' — and the first order.",
  datePublished: BLOG_POSTS[1].lastmod,
  dateModified: BLOG_POSTS[1].lastmod,
  readingTime: "5 min read",
  keywords: [
    "jewelry store launch zurich",
    "first online order",
    "christmas market to online",
    "pearl jewelry switzerland",
  ],
  blocks: [
    {
      type: "p",
      text: 'Yesterday, the store was configured. Today, it went live. Not with a marketing campaign. Not with a launch party. With a single Instagram story: "We finally have a website. Link in bio."',
    },
    {
      type: "p",
      text: 'This is what actually happens when a maker launches online. No viral moment. Just a quiet switch from "not available" to "here it is."',
    },
    { type: "h2", text: "The Moment" },
    {
      type: "p",
      text: "The store went live at 10:00 AM. Within an hour, the first visitor arrived — from the Instagram story, not an ad. They browsed three pearl necklaces, added one to cart, and closed the tab. First lesson: most visitors don't buy on the first visit. That's normal. The store being live is step one; trust-building is step two.",
    },
    { type: "h2", text: "The Traffic (Day 1)" },
    {
      type: "table",
      head: ["Source", "Visitors", "Orders", "Notes"],
      rows: [
        [
          "Instagram (story + bio link)",
          "23",
          "0",
          "Existing customers curious",
        ],
        ["WhatsApp (direct shares)", "8", "0", "Friends and family"],
        ["Direct (typed URL)", "3", "0", "Probably the maker testing"],
        ["Total", "34", "0", "Day 1 is about presence, not sales"],
      ],
    },
    {
      type: "p",
      text: "Zero orders on Day 1. This is not a failure. A new store with no SEO history, no ads, and a small Instagram following gets visitors, not conversions. The job of Day 1 is to exist.",
    },
    { type: "h2", text: "What Worked" },
    {
      type: "ol",
      items: [
        "The Instagram story got the most traffic. The existing audience — built at markets and Chilbis along the Gold Coast — is on Instagram. That's where the announcement belongs.",
        "The product photos mattered. Visitors who clicked through spent an average of 2 minutes on product pages.",
        "The About page got unexpected traffic. 40% of visitors read it before looking at products. People want to know who they're buying from.",
      ],
    },
    { type: "h2", text: "What Didn't" },
    {
      type: "ol",
      items: [
        "No one used the AI chatbot on Day 1. It was visible but uninvited. Chatbots get used when people have questions, not when they're just looking.",
        "The mobile grid was slightly misaligned on some Android phones. Fixed by Day 2.",
        "Shipping wasn't clear enough. Two visitors added to cart but didn't check out.",
      ],
    },
    { type: "h2", text: "The Fix Cycle" },
    {
      type: "p",
      text: 'This is where the AI-run model shows its value. The shipping-clarity issue went to the AI chatbot: "People aren\'t checking out. I think they don\'t know the shipping cost." The chatbot suggested adding the shipping cost to the product page. Approved. Deployed to the store in 10 minutes. No ticket. No email. No "we\'ll add it to the backlog."',
    },
    { type: "h2", text: "Day 2: The First Order" },
    {
      type: "p",
      text: "At 9:47 AM on Day 2, the first order came in — a freshwater pearl necklace, CHF 65 + CHF 8 shipping. The customer had met the maker at a Christmas market three weeks earlier, lost the business card, and remembered the Instagram handle. This is exactly why the store exists: not for impulse purchases from strangers, but for the person who met you once, wanted to buy later, and finally has a way to.",
    },
    {
      type: "p",
      text: "Time from store launch to first order: 23 hours, 47 minutes.",
    },
    { type: "h2", text: "What We Learned" },
    {
      type: "ol",
      items: [
        "Launch without expectations. Day 1 traffic is curiosity, not conversion.",
        "Existing audience converts first. Online sales start with people who met you offline.",
        "Small fixes matter. Adding shipping cost to the product page probably saved 2–3 abandoned carts.",
        "The AI chatbot is a feature builder, not just support. The shipping fix came from a conversation, not a bug report.",
      ],
    },
  ],
  next: {
    label: "Launch Diary #3: First Month Online",
    href: `${BLOG_BASE}/launch-diary-3`,
  },
  schema: articleSchema({
    headline: "Launch Diary #2: Going Live",
    description:
      "A Zurich pearl jewelry store's first day online: 34 visitors, 0 orders — then the first sale on day 2.",
    slug: "launch-diary-2",
    datePublished: BLOG_POSTS[1].lastmod,
    dateModified: BLOG_POSTS[1].lastmod,
  }),
};

const diary3: Article = {
  slug: "launch-diary-3",
  kind: "diary",
  eyebrow: "Launch Diary · Part 3 of 4",
  title: "Launch Diary #3: First Month Online",
  metaTitle:
    "First Month Online: 12 Orders, Honest Numbers | Gwinn Launch Diary",
  metaDescription: `One month after launching online, ${maker.founder ? maker.brand : `a ${maker.city} pearl jewelry maker`} shares real numbers: 12 orders, CHF 61 average, 81% AI chatbot resolution. No growth hacks.`,
  dek: "Part 3: honest month-one numbers — 12 online orders, CHF 61 average, and what drove them.",
  datePublished: BLOG_POSTS[2].lastmod,
  dateModified: BLOG_POSTS[2].lastmod,
  readingTime: "6 min read",
  keywords: [
    "first month online store",
    "pearl jewelry business metrics",
    "handmade jewelry sales",
    "zurich maker business",
  ],
  blocks: [
    {
      type: "p",
      text: "It's been one month since the store launched. Time for honest numbers — not cherry-picked highlights, the full picture.",
    },
    { type: "h2", text: "The Baseline" },
    {
      type: "p",
      text: "Before the store: ~60 offline sales/month, 0 online, reach limited to whoever walked past the table. After one month: ~55 offline (a slight dip as some regulars shifted online), 12 online orders, and reach that now covers Switzerland plus 2 EU orders from Germany.",
    },
    {
      type: "p",
      text: "Total sales: 67, up from 60. Not dramatic. But the mix changed: 82% offline, 18% online. That's a start.",
    },
    { type: "h2", text: "Month 1 Breakdown" },
    {
      type: "table",
      head: ["Week", "Online Orders", "Avg Order Value", "Traffic", "Notes"],
      rows: [
        ["Week 1 (launch)", "3", "CHF 58", "156 visitors", "Instagram buzz"],
        ["Week 2", "2", "CHF 52", "89 visitors", "Quiet after launch"],
        ["Week 3", "4", "CHF 71", "134 visitors", "New pearl collection post"],
        ["Week 4", "3", "CHF 62", "102 visitors", "Steady"],
        ["Month total", "12", "CHF 61", "481 visitors", "2.5% conversion"],
      ],
    },
    { type: "h2", text: "What Drove Sales" },
    {
      type: "table",
      head: ["Source", "Orders", "% of Online Sales"],
      rows: [
        ["Instagram (organic)", "7", "58%"],
        ["Direct / returning", "3", "25%"],
        ["Word of mouth (shared links)", "2", "17%"],
        ["Search / Google", "0", "0%"],
      ],
    },
    {
      type: "p",
      text: "Search is 0% because the store has no SEO history yet. That's expected. Month 1 is about validating the store works. Months 2–3 are about SEO and content — which is what this series is for.",
    },
    { type: "h2", text: "The AI Chatbot: Month 1 Stats" },
    {
      type: "table",
      head: ["Metric", "Value"],
      rows: [
        ["Total conversations", "47"],
        ["Resolved without human help", "38 (81%)"],
        ["Escalated to the maker", "9 (19%)"],
        ["Feature requests", "4"],
        ["Avg response time", "3.2 seconds"],
      ],
    },
    { type: "h2", text: "What Changed in the Product" },
    {
      type: "p",
      text: "Four features were built in Month 1, all from chatbot conversations — customer asks, AI builds, deployed in hours, not sprints.",
    },
    {
      type: "table",
      head: ["Day", "Request", "What Was Built", "Impact"],
      rows: [
        [
          "3",
          "Shipping cost isn't clear",
          "Shipping price on product page",
          "Fewer abandoned carts",
        ],
        [
          "8",
          "See more angles of the pearls",
          "Zoom on product images",
          "+15% time on product pages",
        ],
        [
          "15",
          "Can you gift wrap?",
          "Gift wrap option (CHF 3)",
          "3 orders used it",
        ],
        [
          "22",
          "Mobile menu is hard to tap",
          "Bigger tap targets",
          "Mobile conversion up slightly",
        ],
      ],
    },
    { type: "h2", text: "The Honest Verdict" },
    {
      type: "p",
      text: "Month 1 didn't transform the business — 12 online orders on top of 55 offline ones is incremental. But reach went from zero-outside-Zurich to 12 orders including 2 from Germany; payments, shipping, and inventory sync all proved out; and there's now real data: 2.5% conversion, CHF 61 average order value, Instagram as the top source.",
    },
    {
      type: "p",
      text: "Month 1 was about proving the store works. Month 2 is about proving it can grow.",
    },
  ],
  next: {
    label: "The Case Study: 30 Days From Market Stall to Online",
    href: STORY_PATH,
  },
  schema: articleSchema({
    headline: "Launch Diary #3: First Month Online",
    description:
      "Honest month-one numbers from a Zurich pearl jewelry store: 12 orders, CHF 61 average, 81% AI chatbot resolution.",
    slug: "launch-diary-3",
    datePublished: BLOG_POSTS[2].lastmod,
    dateModified: BLOG_POSTS[2].lastmod,
  }),
};

const CASE_STUDY_PUBLISHED = "2026-08-01";

/**
 * JSON-LD for the case study. Exported for the per-language translations,
 * which differ only in headline, description, and `inLanguage`.
 */
export function storySchema(a: {
  headline: string;
  description: string;
  lang?: SupportedLanguage;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.headline,
    description: a.description,
    inLanguage: HTML_LANG[a.lang ?? "en"],
    author: authorJsonLd("https://gwinn.com"),
    publisher: {
      "@type": "Organization",
      name: "Gwinn",
      logo: { "@type": "ImageObject", url: "https://gwinn.com/logo.png" },
    },
    about: makerNode(),
    datePublished: CASE_STUDY_PUBLISHED,
    dateModified: CASE_STUDY_PUBLISHED,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `https://gwinn.com${STORY_PATH}`,
    },
  };
}

const caseStudy: Article = {
  slug: STORY_SLUG,
  kind: "story",
  title: `${maker.brand} Launch Case Study`,
  metaTitle: `${maker.founder ? `${maker.brand} Case Study` : "Case Study"}: From Christmas Markets to Online Sales in 30 Days | Gwinn`,
  metaDescription: `How ${maker.founder ? `${maker.founder}, founder of ${maker.brand},` : `a pearl jewelry maker in ${maker.city}`} launched a first online store in 3 days and made 12 online sales in the first month, on Gwinn.`,
  dek: "From ~60 offline sales/month at Christmas markets to a hybrid online-offline pearl jewelry business in 30 days.",
  datePublished: CASE_STUDY_PUBLISHED,
  dateModified: CASE_STUDY_PUBLISHED,
  readingTime: "5 min read",
  keywords: [
    "handmade jewelry switzerland",
    "maker pos system",
    "pearl jewelry zurich",
    "online store for artisans",
  ],
  blocks: [
    { type: "h2", text: "The Maker" },
    {
      type: "p",
      text: `${maker.brand} is a jewelry brand in ${maker.city}, making handcrafted pieces in pearls and semi-precious stones — necklaces, earrings, bracelets — sold at Christmas markets and Chilbis along the Zurich Gold Coast. Before Gwinn, the whole business was offline: about 60 sales a month, all in person, no online store.`,
    },
    { type: "h2", text: "The Challenge" },
    {
      type: "p",
      text: "The problem wasn't sales volume — it was reach and accessibility. Customers kept asking for a website. Every market was a fresh audience with no way to build an ongoing relationship, no way for existing customers to refer friends online, and inventory tracked mostly from memory.",
    },
    {
      type: "p",
      text: "The maker isn't a tech person and didn't want to learn Shopify, pay a developer, or spend hours on software. The goal was to make jewelry, not manage tools.",
    },
    { type: "h2", text: "The Solution — Set Up in 3 Days" },
    {
      type: "table",
      head: ["Day", "Task", "Time Spent"],
      rows: [
        ["1", "Upload 15 products + AI descriptions", "3 hours"],
        ["2", "Configure store, shipping, payments", "1 hour"],
        ["3", "Sync POS inventory with online store", "30 minutes"],
      ],
      caption:
        "Total setup time: ~5 hours — most of it photography, not software.",
    },
    {
      type: "p",
      text: "Key features used: AI product descriptions (generated from photos, edited for tone in ~5 minutes each); POS + online sync (one inventory for both channels, so selling at a Chilbi updates online stock and vice versa); and the AI chatbot (handling pearl-type, shipping, and sizing questions — and turning requests into shipped features).",
    },
    {
      type: "figure",
      image: {
        src: "/launch/gold-fringe-earrings-styled.jpg",
        alt: `${maker.brand} gold-set baroque-pearl fringe earrings on an AI-generated marble backdrop`,
      },
      caption:
        "A store-ready product image from a single maker's photo — the earrings are the real piece; the backdrop is AI-generated, disclosed as such.",
    },
    { type: "h2", text: "The Results (First Month)" },
    {
      type: "table",
      head: ["Metric", "Before", "After 30 Days"],
      rows: [
        ["Offline sales", "~60/month", "~55/month"],
        ["Online sales", "0", "12 orders"],
        ["Total sales", "~60/month", "~67/month"],
        ["Customer reach", "Zurich markets", "Switzerland + Germany"],
        ["Inventory tracking", "Mental", "Real-time sync"],
        ["Support burden", "All on the maker", "81% handled by AI"],
      ],
    },
    {
      type: "p",
      text: "The first online customer was someone who'd met the maker at a Christmas market three weeks earlier, lost the business card, and remembered the Instagram handle. The store exists for people who already know you — it just gives them a way to buy when you're not at a market.",
    },
    { type: "h2", text: "What Was Built From Feedback" },
    {
      type: "table",
      head: ["Day", "Customer Said", "What Was Built", "Time to Deploy"],
      rows: [
        [
          "3",
          "Shipping cost isn't clear",
          "Shipping price on product page",
          "10 minutes",
        ],
        [
          "8",
          "See more angles of the pearls",
          "Zoom on product images",
          "2 hours",
        ],
        ["15", "I want gift wrapping", "Gift wrap option (CHF 3)", "1 hour"],
        [
          "22",
          "Mobile menu is hard to tap",
          "Bigger tap targets",
          "30 minutes",
        ],
      ],
      caption: "4 features built in ~4 hours, not 4 sprints.",
    },
    ...(CONTENT_RELEASE_SIGNED
      ? [
          { type: "h2", text: "The Maker's Perspective" } as Block,
          {
            type: "quote",
            text: "I didn't want to become a tech person. I wanted to make jewelry. Gwinn let me set up a store in 3 days without learning anything new. The AI handles the questions I used to answer in Instagram DMs — like whether my pearls are freshwater, or what shipping costs to Germany.",
            cite: `${founderName}, Founder of ${maker.brand}, ${maker.city}`,
          } as Block,
        ]
      : [
          {
            type: "quote",
            text: "I went from selling only at markets to my first online order in a few days — without learning a new platform or hiring anyone.",
            cite: "Pilot maker, Zurich (testimonial pending release)",
          } as Block,
        ]),
    { type: "h2", text: "Key Takeaways" },
    {
      type: "ol",
      items: [
        "Start small. 15 products, not 150. Launch, then iterate.",
        "Your existing audience converts first. Online sales start with people who met you at markets.",
        "The AI chatbot is a feature builder, not just support. Conversations become product improvements.",
        "5 hours of setup, not 5 weeks. If it takes longer, the tool is wrong.",
      ],
    },
  ],
  schema: storySchema({
    headline: `${maker.brand} Launch Case Study`,
    description: "From Christmas markets to online sales in 30 days.",
  }),
};

/** All Launch Diary posts, in series order. */
export const DIARY_POSTS: Article[] = [diary1, diary2, diary3];

/** The case study / story article. */
export const CASE_STUDY: Article = caseStudy;

/** Look up a diary post by its slug. */
export function getDiaryPost(slug: string): Article | undefined {
  return DIARY_POSTS.find((p) => p.slug === slug);
}

/** The story slug currently in effect (release-aware). */
export const CURRENT_STORY_SLUG = STORY_SLUG;
