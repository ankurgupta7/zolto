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
<title>Zolto</title>
<meta name="description" content="old default" />
</head><body><div id="root"></div></body></html>`;

function fakeReq(url: string, host = "zolto.ch"): Request {
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
  process.env.PUBLIC_BASE_URL = "https://zolto.ch";
});

afterAll(() => {
  if (savedBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = savedBaseUrl;
});

describe("injectHeadForRequest — marketing route resolution", () => {
  // Regression: this read req.path, which Express collapses to "/" under a
  // "*" mount. Every marketing page rendered the homepage's title and
  // canonical=https://zolto.ch/, telling crawlers the whole site was one page.
  it("resolves the route from originalUrl, not the rewritten req.path", async () => {
    const out = await injectHeadForRequest(fakeReq("/pricing"), SHELL);

    expect(canonical(out)).toBe("https://zolto.ch/pricing");
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
      "https://zolto.ch/",
      "https://zolto.ch/pricing",
      "https://zolto.ch/signup",
      "https://zolto.ch/blog",
      "https://zolto.ch/legal/privacy",
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

    expect(canonical(out)).toBe("https://zolto.ch/pricing");
  });

  it("normalises a trailing slash to the canonical path", async () => {
    const out = await injectHeadForRequest(fakeReq("/pricing/"), SHELL);

    expect(canonical(out)).toBe("https://zolto.ch/pricing");
  });

  it("leaves the shell alone for a non-marketing route on a marketing host", async () => {
    const out = await injectHeadForRequest(fakeReq("/admin"), SHELL);

    expect(out).toBe(SHELL);
  });

  it("treats www.zolto.ch as a marketing host", async () => {
    const out = await injectHeadForRequest(
      fakeReq("/pricing", "www.zolto.ch"),
      SHELL,
    );

    expect(canonical(out)).toBe("https://zolto.ch/pricing");
  });

  it("ignores a port on the host header", async () => {
    const out = await injectHeadForRequest(
      fakeReq("/pricing", "zolto.ch:443"),
      SHELL,
    );

    expect(canonical(out)).toBe("https://zolto.ch/pricing");
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
    expect(canonical(out)).toBe("https://zolto.ch/pricing");
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
