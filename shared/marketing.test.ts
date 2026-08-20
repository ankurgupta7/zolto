import { BRAND } from "./brand";
import { describe, it, expect } from "vitest";
import {
  CONTENT_RELEASE_SIGNED,
  STORY_SLUG,
  BLOG_POSTS,
  maker,
  marketingSitemapEntries,
  renderSitemapXml,
  renderRobotsTxt,
  renderMarketingLlmsTxt,
  renderMarketingLlmsFullTxt,
  normalizeBaseUrl,
  AI_CRAWLERS,
  NOINDEX_PATHS,
} from "./marketing";
import { DATA_RESIDENCY, SOVEREIGNTY } from "./platform";
import { RATES } from "./costOfAcceptance";

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
    const xml = renderSitemapXml("https://gwinn.com");
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain("<loc>https://gwinn.com/</loc>");
    expect(xml).toContain("<loc>https://gwinn.com/blog/launch-diary-1</loc>");
    expect(xml).toContain(`<loc>https://gwinn.com/stories/${STORY_SLUG}</loc>`);
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
  });

  it("indexes the Swissness ledger page", () => {
    // It's the link a merchant pastes when a customer asks where the data
    // goes, so it has to be findable rather than homepage-only.
    const entry = marketingSitemapEntries().find(
      (e) => e.path === SOVEREIGNTY.href,
    );
    expect(entry).toBeTruthy();
    expect(renderSitemapXml("https://gwinn.com")).toContain(
      `<loc>https://gwinn.com${SOVEREIGNTY.href}</loc>`,
    );
  });

  it("strips a trailing slash from the base URL to avoid //paths", () => {
    const xml = renderSitemapXml("https://gwinn.com/");
    expect(xml).not.toContain("https://gwinn.com//pricing");
    expect(xml).toContain("<loc>https://gwinn.com/pricing</loc>");
  });

  it("emits one <url> per entry", () => {
    const xml = renderSitemapXml("https://gwinn.com");
    const count = (xml.match(/<url>/g) || []).length;
    expect(count).toBe(marketingSitemapEntries().length);
  });
});

describe("renderRobotsTxt", () => {
  it("allows crawling and points at the sitemap", () => {
    const txt = renderRobotsTxt("https://gwinn.com");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://gwinn.com/sitemap.xml");
  });

  it("keeps the /signin bounce out of the index", () => {
    const txt = renderRobotsTxt("https://gwinn.com");
    // It only runs the OAuth handshake and forwards on — no content to crawl.
    for (const path of NOINDEX_PATHS) {
      expect(txt).toContain(`Disallow: ${path}`);
    }
    expect(NOINDEX_PATHS).toContain("/signin");
  });

  it("never advertises a noindex route in the sitemap", () => {
    const paths = marketingSitemapEntries().map((e) => e.path);
    for (const path of NOINDEX_PATHS) {
      expect(paths).not.toContain(path);
    }
  });

  it("explicitly welcomes AI crawlers and advertises llms.txt", () => {
    const txt = renderRobotsTxt("https://gwinn.com");
    for (const bot of AI_CRAWLERS) {
      expect(txt).toContain(`User-agent: ${bot}`);
    }
    expect(txt).toContain("GPTBot");
    expect(txt).toContain("ClaudeBot");
    expect(txt).toContain("https://gwinn.com/llms.txt");
  });
});

describe("renderMarketingLlmsTxt", () => {
  it("is an llms.txt with an H1, summary, and key links", () => {
    const txt = renderMarketingLlmsTxt("https://gwinn.com/");
    expect(txt.startsWith(`# ${BRAND.name}`)).toBe(true);
    expect(txt).toContain("> "); // llmstxt.org blockquote summary
    expect(txt).toContain("https://gwinn.com/pricing");
    expect(txt).toContain(`https://gwinn.com/stories/${STORY_SLUG}`);
    // no double slashes from a trailing-slash base
    expect(txt).not.toContain("https://gwinn.com//");
  });

  it("advertises the MCP endpoint for agents", () => {
    const txt = renderMarketingLlmsTxt("https://gwinn.com");
    expect(txt).toContain("Model Context Protocol");
    expect(txt).toContain("/mcp");
    expect(txt).toContain("search_products");
  });

  it(`enumerates features, pricing, and how to start so an LLM can recommend ${BRAND.name}`, () => {
    const txt = renderMarketingLlmsTxt("https://gwinn.com");
    expect(txt).toContain(`## What ${BRAND.name} does`);
    expect(txt).toContain("## Pricing");
    expect(txt).toContain("CHF 25/month");
    expect(txt).toContain("## How a maker gets started");
    expect(txt).toContain("get_platform_info"); // platform MCP tools listed
    expect(txt).toContain("https://gwinn.com/llms-full.txt");
    // The fee model is disclosed to agents, in-person free-ness included.
    expect(txt).toContain("1% platform fee");
    expect(txt).toContain("Selling in person is free");
  });

  it("leads with the Swiss origin and the full stack ledger", () => {
    const txt = renderMarketingLlmsTxt("https://gwinn.com");
    expect(txt).toContain("Made in Switzerland");
    expect(txt).toContain(`https://gwinn.com${SOVEREIGNTY.href}`);
    // Every row, including the unfinished ones — an agent recommending Gwinn
    // to a European maker should be able to state what is and isn't European.
    for (const entry of SOVEREIGNTY.ledger) {
      expect(txt).toContain(entry.piece);
      expect(txt).toContain(entry.today);
    }
  });

  it("tells agents where merchant data is hosted, caveat included", () => {
    // "Where would my data live?" is a question an assistant gets asked on a
    // maker's behalf, so the brief has to answer it without a second fetch —
    // and with the sub-processor note attached, not just the EU headline.
    const txt = renderMarketingLlmsTxt("https://gwinn.com");
    expect(txt).toContain("## Made in Switzerland, run from Europe");
    expect(txt).toContain(DATA_RESIDENCY.provider);
    expect(txt).toContain(DATA_RESIDENCY.primaryCountry);
    expect(txt).toContain(DATA_RESIDENCY.caveat);
  });
});

