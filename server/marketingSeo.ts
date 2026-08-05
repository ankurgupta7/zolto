import {
  normalizeBaseUrl,
  STORY_SLUG,
  BLOG_POSTS,
  maker,
} from "@shared/marketing";
import {
  PLATFORM,
  FEATURES,
  PLANS,
  FAQS,
  COMPETITORS,
  findCompetitor,
  INCUMBENT_COMPARISON,
  SOVEREIGNTY,
} from "@shared/platform";
import { authorJsonLd } from "@shared/authors";
import {
  SEGMENTS,
  findSegment,
  segmentFeatures,
  renderSegmentText,
} from "@shared/segments";
import {
  PILOT_METHODOLOGY,
  PILOT_METRICS,
  renderPilotResearchText,
} from "@shared/research";
import {
  escapeHtml,
  setMetaContent,
  setTitle,
  appendToHead,
  appendAfterRoot,
  renderJsonLd,
} from "./headInject";

/**
 * Server-side SEO for the Zolto marketing surface. This app is a client-rendered
 * SPA; most AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …) and some search
 * bots do NOT execute JavaScript, so a client-only <head> is invisible to them.
 * This module injects a real per-route <title>, meta description, canonical/OG
 * tags, JSON-LD structured data, and a <noscript> content summary into the HTML
 * before it's served — turning invisible SPA routes into fully indexable pages.
 *
 * Pure string transforms so they're unit-testable without a browser.
 */

export interface MarketingSeo {
  title: string;
  description: string;
  path: string;
  /** JSON-LD graph nodes to embed. */
  jsonLd: Record<string, unknown>[];
  /** Plain-text content for the <noscript> block (non-JS crawlers). */
  noscript: string;
}

// ── JSON-LD builders ──────────────────────────────────────────────────────────

function organizationNode(base: string): Record<string, unknown> {
  return {
    "@type": "Organization",
    "@id": `${base}/#organization`,
    name: PLATFORM.name,
    url: `${base}/`,
    description: PLATFORM.summary,
    logo: { "@type": "ImageObject", url: `${base}/logo.png` },
    image: `${base}/og-image.png`,
  };
}

function websiteNode(base: string): Record<string, unknown> {
  return {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: `${base}/`,
    name: PLATFORM.name,
    description: PLATFORM.summary,
    publisher: { "@id": `${base}/#organization` },
  };
}

function softwareApplicationNode(base: string): Record<string, unknown> {
  const offers = PLANS.map((p) => ({
    "@type": "Offer",
    name: `${PLATFORM.name} ${p.name}`,
    price: p.priceChf,
    priceCurrency: "CHF",
    category: p.name,
    url: `${base}/pricing`,
  }));
  const prices = PLANS.map((p) => p.priceChf);
  return {
    "@type": "SoftwareApplication",
    "@id": `${base}/#software`,
    name: PLATFORM.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: PLATFORM.summary,
    audience: { "@type": "Audience", audienceType: PLATFORM.audience },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "CHF",
      lowPrice: Math.min(...prices),
      highPrice: Math.max(...prices),
      offerCount: offers.length,
      offers,
    },
    featureList: FEATURES.map((f) => f.name),
  };
}

