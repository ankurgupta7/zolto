/**
 * Trustpilot — fetching a store's live rating.
 *
 * The half of the integration that needs a secret. Everything about URLs and
 * presentation is pure and lives in shared/trustpilot.ts; this module does one
 * thing: turn a business-unit domain into the score, star count and review
 * total that the storefront's trust band prints.
 *
 * Three design points, in the order they matter:
 *
 * 1. The API key is the PLATFORM's, not the merchant's. Trustpilot's Business
 *    Units API is read-only public data behind a key, so one Zolto key serves
 *    every store — a merchant never has to obtain, paste or rotate a
 *    credential, and no tenant secret is created for this.
 *
 * 2. Without a key the feature degrades rather than breaks. `fetchTrustpilotSummary`
 *    returns null, and the storefront falls back to the plain "Read our reviews"
 *    link, which needs nothing but the domain. A self-hosted Zolto with no
 *    Trustpilot account still renders a working trust band.
 *
 * 3. Results are cached in-process, successes and failures alike. A storefront
 *    home page is the most-hit page on the platform and the rating changes a few
 *    times a month; an uncached fetch here would put a third-party API in the
 *    critical path of every visit. Failures are cached for a shorter window so a
 *    Trustpilot outage costs one slow render every few minutes rather than every
 *    single one.
 */

import {
  normaliseTrustpilotDomain,
  trustpilotProfileUrl,
  type TrustpilotSummary,
} from "@shared/trustpilot";

/** Trustpilot's public Business Units API. Fixed host — never merchant input. */
const TRUSTPILOT_API_BASE = "https://api.trustpilot.com/v1";

/** How long a fetched rating is reused. Ratings move slowly; page views don't. */
export const TRUSTPILOT_CACHE_TTL_MS = 15 * 60 * 1000;

/**
 * How long a failure is remembered. Deliberately much shorter than a success:
 * a store that has just connected its profile should not wait a quarter of an
 * hour to see it, and an outage should not be re-probed on every page view.
 */
export const TRUSTPILOT_FAILURE_TTL_MS = 60 * 1000;

/** Trustpilot is a third party in a page render — don't wait on it. */
const REQUEST_TIMEOUT_MS = 4000;

interface CacheEntry {
  value: TrustpilotSummary | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test seam — the suite clears state between cases. */
export function clearTrustpilotCache(): void {
  cache.clear();
}

/**
 * Whether the platform can fetch live ratings at all. The admin uses this to
 * tell a merchant why they see a link but no stars, instead of leaving them to
 * conclude their profile is broken.
 */
export function isTrustpilotConfigured(): boolean {
  return Boolean(process.env.TRUSTPILOT_API_KEY);
}

/**
 * Trustpilot's own JSON, as much of it as we rely on. Every field is optional
 * because this is somebody else's API: a shape change should cost us a null
 * summary and a fallback link, never a 500 on a storefront home page.
 */
interface BusinessUnitResponse {
  id?: string;
  displayName?: string;
  score?: { stars?: number; trustScore?: number };
  numberOfReviews?: number | { total?: number };
}

/** `numberOfReviews` has been both a number and an object over the API's life. */
function reviewCount(raw: BusinessUnitResponse["numberOfReviews"]): number {
  if (typeof raw === "number") return Math.max(0, Math.floor(raw));
  const total = raw?.total;
  return typeof total === "number" ? Math.max(0, Math.floor(total)) : 0;
}

/**
 * The live summary for one business unit, or null when it can't be had — no
 * API key, an unknown domain, a timeout, or a shape we don't recognise. Callers
 * treat null as "show the link, skip the stars".
 *
 * `domain` is normalised here rather than trusted, so a merchant who saved a
 * full URL before validation tightened still gets a working lookup, and so the
 * cache can't be split across three spellings of the same store.
 */
export async function fetchTrustpilotSummary(
  rawDomain: string | null | undefined,
  opts: { now?: number } = {},
): Promise<TrustpilotSummary | null> {
  const domain = normaliseTrustpilotDomain(rawDomain);
  if (!domain) return null;

  const now = opts.now ?? Date.now();
  const cached = cache.get(domain);
  if (cached && cached.expiresAt > now) return cached.value;

  const apiKey = process.env.TRUSTPILOT_API_KEY;
  if (!apiKey) return null;

  let summary: TrustpilotSummary | null = null;
  try {
    const url = `${TRUSTPILOT_API_BASE}/business-units/find?name=${encodeURIComponent(domain)}`;
    const response = await fetch(url, {
      headers: { apikey: apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (response.ok) {
      const body = (await response.json()) as BusinessUnitResponse;
      const trustScore = body.score?.trustScore;
      // A business unit with no score is one nobody has reviewed yet. Showing
      // "0.0 from 0 reviews" on a home page is worse than showing nothing, so
      // that case is a null summary too.
      if (typeof trustScore === "number" && trustScore > 0) {
        summary = {
          domain,
          displayName: body.displayName ?? null,
          stars:
            typeof body.score?.stars === "number"
              ? body.score.stars
              : trustScore,
          trustScore,
          numberOfReviews: reviewCount(body.numberOfReviews),
          profileUrl: trustpilotProfileUrl(domain),
        };
      }
    } else if (response.status !== 404) {
      // 404 is the ordinary "this domain has no Trustpilot profile" and is not
      // worth a log line on every cache miss. Anything else is ours to notice.
      console.warn(
        `[Trustpilot] ${response.status} looking up business unit "${domain}"`,
      );
    }
  } catch (err) {
    console.warn(`[Trustpilot] Lookup failed for "${domain}":`, err);
  }

  cache.set(domain, {
    value: summary,
    expiresAt:
      now + (summary ? TRUSTPILOT_CACHE_TTL_MS : TRUSTPILOT_FAILURE_TTL_MS),
  });
  return summary;
}
