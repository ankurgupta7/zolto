/**
 * Fetching half of the switch-in site import (server/siteImport.ts does the
 * reading). This is the part that touches a URL a merchant typed, so it is
 * written defensively.
 *
 * The threat is server-side request forgery. `assertPublicHostname` (server/
 * ssrf.ts) already refuses loopback, private, link-local and cloud-metadata
 * addresses — but checking only the URL the merchant typed is not enough,
 * because a redirect moves the target after the check has passed. A merchant
 * (or someone who talked one into pasting a link) could point us at a host that
 * 302s to 169.254.169.254 and read the cloud metadata service through us.
 *
 * So: `redirect: "manual"`, and EVERY hop is re-validated before it is
 * followed. That is the single most important line in this file. Everything
 * else — page caps, byte caps, a total time budget, html-only, same-origin —
 * bounds what a hostile or merely enormous site can cost us.
 */

import { assertPublicHostname } from "./ssrf";
import { looksLikeCatalogueUrl, sameOriginLinks } from "./siteImport";

export interface CrawlLimits {
  /** Pages fetched before we stop and import what we have. */
  maxPages: number;
  /** Per-response ceiling; a 50MB "page" is not a page. */
  maxBytesPerPage: number;
  /** Whole-crawl budget, so one slow host can't hold a request open. */
  totalTimeoutMs: number;
  perRequestTimeoutMs: number;
}

export const DEFAULT_LIMITS: CrawlLimits = {
  // Enough for a small maker's whole shop; far short of a general web crawler.
  maxPages: 60,
  maxBytesPerPage: 2_000_000,
  totalTimeoutMs: 60_000,
  perRequestTimeoutMs: 10_000,
};

/** How we identify ourselves, so a merchant can see us in their logs. */
export const USER_AGENT =
  "ZoltoImporter/1.0 (+https://zolto.ch/; one-time shop import on behalf of the site owner)";

const MAX_REDIRECTS = 5;

export interface FetchedPage {
  url: string;
  html: string;
}

export interface CrawlResult {
  pages: FetchedPage[];
  /** Pages we asked for, including ones that came back unusable. */
  attempted: number;
  warnings: string[];
}

export type FetchImpl = typeof fetch;

// ─── robots.txt ───────────────────────────────────────────────────────────────

/**
 * The Disallow rules that apply to us: the `*` group plus any group naming
 * this crawler. Deliberately simple — Allow-overrides and wildcards are not
 * modelled, and when in doubt we obey rather than proceed.
 */
export function parseRobots(txt: string): string[] {
  const disallow: string[] = [];
  let applies = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*" || /zolto/i.test(value);
      continue;
    }
    if (applies && key === "disallow" && value) disallow.push(value);
  }
  return disallow;
}

export function isAllowedByRobots(
  pathname: string,
  disallow: string[],
): boolean {
  return !disallow.some((rule) => {
    if (rule === "/") return true;
    // Treat a trailing * as the prefix match it already is.
    const prefix = rule.replace(/\*+$/, "");
    return prefix.length > 0 && pathname.startsWith(prefix);
  });
}

// ─── One safe fetch ───────────────────────────────────────────────────────────

/**
 * Fetch a URL, re-validating the hostname at every redirect hop.
 *
 * Returns null for anything unusable — blocked host, non-HTML, oversized,
 * error status — because a crawler that throws on the third of sixty pages
 * loses the other fifty-nine.
 */
export async function fetchPageSafely(
  url: string,
  opts: {
    fetchImpl?: FetchImpl;
    timeoutMs?: number;
    maxBytes?: number;
    /**
     * "html" skips anything that isn't a page — the right default for a crawl.
     * "any" exists for robots.txt, which is text/plain: fetching it through the
     * HTML-only path silently discarded it, so robots was never actually obeyed.
     */
    accept?: "html" | "any";
  } = {},
): Promise<FetchedPage | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_LIMITS.perRequestTimeoutMs;
  const maxBytes = opts.maxBytes ?? DEFAULT_LIMITS.maxBytesPerPage;
  const accept = opts.accept ?? "html";

  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
      return null;

    // THE check. Runs before the FIRST request and before following EVERY
    // redirect — validating only the merchant's original URL would let a 302
    // walk us into the private network behind this server.
    try {
      await assertPublicHostname(parsed.hostname);
    } catch {
      return null;
    }

    let res: Response;
    try {
      res = await doFetch(parsed.toString(), {
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*;q=0.5" },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return null;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      try {
        current = new URL(location, parsed).toString();
      } catch {
        return null;
      }
      continue;
    }

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (
      accept === "html" &&
      contentType &&
      !/text\/html|application\/xhtml/i.test(contentType)
    ) {
      return null;
    }

    // Trust the declared length when it is already too big, but never trust it
    // to be honest about being small — measure the body too.
    const declared = Number.parseInt(
      res.headers.get("content-length") ?? "",
      10,
    );
    if (Number.isFinite(declared) && declared > maxBytes) return null;

    let html: string;
    try {
      html = await res.text();
    } catch {
      return null;
    }
    if (html.length > maxBytes) html = html.slice(0, maxBytes);

    return { url: parsed.toString(), html };
  }

  // Ran out of hops — a redirect loop.
  return null;
}