function faqPageNode(): Record<string, unknown> {
  return {
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

function breadcrumb(
  base: string,
  trail: [string, string][],
): Record<string, unknown> {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${base}${path}`,
    })),
  };
}

function articleNode(
  base: string,
  path: string,
  title: string,
  description: string,
  dates?: { published: string; modified: string },
): Record<string, unknown> {
  return {
    "@type": "Article",
    headline: title,
    description,
    author: authorJsonLd(base),
    publisher: { "@id": `${base}/#organization` },
    image: `${base}/og-image.png`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${base}${path}` },
    ...(dates
      ? { datePublished: dates.published, dateModified: dates.modified }
      : {}),
  };
}

// ── Per-route SEO ─────────────────────────────────────────────────────────────

const brand = maker.brand;
const named = Boolean(maker.founder);

/** Concise, SEO-facing titles for the Launch Diary posts (crawler-facing). */
const DIARY_TITLES: Record<string, { title: string; description: string }> = {
  "launch-diary-1": {
    title: "Launch Diary #1: The Setup",
    description: `How ${named ? brand : "a Zurich pearl-jewelry maker"} set up a first online store on Zolto — the real process, start to finish.`,
  },
  "launch-diary-2": {
    title: "Launch Diary #2: Going Live",
    description: `Launch day for ${named ? brand : "a Zurich jewelry store"}: the first visitors, the first online order, and what actually converts.`,
  },
  "launch-diary-3": {
    title: "Launch Diary #3: First Month Online",
    description: `Honest month-one numbers from ${named ? brand : "a Zurich maker"}: 12 orders, CHF 61 average, 81% AI chatbot resolution.`,
  },
};

/**
 * Resolve SEO for a marketing path, or `null` if the path isn't a known marketing
 * route (in which case the HTML is served unchanged).
 */
export function getMarketingSeo(
  path: string,
  baseUrl: string,
): MarketingSeo | null {
  const base = normalizeBaseUrl(baseUrl);
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";

  const org = organizationNode(base);
  const site = websiteNode(base);
  const common = [org, site];

  // Static routes.
  switch (clean) {
    case "/":
      return {
        path: "/",
        title: `${PLATFORM.name} — ${PLATFORM.tagline}`,
        description: PLATFORM.summary,
        jsonLd: [...common, softwareApplicationNode(base), faqPageNode()],
        noscript: `${PLATFORM.summary} ${PLATFORM.pricingSummary} Features: ${FEATURES.map((f) => f.name).join(", ")}.`,
      };
    case "/pricing":
      return {
        path: "/pricing",
        title: `Pricing — ${PLATFORM.name} for makers`,
        description: `${PLATFORM.pricingSummary} Plans: ${PLANS.map((p) => `${p.name} ${p.priceChf === 0 ? "free" : `CHF ${p.priceChf}/mo`}`).join(", ")}.`,
        jsonLd: [
          ...common,
          softwareApplicationNode(base),
          faqPageNode(),
          breadcrumb(base, [
            ["Home", "/"],
            ["Pricing", "/pricing"],
          ]),
        ],
        noscript: `${PLATFORM.name} pricing. ${PLANS.map((p) => `${p.name}: ${p.priceChf === 0 ? "free" : `CHF ${p.priceChf}/month`} — ${p.features.join("; ")}`).join(". ")}.`,
      };
    case "/signup":
      return {
        path: "/signup",
        title: `Start your store free — ${PLATFORM.name}`,
        description: `Open an online store and point-of-sale for your craft or maker business. ${PLATFORM.pricingSummary}`,
        jsonLd: [
          ...common,
          breadcrumb(base, [
            ["Home", "/"],
            ["Sign up", "/signup"],
          ]),
        ],
        noscript: `Sign up for ${PLATFORM.name}. ${PLATFORM.audience}`,
      };
    case "/faq":
      return {
        path: "/faq",
        title: `FAQ — ${PLATFORM.name} for makers`,
        description: `Answers to the questions makers ask about ${PLATFORM.name}: what it costs, how setup works, getting paid, and selling in person and online.`,
        jsonLd: [
          ...common,
          faqPageNode(),
          breadcrumb(base, [
            ["Home", "/"],
            ["FAQ", "/faq"],
          ]),
        ],
        // The full Q&A in plain text: this is the page an AI assistant is most
        // likely to quote, so give it the answers rather than a teaser.
        noscript: FAQS.map((f) => `${f.q} ${f.a}`).join(" "),
      };
    case SOVEREIGNTY.href:
      return {
        path: SOVEREIGNTY.href,
        title: `Made in Switzerland — ${PLATFORM.name}`,
        description: `${PLATFORM.name} is built in Zürich and runs on European infrastructure. What already runs where, what's moving next, and what will never be European.`,
        jsonLd: [
          ...common,
          breadcrumb(base, [
            ["Home", "/"],
            ["Made in Switzerland", SOVEREIGNTY.href],
          ]),
        ],
        // The whole ledger in plain text. This is the page a merchant links
        // when a customer asks where the data goes, and the one an assistant
        // will quote from — give it the rows, not a teaser.
        noscript: `${SOVEREIGNTY.serving} ${SOVEREIGNTY.body} ${SOVEREIGNTY.ledger
          .map(
            (e) =>
              `${e.piece}: ${e.today} (${e.state})${e.next ? ` — ${e.next}` : ""}`,
          )
          .join(" ")} ${SOVEREIGNTY.why.join(" ")} ${SOVEREIGNTY.caveat}`,
      };
    case "/compare":
      return {
        path: "/compare",
        title: `Compare ${PLATFORM.name} — vs ${COMPETITORS.map((c) => c.name).join(", ")}`,
        description: `How ${PLATFORM.name} compares to ${COMPETITORS.map((c) => c.name).join(", ")} for independent makers — including when each of them is the better choice.`,
        jsonLd: [
          ...common,
          {
            "@type": "CollectionPage",
            name: `Compare ${PLATFORM.name}`,
            url: `${base}/compare`,
            hasPart: COMPETITORS.map((c) => ({
              "@type": "WebPage",
              name: `${PLATFORM.name} vs ${c.name}`,
              url: `${base}/compare/zolto-vs-${c.id}`,
            })),
          },
          breadcrumb(base, [
            ["Home", "/"],
            ["Compare", "/compare"],
          ]),
        ],
        noscript: COMPETITORS.map(
          (c) => `${PLATFORM.name} vs ${c.name}: ${c.summary}`,
        ).join(" "),
      };
    case "/for":
      return {
        path: "/for",
        title: `Who ${PLATFORM.name} is for — makers, studios, market sellers, boutiques`,
        description: `${PLATFORM.name} for ${SEGMENTS.map((s) => s.name.toLowerCase()).join(", ")} — what changes for each kind of seller.`,
        jsonLd: [
          ...common,
          {
            "@type": "CollectionPage",
            name: `Who ${PLATFORM.name} is for`,
            url: `${base}/for`,
            hasPart: SEGMENTS.map((s) => ({
              "@type": "WebPage",
              name: s.name,
              url: `${base}/for/${s.id}`,
            })),
          },
          breadcrumb(base, [
            ["Home", "/"],
            ["Who it's for", "/for"],
          ]),
        ],
        noscript: SEGMENTS.map((s) => `${s.name}: ${s.summary}`).join(" "),
      };
    case "/blog":
      return {
        path: "/blog",
        title: `Launch Diary — a maker's first online store | ${PLATFORM.name}`,
        description:
          "A real maker's store launch on Zolto, documented week by week: setup, launch day, and honest first-month numbers.",
        jsonLd: [
          ...common,
          {
            "@type": "CollectionPage",
            name: "Zolto Launch Diary",
            description:
              "A real maker's store launch, documented week by week.",
            url: `${base}/blog`,
          },
        ],
        noscript:
          "The Zolto Launch Diary — a real maker's first online store, documented week by week.",
      };
    case "/legal/privacy":
      return {
        path: "/legal/privacy",
        title: `Privacy Policy — ${PLATFORM.name}`,
        description:
          "How Zolto handles data for merchants and their customers.",
        jsonLd: common,
        noscript: "Zolto privacy policy.",
      };
    case "/legal/terms":
      return {
        path: "/legal/terms",
        title: `Terms of Service — ${PLATFORM.name}`,
        description: "The terms governing use of the Zolto platform.",
        jsonLd: common,
        noscript: "Zolto terms of service.",
      };
  }

  // Audience segment pages.
  if (clean.startsWith("/for/")) {
    const segment = findSegment(clean.slice("/for/".length));
    if (segment) {
      return {
        path: clean,
        title: `${segment.headline} | ${PLATFORM.name}`,
        description: `${segment.summary} ${PLATFORM.pricingSummary}`.slice(
          0,
          300,
        ),
        jsonLd: [
          ...common,
          {
            "@type": "WebPage",
            name: segment.headline,
            url: `${base}${clean}`,
            isPartOf: { "@id": `${base}/#website` },
            about: {
              "@type": "Audience",
              audienceType: segment.name,
            },
            mentions: segmentFeatures(segment).map((f) => ({
              "@type": "Thing",
              name: f.name,
              description: f.description,
            })),
          },
          breadcrumb(base, [
            ["Home", "/"],
            ["Who it's for", "/for"],
            [segment.name, clean],
          ]),
        ],
        noscript: renderSegmentText(segment),
      };
    }
  }

  // First-party research. Published as a Dataset alongside the Article so it can
  // be discovered and cited as data, not just read as a story.
  if (clean === `/research/${PILOT_METHODOLOGY.slug}`) {
    const title = PILOT_METHODOLOGY.title;
    const description = `First-party data from one maker's first 30 days selling online: ${PILOT_METRICS.slice(
      0,
      3,
    )
      .map((m) => `${m.value} ${m.label.toLowerCase()}`)
      .join(", ")}. Method and limits stated.`;
    return {
      path: clean,
      title: `${title} | ${PLATFORM.name} research`,
      description,
      jsonLd: [
        ...common,
        articleNode(base, clean, title, description, {
          published: PILOT_METHODOLOGY.published,
          modified: PILOT_METHODOLOGY.published,
        }),
        {
          "@type": "Dataset",
          name: title,
          description,
          url: `${base}${clean}`,
          creator: { "@id": `${base}/#organization` },
          datePublished: PILOT_METHODOLOGY.published,
          license: "https://creativecommons.org/licenses/by/4.0/",
          measurementTechnique: PILOT_METHODOLOGY.collection,
          variableMeasured: PILOT_METRICS.map((m) => ({
            "@type": "PropertyValue",
            name: m.label,
            value: m.value,
            description: m.note,
          })),
        },
        breadcrumb(base, [
          ["Home", "/"],
          ["Research", clean],
        ]),
      ],
      noscript: renderPilotResearchText(),
    };
  }

  // Per-incumbent comparison pages.
  if (clean.startsWith("/compare/zolto-vs-")) {
    const competitor = findCompetitor(clean.slice("/compare/zolto-vs-".length));
    if (competitor) {
      const title = `${PLATFORM.name} vs ${competitor.name}`;
      const description = `An honest comparison of ${PLATFORM.name} and ${competitor.name} for independent makers: hardware, setup effort, where the money lands, and when ${competitor.name} is the better choice.`;
      return {
        path: clean,
        title: `${title} — which fits a maker better?`,
        description,
        jsonLd: [
          ...common,
          articleNode(base, clean, title, description),
          breadcrumb(base, [
            ["Home", "/"],
            ["Compare", "/compare"],
            [title, clean],
          ]),
        ],
        noscript:
          `${competitor.summary} ` +
          `When ${competitor.name} is the better choice: ${competitor.betterWhen.join(" ")} ` +
          `When ${PLATFORM.name} fits better: ${competitor.zoltoWhen.join(" ")} ` +
          INCUMBENT_COMPARISON.map(
            (r) =>
              `${r.feature} — traditionally: ${r.them}; with ${PLATFORM.name}: ${r.us}.`,
          ).join(" "),
      };
    }
  }

  // Blog posts.
  const diarySlug = clean.startsWith("/blog/")
    ? clean.slice("/blog/".length)
    : null;
  if (diarySlug && BLOG_POSTS.some((p) => p.slug === diarySlug)) {
    const meta = DIARY_TITLES[diarySlug] ?? {
      title: "Launch Diary",
      description: "A maker's store launch on Zolto.",
    };
    const post = BLOG_POSTS.find((p) => p.slug === diarySlug)!;
    return {
      path: clean,
      title: `${meta.title} | ${PLATFORM.name} Launch Diary`,
      description: meta.description,
      jsonLd: [
        ...common,
        articleNode(base, clean, meta.title, meta.description, {
          published: post.lastmod,
          modified: post.lastmod,
        }),
        breadcrumb(base, [
          ["Home", "/"],
          ["Launch Diary", "/blog"],
          [meta.title, clean],
        ]),
      ],
      noscript: meta.description,
    };
  }

  // Case study / story.
  if (clean === `/stories/${STORY_SLUG}`) {
    const title = named ? `${brand} Launch Case Study` : "Launch Case Study";
    const description = `How ${named ? maker.founder : "a Zurich pearl-jewelry maker"} launched a first online store in 3 days and made 12 online sales in month one, on Zolto.`;
    return {
      path: clean,
      title: `${title} | ${PLATFORM.name}`,
      description,
      jsonLd: [
        ...common,
        articleNode(base, clean, title, description),
        breadcrumb(base, [
          ["Home", "/"],
          ["Stories", "/blog"],
          [title, clean],
        ]),
      ],
      noscript: description,
    };
  }

  return null;
}

