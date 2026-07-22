import { describe, it, expect } from "vitest";
import {
  CONTENT_RELEASE_SIGNED,
  STORY_SLUG,
  BLOG_POSTS,
  maker,
  marketingSitemapEntries,
  renderSitemapXml,
  renderRobotsTxt,
  normalizeBaseUrl,
} from "./marketing";

describe("marketing identity gate", () => {
  it("keeps the maker anonymous until the release is signed", () => {
    // Guards the right-of-publicity gate (business-plan §5.1). If this ever needs
    // to change, it must be a deliberate flip of CONTENT_RELEASE_SIGNED, not an
    // accidental one.
    if (CONTENT_RELEASE_SIGNED) {
      expect(maker.founder).toBe("Sheena Arora");
      expect(maker.brand).toBe("Kalakosh");
      expect(STORY_SLUG).toBe("kalakosh-launch");
    } else {
      expect(maker.founder).toBeNull();
      expect(maker.brand).not.toContain("Kalakosh");
      expect(STORY_SLUG).not.toContain("kalakosh");
    }
  });

  it("always keeps the city (non-identifying) for local SEO", () => {
    expect(maker.city).toBe("Zurich");
    expect(maker.countryCode).toBe("CH");
  });
});

describe("marketingSitemapEntries", () => {
  const entries = marketingSitemapEntries();

  it("includes the core marketing routes that are actually live", () => {
    const paths = entries.map((e) => e.path);
    expect(paths).toContain("/");
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/signup");
    expect(paths).toContain("/blog");
    expect(paths).toContain("/legal/privacy");
    expect(paths).toContain("/legal/terms");
  });

  it("includes every blog post and the current story slug", () => {
    const paths = entries.map((e) => e.path);
    for (const post of BLOG_POSTS) {
      expect(paths).toContain(`/blog/${post.slug}`);
    }
    expect(paths).toContain(`/stories/${STORY_SLUG}`);
  });

  it("does not advertise routes that aren't served (no bare /privacy or /features)", () => {
    const paths = entries.map((e) => e.path);
    expect(paths).not.toContain("/privacy");
    expect(paths).not.toContain("/features/ai");
  });

  it("gives every entry a valid priority and changefreq", () => {
    for (const e of entries) {
      expect(e.priority).toBeGreaterThanOrEqual(0);
      expect(e.priority).toBeLessThanOrEqual(1);
      expect(["weekly", "monthly", "yearly"]).toContain(e.changefreq);
      expect(e.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("renderSitemapXml", () => {
  it("produces well-formed XML with absolute URLs", () => {
    const xml = renderSitemapXml("https://zolto.com");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain("<loc>https://zolto.com/</loc>");
    expect(xml).toContain("<loc>https://zolto.com/blog/launch-diary-1</loc>");
    expect(xml).toContain(`<loc>https://zolto.com/stories/${STORY_SLUG}</loc>`);
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("strips a trailing slash from the base URL to avoid //paths", () => {
    const xml = renderSitemapXml("https://zolto.com/");
    expect(xml).not.toContain("https://zolto.com//pricing");
    expect(xml).toContain("<loc>https://zolto.com/pricing</loc>");
  });

  it("emits one <url> per entry", () => {
    const xml = renderSitemapXml("https://zolto.com");
    const count = (xml.match(/<url>/g) || []).length;
    expect(count).toBe(marketingSitemapEntries().length);
  });
});

describe("renderRobotsTxt", () => {
  it("allows crawling and points at the sitemap", () => {
    const txt = renderRobotsTxt("https://zolto.com");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://zolto.com/sitemap.xml");
  });
});

describe("normalizeBaseUrl", () => {
  it("removes trailing slashes", () => {
    expect(normalizeBaseUrl("https://x.com/")).toBe("https://x.com");
    expect(normalizeBaseUrl("https://x.com///")).toBe("https://x.com");
    expect(normalizeBaseUrl("https://x.com")).toBe("https://x.com");
  });
});
