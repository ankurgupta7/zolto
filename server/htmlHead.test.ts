import { BRAND } from "@shared/brand";
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Request } from "express";

// The marketing branch returns before any tenant lookup, but the module graph
// still pulls these in — keep them off the database.
vi.mock("./db", () => ({ getTenantSettings: vi.fn(async () => null) }));
vi.mock("./tenantResolve", () => ({
  resolveTenantFromRequest: vi.fn(async () => null),
}));

const { injectHeadForRequest } = await import("./htmlHead");

const SHELL = `<!doctype html><html><head>
<title>Gwinn</title>
<meta name="description" content="old default" />
</head><body><div id="root"></div></body></html>`;

function fakeReq(url: string, host = BRAND.domain): Request {
  return {
    headers: { host },
    originalUrl: url,
    // Deliberately wrong: mirrors what Express hands a handler mounted at "*".
    // Nothing in htmlHead may depend on these.
    path: "/",
    url: "/",
    protocol: "https",
  } as unknown as Request;
}

const title = (html: string) => html.match(/<title>(.*?)<\/title>/s)?.[1];
const canonical = (html: string) =>
  html.match(/rel="canonical"[^>]*href="([^"]*)"/)?.[1];

let savedBaseUrl: string | undefined;

beforeAll(() => {
  savedBaseUrl = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = BRAND.url;
});