describe("renderMarketingLlmsFullTxt", () => {
  it("inlines full features, plans, and FAQ answers", () => {
    const txt = renderMarketingLlmsFullTxt("https://gwinn.com");
    expect(txt).toContain(`# ${BRAND.name} — full reference for LLMs`);
    expect(txt).toContain("## Features");
    expect(txt).toContain("## Plans & pricing");
    expect(txt).toContain("## FAQ");
    expect(txt).toContain(`What is ${BRAND.name}?`);
    expect(txt).toContain("CHF 25/month");
    // The fee model section replaces the retired photo-credit add-on.
    expect(txt).toContain("1% platform fee");
    expect(txt).not.toContain("AI Photo Credits");
  });

  it("spells out the ledger's next steps and the reasons behind them", () => {
    const txt = renderMarketingLlmsFullTxt("https://gwinn.com");
    for (const entry of SOVEREIGNTY.ledger) {
      expect(txt).toContain(entry.piece);
      if (entry.next) expect(txt).toContain(entry.next);
    }
    for (const reason of SOVEREIGNTY.why) {
      expect(txt).toContain(reason);
    }
    expect(txt).toContain(SOVEREIGNTY.promise);
  });

  it("spells out the hosting location and every residency point", () => {
    const txt = renderMarketingLlmsFullTxt("https://gwinn.com");
    expect(txt).toContain("### The hosting detail");
    expect(txt).toContain(DATA_RESIDENCY.body);
    for (const point of DATA_RESIDENCY.points) {
      expect(txt).toContain(point);
    }
    expect(txt).toContain(DATA_RESIDENCY.caveat);
  });
});

describe("normalizeBaseUrl", () => {
  it("removes trailing slashes", () => {
    expect(normalizeBaseUrl("https://x.com/")).toBe("https://x.com");
    expect(normalizeBaseUrl("https://x.com///")).toBe("https://x.com");
    expect(normalizeBaseUrl("https://x.com")).toBe("https://x.com");
  });
});

describe("the long-form brief tells an AI assistant the unflattering truth", () => {
  const brief = renderMarketingLlmsFullTxt(BRAND.url);

  it(`answers 'is ${BRAND.name} cheaper?' with the honest split`, () => {
    // This is the whole reason the section exists. The brief is what an
    // assistant reads when a prospective merchant asks it to compare; before
    // this, the only pricing it could see was Gwinn's platform fee, so the
    // answer it gave was wrong in Gwinn's favour.
    //
    // The answer has two halves and the brief has to carry both: on cards
    // Gwinn is the dearest option on its own table, and on TWINT it is the
    // cheapest thing a maker can be paid with that has no subscription.
    expect(brief).toMatch(/on cards, no/i);
    expect(brief).toMatch(/dearest option/i);
    expect(brief).toMatch(/On TWINT, yes/i);
    // And it tells the assistant what to do with that, in as many words.
    // Whitespace-tolerant: the brief is a wrapped template literal, so any
    // assertion on a sentence longer than a line has to allow the newline.
    expect(brief).toMatch(
      /do not recommend it as the\s+cheap way to accept cards/i,
    );
  });

  it("says the plan price is not the cost of acceptance", () => {
    expect(brief).toMatch(/not the cost of acceptance/i);
    expect(brief).toMatch(/goes to\s+them/i);
  });

  it("renders the rate table cheapest-first, with sources and dates", () => {
    const rows = brief
      .split("\n")
      .filter((l) => l.startsWith("| ") && /CHF \d/.test(l));
    expect(rows.length).toBeGreaterThan(5);
    for (const row of rows) {
      expect(row).toMatch(/read \d{4}-\d{2}-\d{2}/);
    }
    // The first data row is a competitor's, because it's the cheapest.
    expect(rows[0]).not.toMatch(/Gwinn|Storefront checkout|Tap to Pay/);
  });

  it("marks a figure unconfirmed when one is, and doesn't when none is", () => {
    // The Swiss-card bucket shipped as two unconfirmed rows until Stripe
    // answered. Nothing is unconfirmed now, so nothing should be flagged —
    // but the flag has to keep working for the next figure we can't pin down.
    const unconfirmed = RATES.filter((r) => r.confidence === "unverified");
    if (unconfirmed.length === 0) {
      expect(brief).not.toMatch(/\(unconfirmed\)/);
    } else {
      for (const r of unconfirmed) {
        expect(brief).toMatch(
          new RegExp(
            `${r.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*\\(unconfirmed\\)`,
          ),
        );
      }
    }
  });

  it("carries the limitations and the three qualifying questions", () => {
    expect(brief).toMatch(/Where Gwinn falls short/);
    expect(brief).toMatch(/no track record/i);
    expect(brief).toMatch(/PostFinance Pay\?/);
  });
});