// ── HTML injection ────────────────────────────────────────────────────────────

/**
 * Inject marketing SEO into the served index.html for a marketing route. Returns
 * the html unchanged for any non-marketing path, so it's a safe no-op elsewhere.
 */
export function injectMarketingHead(
  html: string,
  path: string,
  baseUrl: string,
): string {
  const seo = getMarketingSeo(path, baseUrl);
  if (!seo) return html;

  const base = normalizeBaseUrl(baseUrl);
  const canonical = `${base}${seo.path === "/" ? "/" : seo.path}`;
  const title = escapeHtml(seo.title);

  let out = html;
  // Title + primary meta (replace the static defaults in index.html).
  out = setTitle(out, seo.title);
  out = setMetaContent(out, "name", "description", seo.description);
  out = setMetaContent(out, "property", "og:title", seo.title);
  out = setMetaContent(out, "property", "og:description", seo.description);
  out = setMetaContent(out, "property", "twitter:title", seo.title);
  out = setMetaContent(out, "property", "twitter:description", seo.description);

  // Canonical + og:url + JSON-LD, injected before </head>.
  const ogImage = `${base}/og-image.png`;
  out = appendToHead(
    out,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />` +
      `<meta property="og:url" content="${escapeHtml(canonical)}" />` +
      `<meta property="og:image" content="${escapeHtml(ogImage)}" />` +
      `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />` +
      renderJsonLd(seo.jsonLd),
  );

  // Non-JS crawler content.
  out = appendAfterRoot(
    out,
    `<noscript><h1>${title}</h1><p>${escapeHtml(seo.noscript)}</p><p><a href="${base}/signup">Start your store free</a> · <a href="${base}/pricing">Pricing</a> · <a href="${base}/llms.txt">llms.txt</a></p></noscript>`,
  );

  return out;
}