afterAll(() => {
  if (savedBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = savedBaseUrl;
});

describe("injectHeadForRequest — marketing route resolution", () => {
  // Regression: this read req.path, which Express collapses to "/" under a
  // "*" mount. Every marketing page rendered the homepage's title and
  // canonical=https://gwinn.ch/, telling crawlers the whole site was one page.
  it("resolves the route from originalUrl, not the rewritten req.path", async () => {
    const out = await injectHeadForRequest(fakeReq("/pricing"), SHELL);

    expect(canonical(out)).toBe(`${BRAND.url}/pricing`);
    expect(title(out)).toContain("Pricing");
  });

  it("gives each marketing route its own canonical", async () => {
    const routes = ["/", "/pricing", "/signup", "/blog", "/legal/privacy"];
    const canonicals = await Promise.all(
      routes.map(async (r) =>
        canonical(await injectHeadForRequest(fakeReq(r), SHELL)),
      ),
    );

    expect(canonicals).toEqual([
      `${BRAND.url}/`,
      `${BRAND.url}/pricing`,
      `${BRAND.url}/signup`,
      `${BRAND.url}/blog`,
      `${BRAND.url}/legal/privacy`,
    ]);
    // No duplicates — that was the whole bug.
    expect(new Set(canonicals).size).toBe(routes.length);
  });

  it("gives each marketing route its own title", async () => {
    const titles = await Promise.all(
      ["/", "/pricing", "/blog/launch-diary-1"].map(async (r) =>
        title(await injectHeadForRequest(fakeReq(r), SHELL)),
      ),
    );

    expect(new Set(titles).size).toBe(3);
  });

  it("renders a per-route noscript body for non-JS crawlers", async () => {
    const home = await injectHeadForRequest(fakeReq("/"), SHELL);
    const pricing = await injectHeadForRequest(fakeReq("/pricing"), SHELL);

    for (const html of [home, pricing]) {
      expect(html).toContain("<noscript>");
      expect(html).not.toContain('content="old default"');
    }
    // The homepage summary must not be what /pricing serves.
    const body = (h: string) => h.match(/<noscript>(.*?)<\/noscript>/s)?.[1];
    expect(body(pricing)).not.toBe(body(home));
  });

  it("strips the query string before resolving the route", async () => {
    const out = await injectHeadForRequest(
      fakeReq("/pricing?ref=twitter&utm_source=x"),
      SHELL,
    );

    expect(canonical(out)).toBe(`${BRAND.url}/pricing`);
  });

  it("normalises a trailing slash to the canonical path", async () => {
    const out = await injectHeadForRequest(fakeReq("/pricing/"), SHELL);

    expect(canonical(out)).toBe(`${BRAND.url}/pricing`);
  });

  it("leaves the shell alone for a non-marketing route on a marketing host", async () => {
    const out = await injectHeadForRequest(fakeReq("/admin"), SHELL);

    expect(out).toBe(SHELL);
  });

  it(`treats www.${BRAND.domain} as a marketing host`, async () => {
    const out = await injectHeadForRequest(
      fakeReq("/pricing", `www.${BRAND.domain}`),
      SHELL,
    );

    expect(canonical(out)).toBe(`${BRAND.url}/pricing`);
  });

  it("ignores a port on the host header", async () => {
    const out = await injectHeadForRequest(
      fakeReq("/pricing", `${BRAND.domain}:443`),
      SHELL,
    );

    expect(canonical(out)).toBe(`${BRAND.url}/pricing`);
  });

  // Regression: isMarketingHost takes a query string, but req.url (a full
  // path+query) was passed, so URLSearchParams parsed "/pricing?surface" as
  // the key and the preview override never fired on a non-marketing host.
  it("honours ?surface=marketing on a non-marketing host", async () => {
    const out = await injectHeadForRequest(
      fakeReq("/pricing?surface=marketing", "some-tenant.example.com"),
      SHELL,
    );

    expect(title(out)).toContain("Pricing");
    expect(canonical(out)).toBe(`${BRAND.url}/pricing`);
  });

  it("does not treat a plain tenant host as marketing", async () => {
    const out = await injectHeadForRequest(
      fakeReq("/pricing", "some-tenant.example.com"),
      SHELL,
    );

    // Falls through to the storefront branch, which finds no tenant here.
    expect(out).toBe(SHELL);
  });
});

// The analytics tag used to be a build-time constant in client/index.html
// referencing two variables that were defined nowhere, so production shipped a
// script tag pointing at the literal string `%VITE_ANALYTICS_ENDPOINT%/umami`.
// It is injected here now; these pin the three properties that failure had.
describe("injectHeadForRequest — page-view tag", () => {
  const ID = "11111111-2222-4333-8444-555555555555";

  const withEnv = async <T>(
    env: Record<string, string>,
    fn: () => Promise<T>,
  ): Promise<T> => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      return await fn();
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  };

  it("emits no tag when analytics is unconfigured", async () => {
    // The default. An unconfigured install must ship no tag at all rather
    // than a dead one — this is the whole reason the snippet moved server-side.
    const out = await injectHeadForRequest(fakeReq("/pricing"), SHELL);
    expect(out).not.toContain("script.js");
    expect(out).not.toContain("data-website-id");
  });

  it("injects the marketing tag inside <head> when configured", async () => {
    const out = await withEnv(
      { ANALYTICS_ENDPOINT: "/_stats", ANALYTICS_WEBSITE_ID: ID },
      () => injectHeadForRequest(fakeReq("/pricing"), SHELL),
    );
    expect(out).toContain('src="/_stats/script.js"');
    expect(out).toContain(`data-website-id="${ID}"`);
    // Inside the head, not appended after </html> where nothing would run it.
    expect(out.indexOf("script.js")).toBeLessThan(out.indexOf("</head>"));
  });

  it("leaves the SEO the injector already wrote intact", async () => {
    const out = await withEnv(
      { ANALYTICS_ENDPOINT: "/_stats", ANALYTICS_WEBSITE_ID: ID },
      () => injectHeadForRequest(fakeReq("/pricing"), SHELL),
    );
    expect(canonical(out)).toBe(`${BRAND.url}/pricing`);
    expect(title(out)).toContain("Pricing");
  });

  it("emits no tag for a host that is neither the marketing site nor a store", async () => {
    // resolveTenantFromRequest is mocked to null here, so this is the
    // unresolved-host path: there is no bucket its views honestly belong in.
    const out = await injectHeadForRequest(
      fakeReq("/", "someone-elses-domain.example"),
      SHELL,
    );
    expect(out).not.toContain("script.js");
  });
});
