import { describe, it, expect } from "vitest";
import {
  analyticsConfigFromEnv,
  analyticsSnippet,
  type AnalyticsConfig,
} from "./analytics";

const ID_A = "11111111-2222-4333-8444-555555555555";
const ID_B = "99999999-8888-4777-8666-555555555555";

const config: AnalyticsConfig = {
  endpoint: "/_stats",
  marketingWebsiteId: ID_A,
  storefrontWebsiteId: ID_B,
};

describe("analyticsConfigFromEnv", () => {
  it("reads a first-party path endpoint and both ids", () => {
    expect(
      analyticsConfigFromEnv({
        ANALYTICS_ENDPOINT: "/_stats",
        ANALYTICS_WEBSITE_ID: ID_A,
        ANALYTICS_STOREFRONT_WEBSITE_ID: ID_B,
      }),
    ).toEqual(config);
  });

  it("accepts an absolute https origin and trims a trailing slash", () => {
    expect(
      analyticsConfigFromEnv({
        ANALYTICS_ENDPOINT: "https://stats.example.com/",
        ANALYTICS_WEBSITE_ID: ID_A,
      })?.endpoint,
    ).toBe("https://stats.example.com");
  });

  it("falls back to the marketing id for storefronts", () => {
    // A single-store self-hoster has one site and should not be made to
    // create a second just to be measured.
    const cfg = analyticsConfigFromEnv({
      ANALYTICS_ENDPOINT: "/_stats",
      ANALYTICS_WEBSITE_ID: ID_A,
    });
    expect(cfg?.storefrontWebsiteId).toBe(ID_A);
  });

  it("is null when nothing is configured — the default, and not an error", () => {
    // The whole point of moving this off a build-time constant: an install
    // that wants no analytics must be able to have none.
    expect(analyticsConfigFromEnv({})).toBeNull();
    expect(analyticsConfigFromEnv({ ANALYTICS_ENDPOINT: "" })).toBeNull();
  });

  it("is null when the website id is not a real Umami id", () => {
    // Fail visibly at the source rather than emitting a tag that collects
    // nothing — the exact failure this module was written to clean up.
    for (const id of [
      "",
      "not-a-uuid",
      "%VITE_ANALYTICS_WEBSITE_ID%",
      "1234",
    ]) {
      expect(
        analyticsConfigFromEnv({
          ANALYTICS_ENDPOINT: "/_stats",
          ANALYTICS_WEBSITE_ID: id,
        }),
      ).toBeNull();
    }
  });

  it("refuses an endpoint that is not same-origin or https", () => {
    for (const endpoint of [
      "//evil.example.com",
      "http://insecure.example.com",
      "javascript:alert(1)",
      'https://x" onerror="alert(1)',
    ]) {
      expect(
        analyticsConfigFromEnv({
          ANALYTICS_ENDPOINT: endpoint,
          ANALYTICS_WEBSITE_ID: ID_A,
        }),
      ).toBeNull();
    }
  });

  it("ignores a storefront id that is malformed rather than emitting it", () => {
    const cfg = analyticsConfigFromEnv({
      ANALYTICS_ENDPOINT: "/_stats",
      ANALYTICS_WEBSITE_ID: ID_A,
      ANALYTICS_STOREFRONT_WEBSITE_ID: "garbage",
    });
    expect(cfg?.storefrontWebsiteId).toBe(ID_A);
  });
});

describe("analyticsSnippet", () => {
  it("emits nothing when analytics is not configured", () => {
    expect(analyticsSnippet("marketing", null)).toBe("");
    expect(analyticsSnippet("storefront", null)).toBe("");
  });

  it("points the two surfaces at different website ids", () => {
    // One shell serves both, so a single baked-in id would sum zolto.ch's
    // traffic with every storefront's into one uninterpretable number.
    expect(analyticsSnippet("marketing", config)).toContain(
      `data-website-id="${ID_A}"`,
    );
    expect(analyticsSnippet("storefront", config)).toContain(
      `data-website-id="${ID_B}"`,
    );
  });

  it("loads the script from the configured endpoint, deferred", () => {
    const html = analyticsSnippet("marketing", config);
    expect(html).toContain('src="/_stats/script.js"');
    expect(html).toContain("defer");
  });

  it("honours Do Not Track", () => {
    // Cookieless plus DNT is what the privacy policy already promises and what
    // keeps this from needing a consent banner.
    expect(analyticsSnippet("marketing", config)).toContain(
      'data-do-not-track="true"',
    );
  });

  it("sends no visitor to a third-party host by default", () => {
    // The stack vendors its own fonts precisely so no visitor IP reaches
    // anyone else; the measurement tag must not undo that.
    const html = analyticsSnippet("storefront", config);
    expect(html).not.toMatch(/https?:\/\//);
  });
});
