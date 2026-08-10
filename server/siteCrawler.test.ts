import { describe, it, expect, vi, beforeEach } from "vitest";

// ssrf.ts does real DNS; mock it so these tests are hermetic and can drive the
// blocked/allowed decision per hostname.
const assertPublicHostname = vi.hoisted(() => vi.fn());
vi.mock("./ssrf", () => ({ assertPublicHostname }));

import {
  crawlSite,
  fetchPageSafely,
  isAllowedByRobots,
  parseRobots,
  prioritiseLinks,
  USER_AGENT,
} from "./siteCrawler";

/** Builds a fetch stub from a url → response map. */
function stub(
  routes: Record<
    string,
    { status?: number; body?: string; headers?: Record<string, string> }
  >,
) {
  return vi.fn(async (url: string | URL) => {
    const key = String(url);
    const r = routes[key];
    if (!r) {
      return {
        ok: false,
        status: 404,
        headers: new Headers(),
        text: async () => "",
      } as unknown as Response;
    }
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers({
        "content-type": "text/html",
        ...(r.headers ?? {}),
      }),
      text: async () => r.body ?? "",
    } as unknown as Response;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  assertPublicHostname.mockResolvedValue(undefined);
});

describe("robots.txt", () => {
  it("collects the rules that apply to us and to everyone", () => {
    expect(
      parseRobots(
        [
          "User-agent: Googlebot",
          "Disallow: /google-only",
          "",
          "User-agent: *",
          "Disallow: /admin",
          "Disallow: /cart   # comment",
        ].join("\n"),
      ),
    ).toEqual(["/admin", "/cart"]);
  });

  it("picks up a group that names this crawler", () => {
    expect(
      parseRobots("User-agent: ZoltoImporter\nDisallow: /private"),
    ).toEqual(["/private"]);
  });

  it("blocks by prefix, and treats Disallow: / as everything", () => {
    expect(isAllowedByRobots("/admin/orders", ["/admin"])).toBe(false);
    expect(isAllowedByRobots("/products/mug", ["/admin"])).toBe(true);
    expect(isAllowedByRobots("/anything", ["/"])).toBe(false);
  });
});

