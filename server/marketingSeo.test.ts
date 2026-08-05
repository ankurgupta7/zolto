import { describe, it, expect } from "vitest";
import { getMarketingSeo, injectMarketingHead } from "./marketingSeo";
import { marketingSitemapEntries } from "@shared/marketing";
import { COMPETITORS, FAQS, SOVEREIGNTY } from "@shared/platform";
import { PILOT_METHODOLOGY, PILOT_METRICS } from "@shared/research";
import { authorJsonLd } from "@shared/authors";
import { SEGMENTS, segmentFeatures } from "@shared/segments";

const BASE = "https://zolto.com";

const SHELL = `<!doctype html><html><head>
<title>Zolto</title>
<meta name="description" content="old default" />
<meta property="og:title" content="Zolto" />
<meta property="og:description" content="old" />
<meta property="twitter:title" content="Zolto" />
<meta property="twitter:description" content="old" />
</head><body><div id="root"></div><script src="/main.tsx"></script></body></html>`;

describe("getMarketingSeo", () => {
  it("returns SEO for the landing page with software + FAQ schema", () => {
    const seo = getMarketingSeo("/", BASE)!;
    expect(seo).not.toBeNull();
    expect(seo.title).toContain("Zolto");
    const types = seo.jsonLd.map((n) => n["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
    expect(types).toContain("SoftwareApplication");
    expect(types).toContain("FAQPage");
  });

  it("returns pricing SEO with an AggregateOffer covering the plans", () => {
    const seo = getMarketingSeo("/pricing", BASE)!;
    const software = seo.jsonLd.find(
      (n) => n["@type"] === "SoftwareApplication",
    ) as Record<string, unknown>;
    const offers = software.offers as Record<string, unknown>;
    expect(offers["@type"]).toBe("AggregateOffer");
    expect(offers.lowPrice).toBe(0);
    expect(offers.priceCurrency).toBe("CHF");
  });

  it("handles blog posts and the case study", () => {
    const post = getMarketingSeo("/blog/launch-diary-1", BASE)!;
    expect(post.jsonLd.map((n) => n["@type"])).toContain("Article");
    const story = getMarketingSeo("/stories/kalakosh-launch", BASE);
    // story slug depends on the release gate; if named it resolves, else null
    if (story) {
      expect(story.jsonLd.map((n) => n["@type"])).toContain("Article");
    }
  });

  it("normalises trailing slashes and returns null for unknown routes", () => {
    expect(getMarketingSeo("/pricing/", BASE)?.path).toBe("/pricing");
    expect(getMarketingSeo("/definitely-not-a-page", BASE)).toBeNull();
    expect(getMarketingSeo("/admin", BASE)).toBeNull();
  });
});

describe("injectMarketingHead", () => {
  it("replaces title + meta and injects canonical, JSON-LD, and noscript", () => {
    const out = injectMarketingHead(SHELL, "/pricing", BASE);
    expect(out).toContain("<title>Pricing — Zolto for makers</title>");
    expect(out).toContain(
      '<link rel="canonical" href="https://zolto.com/pricing"',
    );
    expect(out).toContain("application/ld+json");
    expect(out).toContain("schema.org");
    expect(out).toContain("<noscript>");
    // The old default description must be gone.
    expect(out).not.toContain('content="old default"');
  });

  it("injects an absolute og:image / twitter:image social card", () => {
    const out = injectMarketingHead(SHELL, "/", BASE);
    expect(out).toContain(
      '<meta property="og:image" content="https://zolto.com/og-image.png"',
    );
    expect(out).toContain(
      '<meta name="twitter:image" content="https://zolto.com/og-image.png"',
    );
  });

  it("sets an absolute canonical with no double slash for the landing page", () => {
    const out = injectMarketingHead(SHELL, "/", `${BASE}/`);
    expect(out).toContain('<link rel="canonical" href="https://zolto.com/"');
    expect(out).not.toContain("zolto.com//");
  });

  it("is a no-op for non-marketing routes", () => {
    const out = injectMarketingHead(SHELL, "/some/storefront/path", BASE);
    expect(out).toBe(SHELL);
  });

  it("serves the full FAQ text to non-JS crawlers on /faq", () => {
    const out = injectMarketingHead(SHELL, "/faq", BASE);
    expect(out).toContain('"@type":"FAQPage"');
    // The answers themselves, not a teaser — this is the page most likely to
    // be quoted by an AI assistant.
    for (const item of FAQS) {
      expect(out).toContain(item.q);
    }
  });

  it("gives crawlers the whole Swissness ledger, unfinished rows included", () => {
    const seo = getMarketingSeo(SOVEREIGNTY.href, BASE)!;
    expect(seo).not.toBeNull();
    expect(seo.title).toMatch(/Made in Switzerland/i);
    for (const entry of SOVEREIGNTY.ledger) {
      expect(seo.noscript).toContain(entry.piece);
      expect(seo.noscript).toContain(entry.today);
      if (entry.next) expect(seo.noscript).toContain(entry.next);
    }
    // The sub-processor caveat reaches non-JS crawlers as well, so the page
    // can't read as an unqualified "everything is European" to a machine.
    expect(seo.noscript).toContain(SOVEREIGNTY.caveat);
  });

  it("renders a comparison page per named incumbent", () => {
    for (const c of COMPETITORS) {
      const seo = getMarketingSeo(`/compare/zolto-vs-${c.id}`, BASE)!;
      expect(seo).not.toBeNull();
      expect(seo.title).toContain(c.name);
      expect(seo.noscript).toContain(c.summary);
      // The honest concession has to reach crawlers too, not just readers.
      expect(seo.noscript).toContain(c.betterWhen[0]);
    }
  });

  it("lists every comparison from the /compare index", () => {
    const seo = getMarketingSeo("/compare", BASE)!;
    const collection = seo.jsonLd.find(
      (n) => n["@type"] === "CollectionPage",
    ) as Record<string, any>;
    expect(collection.hasPart).toHaveLength(COMPETITORS.length);
  });

  it("has no SEO for an unknown competitor slug", () => {
    expect(getMarketingSeo("/compare/zolto-vs-nonesuch", BASE)).toBeNull();
  });

  it("publishes the research page as a Dataset as well as an Article", () => {
    const seo = getMarketingSeo(`/research/${PILOT_METHODOLOGY.slug}`, BASE)!;
    expect(seo).not.toBeNull();
    const types = seo.jsonLd.map((n) => n["@type"]);
    expect(types).toContain("Dataset");
    expect(types).toContain("Article");

    const dataset = seo.jsonLd.find((n) => n["@type"] === "Dataset") as Record<
      string,
      any
    >;
    expect(dataset.measurementTechnique).toBe(PILOT_METHODOLOGY.collection);
    expect(dataset.variableMeasured).toHaveLength(PILOT_METRICS.length);
  });

  it("gives crawlers the method and limits, not just the figures", () => {
    const seo = getMarketingSeo(`/research/${PILOT_METHODOLOGY.slug}`, BASE)!;
    expect(seo.noscript).toContain("Sample:");
    expect(seo.noscript).toContain("Limits:");
    expect(seo.noscript).toContain("Zolto operates the platform");
  });

  it("renders a page per audience segment, grounded in real features", () => {
    for (const s of SEGMENTS) {
      const seo = getMarketingSeo(`/for/${s.id}`, BASE)!;
      expect(seo, s.id).not.toBeNull();
      expect(seo.title).toContain(s.headline);
      expect(seo.noscript).toContain(s.painPoints[0]);
      // Feature copy comes from FEATURES, so crawlers see the same claims the
      // product makes everywhere else.
      expect(seo.noscript).toContain(segmentFeatures(s)[0].description);
    }
  });

  it("lists every segment from the /for index", () => {
    const seo = getMarketingSeo("/for", BASE)!;
    const collection = seo.jsonLd.find(
      (n) => n["@type"] === "CollectionPage",
    ) as Record<string, any>;
    expect(collection.hasPart).toHaveLength(SEGMENTS.length);
  });

  it("has no SEO for an unknown segment slug", () => {
    expect(getMarketingSeo("/for/nonesuch", BASE)).toBeNull();
  });

  it("attributes articles through the shared author gate", () => {
    const seo = getMarketingSeo("/blog/launch-diary-1", BASE)!;
    const article = seo.jsonLd.find((n) => n["@type"] === "Article") as Record<
      string,
      any
    >;
    expect(article.author).toEqual(authorJsonLd(BASE));
  });

  it("has SEO for every URL the sitemap advertises", () => {
    // shared/marketing.ts promises the sitemap "never advertises a 404". Any
    // route listed there must resolve to real SEO, or crawlers are being sent
    // to a page with nothing on it.
    for (const entry of marketingSitemapEntries()) {
      expect(
        getMarketingSeo(entry.path, BASE),
        `sitemap lists ${entry.path} but getMarketingSeo returns null`,
      ).not.toBeNull();
    }
  });

  it("produces valid JSON in every injected ld+json block", () => {
    const out = injectMarketingHead(SHELL, "/", BASE);
    const blocks = [
      ...out.matchAll(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
      ),
    ];
    expect(blocks.length).toBeGreaterThan(0);
    for (const [, json] of blocks) {
      const parsed = JSON.parse(json);
      expect(parsed["@context"]).toBe("https://schema.org");
    }
  });
});