// ─── The crawl ────────────────────────────────────────────────────────────────

/**
 * Walk a shop, breadth-first, catalogue pages first.
 *
 * Ordering matters more than it looks: the budget is small, so on a site with
 * a blog and a shop we want the sixty pages we do fetch to be the products.
 * `looksLikeCatalogueUrl` only re-orders the queue — nothing is excluded by it,
 * so a shop with unusual URLs still imports, just later in the budget.
 */
export async function crawlSite(
  startUrl: string,
  opts: {
    fetchImpl?: FetchImpl;
    limits?: Partial<CrawlLimits>;
    now?: () => number;
  } = {},
): Promise<CrawlResult> {
  const limits = { ...DEFAULT_LIMITS, ...opts.limits };
  const now = opts.now ?? Date.now;
  const startedAt = now();
  const warnings: string[] = [];

  let origin: string;
  try {
    origin = new URL(startUrl).origin;
  } catch {
    return {
      pages: [],
      attempted: 0,
      warnings: ["That doesn't look like a web address."],
    };
  }

  // robots.txt is advisory for us — we are acting for the site's own owner —
  // but obeying it costs one request and avoids hammering anything the owner
  // deliberately walled off.
  let disallow: string[] = [];
  const robots = await fetchPageSafely(`${origin}/robots.txt`, {
    fetchImpl: opts.fetchImpl,
    timeoutMs: limits.perRequestTimeoutMs,
    maxBytes: 100_000,
    accept: "any",
  }).catch(() => null);
  if (robots) disallow = parseRobots(robots.html);

  const queue: string[] = [startUrl];
  const seen = new Set<string>([startUrl]);
  const pages: FetchedPage[] = [];
  let attempted = 0;

  while (queue.length > 0 && pages.length < limits.maxPages) {
    if (now() - startedAt > limits.totalTimeoutMs) {
      warnings.push(
        `We stopped after ${Math.round(limits.totalTimeoutMs / 1000)}s and imported what we had found by then.`,
      );
      break;
    }

    const url = queue.shift()!;
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      continue;
    }
    if (!isAllowedByRobots(pathname, disallow)) continue;

    attempted++;
    const page = await fetchPageSafely(url, {
      fetchImpl: opts.fetchImpl,
      timeoutMs: limits.perRequestTimeoutMs,
      maxBytes: limits.maxBytesPerPage,
    });
    if (!page) continue;
    pages.push(page);

    // Grow the frontier from what this page linked to. sameOriginLinks already
    // drops off-site and non-http links; prioritiseLinks puts catalogue URLs
    // in front so a small page budget is spent on products, not the blog.
    for (const link of prioritiseLinks(sameOriginLinks(page.html, page.url))) {
      if (seen.has(link)) continue;
      seen.add(link);
      queue.push(link);
    }
  }

  if (pages.length >= limits.maxPages) {
    warnings.push(
      `We looked at the first ${limits.maxPages} pages of that site. If your shop is bigger, import again from a category page to pick up the rest.`,
    );
  }

  return { pages, attempted, warnings };
}

/**
 * Order a set of discovered links for the crawl frontier: catalogue-looking
 * URLs first, then everything else, both in discovery order.
 */
export function prioritiseLinks(links: string[]): string[] {
  const catalogue: string[] = [];
  const rest: string[] = [];
  for (const link of links) {
    (looksLikeCatalogueUrl(link) ? catalogue : rest).push(link);
  }
  return [...catalogue, ...rest];
}
