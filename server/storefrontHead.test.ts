import { BRAND } from "@shared/brand";
import { describe, it, expect } from "vitest";
import {
  injectStorefrontHead,
  tenantFaviconDataUri,
  isSafeImageUrl,
} from "./storefrontHead";

const SHELL = `<!doctype html><html><head>
<title>${BRAND.name}</title>
<meta name="description" content="${BRAND.name} default" />
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" type="image/png" sizes="96x96" href="/favicon.png" />
<link rel="apple-touch-icon" href="/logo.png" />
<meta property="og:title" content="${BRAND.name}" />
<meta property="og:site_name" content="${BRAND.name}" />
<meta property="twitter:title" content="${BRAND.name}" />
</head><body><div id="root"></div></body></html>`;

describe("isSafeImageUrl", () => {
  it("allows http(s) and data:image, rejects everything else", () => {
    expect(isSafeImageUrl("https://cdn.example/favicon.png")).toBe(true);
    expect(isSafeImageUrl("http://x/y.ico")).toBe(true);
    expect(isSafeImageUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isSafeImageUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeImageUrl("/relative.png")).toBe(false);
    expect(isSafeImageUrl("data:text/html,<script>")).toBe(false);
  });
});

describe("tenantFaviconDataUri", () => {
  it("builds an SVG data-URI with the store initial and brand colour", () => {
    const uri = tenantFaviconDataUri("Kalakosh", "#7c3aed");
    expect(uri.startsWith("data:image/svg+xml,")).toBe(true);
    const svg = decodeURIComponent(uri.slice("data:image/svg+xml,".length));
    expect(svg).toContain("#7c3aed");
    expect(svg).toContain(">K<");
  });

  it("falls back to a default colour for a bad hex", () => {
    const svg = decodeURIComponent(
      tenantFaviconDataUri("A", "not-a-color").slice(
        "data:image/svg+xml,".length,
      ),
    );
    expect(svg).toContain("#2d2620");
  });
});

describe("injectStorefrontHead", () => {
  it(`replaces the ${BRAND.name} favicon with the tenant's uploaded icon`, () => {
    const out = injectStorefrontHead(SHELL, {
      storeName: "Kalakosh",
      faviconUrl: "https://cdn.kalakosh.ch/favicon.png",
    });
    expect(out).toContain(
      '<link rel="icon" href="https://cdn.kalakosh.ch/favicon.png" />',
    );
    // Gwinn icons are gone.
    expect(out).not.toContain("/favicon.svg");
    expect(out).not.toContain("/favicon.ico");
    expect(out).not.toContain('href="/logo.png"');
  });

  it("uses a generated initial-mark when the store has no icon", () => {
    const out = injectStorefrontHead(SHELL, {
      storeName: "Perlen",
      primaryColor: "#1e3a5f",
      faviconUrl: null,
    });
    expect(out).toContain('<link rel="icon" href="data:image/svg+xml,');
    expect(out).not.toContain("/favicon.svg");
  });

  it("sets the tab title and OG identity to the store", () => {
    const out = injectStorefrontHead(SHELL, {
      storeName: "Kalakosh",
      metaTitle: "Kalakosh — Pearl Jewelry Zurich",
    });
    expect(out).toContain("<title>Kalakosh — Pearl Jewelry Zurich</title>");
    expect(out).toContain('<meta property="og:site_name" content="Kalakosh"');
    expect(out).not.toContain(`<title>${BRAND.name}</title>`);
  });

  it("rejects an unsafe favicon URL and falls back to the generated mark", () => {
    const out = injectStorefrontHead(SHELL, {
      storeName: "Evil",
      faviconUrl: "javascript:alert(1)",
    });
    expect(out).not.toContain("javascript:alert(1)");
    expect(out).toContain("data:image/svg+xml,");
  });

  it("escapes tenant-supplied values (no HTML injection)", () => {
    const out = injectStorefrontHead(SHELL, {
      storeName: '"><script>alert(1)</script>',
    });
    expect(out).not.toContain("<script>alert(1)</script>");
    expect(out).toContain("&lt;script&gt;");
  });

  // A custom domain carries no slug in its hostname, so the SPA can only learn
  // which store it is serving from this tag (client/src/lib/surface.ts).
  it("stamps the resolved tenant slug into the shell", () => {
    const out = injectStorefrontHead(SHELL, {
      storeName: "Aurora Atelier",
      tenantSlug: "aurora",
    });
    expect(out).toContain('<meta name="gwinn-tenant-slug" content="aurora" />');
  });

  it("omits the slug tag when there is nothing to stamp", () => {
    expect(
      injectStorefrontHead(SHELL, { storeName: "Aurora", tenantSlug: null }),
    ).not.toContain("gwinn-tenant-slug");
    expect(injectStorefrontHead(SHELL, { storeName: "Aurora" })).not.toContain(
      "gwinn-tenant-slug",
    );
  });

  it("escapes the slug like every other injected value", () => {
    const out = injectStorefrontHead(SHELL, {
      storeName: "Evil",
      tenantSlug: '"><script>alert(1)</script>',
    });
    expect(out).not.toContain("<script>alert(1)</script>");
  });
});

describe(`injectStorefrontHead — the Made with ${BRAND.name} credit`, () => {
  it("stamps the generator tag and a followable author link by default", () => {
    const out = injectStorefrontHead(SHELL, { storeName: "Aurora Atelier" });
    expect(out).toContain(
      `<meta name="generator" content="${BRAND.name} (${BRAND.url})" />`,
    );
    expect(out).toContain(`<link rel="author" href="${BRAND.url}/"`);
  });

  it("credits by default when the caller says nothing about attribution", () => {
    // The flag is optional, and a caller that forgets it must credit the
    // platform rather than silently white-label the store.
    const out = injectStorefrontHead(SHELL, {
      storeName: "Aurora",
      attribution: undefined,
    });
    expect(out).toContain('name="generator"');
  });

  it("drops both tags for a store that has switched the credit off", () => {
    const out = injectStorefrontHead(SHELL, {
      storeName: "Aurora Atelier",
      attribution: false,
    });
    expect(out).not.toContain('name="generator"');
    expect(out).not.toContain('rel="author"');
    expect(out).not.toContain(BRAND.domain);
  });

  it("still brands the tab for a white-labelled store", () => {
    // Dropping the credit must not drop the rest of the head injection.
    const out = injectStorefrontHead(SHELL, {
      storeName: "Aurora Atelier",
      attribution: false,
      tenantSlug: "aurora",
    });
    expect(out).toContain("<title>Aurora Atelier</title>");
    expect(out).toContain('<meta name="gwinn-tenant-slug" content="aurora" />');
  });
});
