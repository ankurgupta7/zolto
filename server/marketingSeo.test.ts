import { describe, it, expect } from "vitest";
import { getMarketingSeo, injectMarketingHead } from "./marketingSeo";

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
    expect(offers.priceCurrency).toBe("EUR");
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