describe("fetchPageSafely — SSRF", () => {
  it("refuses a host the SSRF guard rejects", async () => {
    assertPublicHostname.mockRejectedValue(
      new Error("Internal URLs not allowed"),
    );
    const fetchImpl = stub({});
    expect(
      await fetchPageSafely("http://169.254.169.254/latest/meta-data", {
        fetchImpl,
      }),
    ).toBeNull();
    // Never even dialled.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  // The bug this whole module is shaped around: validating only the URL the
  // merchant typed lets a 302 walk us into the private network afterwards.
  it("re-validates the host on every redirect hop", async () => {
    assertPublicHostname.mockImplementation(async (host: string) => {
      if (host === "169.254.169.254") throw new Error("blocked");
    });
    const fetchImpl = stub({
      "https://shop.example/": {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data" },
      },
      "http://169.254.169.254/latest/meta-data": { body: "SECRET-CREDENTIALS" },
    });

    const page = await fetchPageSafely("https://shop.example/", { fetchImpl });

    expect(page).toBeNull();
    expect(assertPublicHostname).toHaveBeenCalledWith("169.254.169.254");
    // The metadata endpoint was never requested.
    expect(
      fetchImpl.mock.calls.some((c) => String(c[0]).includes("169.254")),
    ).toBe(false);
  });

  it("follows a redirect that stays on a public host", async () => {
    const fetchImpl = stub({
      "https://shop.example/": {
        status: 301,
        headers: { location: "https://www.shop.example/home" },
      },
      "https://www.shop.example/home": { body: "<html>hi</html>" },
    });
    const page = await fetchPageSafely("https://shop.example/", { fetchImpl });
    expect(page).toMatchObject({
      url: "https://www.shop.example/home",
      html: "<html>hi</html>",
    });
  });

  it("gives up on a redirect loop instead of spinning", async () => {
    const fetchImpl = stub({
      "https://a.example/": {
        status: 302,
        headers: { location: "https://a.example/" },
      },
    });
    expect(
      await fetchPageSafely("https://a.example/", { fetchImpl }),
    ).toBeNull();
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(6);
  });

  it("refuses non-http schemes outright", async () => {
    const fetchImpl = stub({});
    expect(
      await fetchPageSafely("file:///etc/passwd", { fetchImpl }),
    ).toBeNull();
    expect(await fetchPageSafely("ftp://x.example/", { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("fetchPageSafely — what counts as a page", () => {
  it("identifies itself so a merchant can see us in their logs", async () => {
    const fetchImpl = stub({
      "https://shop.example/": { body: "<html></html>" },
    });
    await fetchPageSafely("https://shop.example/", { fetchImpl });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["user-agent"]).toBe(
      USER_AGENT,
    );
    // Manual redirects are what makes the per-hop check possible at all.
    expect(init.redirect).toBe("manual");
  });

  it("skips a non-HTML response", async () => {
    const fetchImpl = stub({
      "https://shop.example/a.pdf": {
        body: "%PDF",
        headers: { "content-type": "application/pdf" },
      },
    });
    expect(
      await fetchPageSafely("https://shop.example/a.pdf", { fetchImpl }),
    ).toBeNull();
  });

  it("skips a response that declares itself oversized", async () => {
    const fetchImpl = stub({
      "https://shop.example/": {
        body: "x",
        headers: { "content-length": "99999999" },
      },
    });
    expect(
      await fetchPageSafely("https://shop.example/", {
        fetchImpl,
        maxBytes: 1000,
      }),
    ).toBeNull();
  });

  it("truncates a body that lied about its size", async () => {
    // content-length can be absent or wrong; the body is the only real measure.
    const fetchImpl = stub({
      "https://shop.example/": { body: "y".repeat(5000) },
    });
    const page = await fetchPageSafely("https://shop.example/", {
      fetchImpl,
      maxBytes: 1000,
    });
    expect(page?.html).toHaveLength(1000);
  });

  it("returns null on an error status rather than throwing", async () => {
    const fetchImpl = stub({ "https://shop.example/": { status: 500 } });
    expect(
      await fetchPageSafely("https://shop.example/", { fetchImpl }),
    ).toBeNull();
  });

  it("returns null when the network throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    expect(
      await fetchPageSafely("https://shop.example/", { fetchImpl }),
    ).toBeNull();
  });
});

describe("prioritiseLinks", () => {
  it("puts catalogue URLs ahead of everything else", () => {
    expect(
      prioritiseLinks([
        "https://x.test/blog/post",
        "https://x.test/products/mug",
        "https://x.test/impressum",
        "https://x.test/shop",
      ]),
    ).toEqual([
      "https://x.test/products/mug",
      "https://x.test/shop",
      "https://x.test/blog/post",
      "https://x.test/impressum",
    ]);
  });

  it("re-orders without excluding — an unusual URL scheme still gets crawled", () => {
    const links = ["https://x.test/a", "https://x.test/b"];
    expect(prioritiseLinks(links).sort()).toEqual(links.sort());
  });
});

describe("crawlSite", () => {
  it("follows same-origin links and collects the pages", async () => {
    const fetchImpl = stub({
      "https://shop.example/robots.txt": {
        body: "",
        headers: { "content-type": "text/plain" },
      },
      "https://shop.example/": {
        body: `<a href="/products/mug">mug</a><a href="https://elsewhere.example/x">off</a>`,
      },
      "https://shop.example/products/mug": { body: "<html>mug page</html>" },
    });

    const result = await crawlSite("https://shop.example/", { fetchImpl });

    expect(result.pages.map((p) => p.url)).toEqual([
      "https://shop.example/",
      "https://shop.example/products/mug",
    ]);
    expect(
      fetchImpl.mock.calls.some((c) => String(c[0]).includes("elsewhere")),
    ).toBe(false);
  });

  it("obeys robots.txt", async () => {
    const fetchImpl = stub({
      "https://shop.example/robots.txt": {
        body: "User-agent: *\nDisallow: /private",
        headers: { "content-type": "text/plain" },
      },
      "https://shop.example/": { body: `<a href="/private/x">no</a>` },
      "https://shop.example/private/x": { body: "<html>secret</html>" },
    });

    const result = await crawlSite("https://shop.example/", { fetchImpl });

    expect(result.pages.map((p) => p.url)).toEqual(["https://shop.example/"]);
  });

  it("stops at the page cap and says so", async () => {
    const routes: Record<
      string,
      { body: string; headers?: Record<string, string> }
    > = {
      "https://shop.example/robots.txt": {
        body: "",
        headers: { "content-type": "text/plain" },
      },
    };
    const links = Array.from(
      { length: 10 },
      (_, i) => `<a href="/products/p${i}">p</a>`,
    ).join("");
    routes["https://shop.example/"] = { body: links };
    for (let i = 0; i < 10; i++) {
      routes[`https://shop.example/products/p${i}`] = { body: "<html></html>" };
    }

    const result = await crawlSite("https://shop.example/", {
      fetchImpl: stub(routes),
      limits: { maxPages: 3 },
    });

    expect(result.pages).toHaveLength(3);
    expect(result.warnings.join(" ")).toMatch(/first 3 pages/);
  });

  it("stops on the time budget and keeps what it already read", async () => {
    let clock = 0;
    const result = await crawlSite("https://shop.example/", {
      fetchImpl: stub({
        "https://shop.example/robots.txt": {
          body: "",
          headers: { "content-type": "text/plain" },
        },
        "https://shop.example/": { body: `<a href="/products/a">a</a>` },
        "https://shop.example/products/a": { body: "<html></html>" },
      }),
      limits: { totalTimeoutMs: 100 },
      // First check passes, the next one is past the budget.
      now: () => (clock += 80),
    });
    expect(result.warnings.join(" ")).toMatch(/stopped after/);
  });

  it("never fetches a page twice", async () => {
    const fetchImpl = stub({
      "https://shop.example/robots.txt": {
        body: "",
        headers: { "content-type": "text/plain" },
      },
      "https://shop.example/": { body: `<a href="/a">a</a><a href="/a">a</a>` },
      "https://shop.example/a": { body: `<a href="/">home</a>` },
    });

    await crawlSite("https://shop.example/", { fetchImpl });

    const pageFetches = fetchImpl.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => !u.endsWith("robots.txt"));
    expect(new Set(pageFetches).size).toBe(pageFetches.length);
  });

  it("rejects input that is not a web address", async () => {
    const result = await crawlSite("not a url", { fetchImpl: stub({}) });
    expect(result.pages).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(
      /doesn't look like a web address/,
    );
  });
});
