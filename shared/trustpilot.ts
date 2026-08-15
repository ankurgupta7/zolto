/**
 * Trustpilot — the Swiss storefront's third-party review profile.
 *
 * Pure functions only: URL shapes, the identifier a merchant actually types,
 * and how a score is rendered. The network half (fetching a business unit's
 * live rating) lives in server/trustpilot.ts, because an API key is involved
 * and the browser must never see it.
 *
 * A Trustpilot business unit is identified by the DOMAIN it was registered
 * under — "kalakosh.ch", not a numeric id — which is what makes this workable
 * without an API key at all: with only the domain we can still link a customer
 * to the profile and to the review form. The API key only buys the live star
 * rating, so everything here degrades to "a link to our reviews" when the
 * platform has not configured one.
 *
 * trustpilot.ch redirects to ch.trustpilot.com, which is the canonical Swiss
 * locale host and the one the review widgets use. We build ch.trustpilot.com
 * URLs directly rather than sending customers through a redirect.
 */

/** Canonical host for the Swiss (de-CH/fr-CH) Trustpilot locale. */
export const TRUSTPILOT_CH_HOST = "ch.trustpilot.com";

/**
 * What a merchant may paste into the Trustpilot field, reduced to the bare
 * domain Trustpilot identifies their business unit by.
 *
 * Accepts all of these, because all of them are things a merchant copies out
 * of their own browser:
 *   kalakosh.ch
 *   www.kalakosh.ch
 *   https://kalakosh.ch/
 *   https://ch.trustpilot.com/review/kalakosh.ch
 *   https://www.trustpilot.com/review/kalakosh.ch?utm_source=…
 *
 * Returns null for anything that isn't a plausible domain, so the caller can
 * refuse it rather than store a value that would render a dead link. A dead
 * "read our reviews" link is worse than no link: it reads as a broken store.
 */
export function normaliseTrustpilotDomain(
  input: string | null | undefined,
): string | null {
  if (!input) return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  // Strip a scheme, then anything after the authority.
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.split(/[/?#]/)[0] ?? "";

  // A pasted Trustpilot profile URL: the business unit is the path segment
  // after /review/, not the trustpilot host we just isolated.
  const reviewMatch = input
    .trim()
    .toLowerCase()
    .match(/trustpilot\.[a-z.]+\/review\/([^/?#]+)/);
  if (reviewMatch?.[1]) value = reviewMatch[1];

  value = value.replace(/^www\./, "");
  // Trailing dot is legal in DNS and meaningless here.
  value = value.replace(/\.$/, "");

  if (
    !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
      value,
    )
  ) {
    return null;
  }
  if (value.length > 253) return null;
  // A bare TLD ("ch") is not a business unit.
  const tld = value.split(".").pop() ?? "";
  if (tld.length < 2) return null;

  return value;
}

/** The public profile page — where a shopper reads this store's reviews. */
export function trustpilotProfileUrl(domain: string): string {
  return `https://${TRUSTPILOT_CH_HOST}/review/${encodeURIComponent(domain)}`;
}

/**
 * The review form — where a customer who just bought something is sent to
 * leave one. Separate from the profile URL because the two do different jobs:
 * the storefront links to the profile, the post-purchase nudge to this.
 */
export function trustpilotEvaluateUrl(domain: string): string {
  return `https://${TRUSTPILOT_CH_HOST}/evaluate/${encodeURIComponent(domain)}`;
}

/**
 * Trustpilot's own summary of a business unit, in the shape the storefront
 * renders. `stars` is Trustpilot's 1–5 rounded-to-half figure used for the
 * star row; `trustScore` is the finer 0–5 number shown as text.
 */
export interface TrustpilotSummary {
  domain: string;
  displayName: string | null;
  /** 0–5, rounded to a half star by Trustpilot itself. */
  stars: number;
  /** 0–5 with one decimal — the number shown next to the stars. */
  trustScore: number;
  numberOfReviews: number;
  profileUrl: string;
}

/**
 * How many whole / half / empty stars to draw for a 0–5 score.
 *
 * Rounds to the nearest half, which is what Trustpilot's own widgets do — a
 * 4.3 shows four and a half stars there, and a storefront that rounded
 * differently would look like it was inflating (or deflating) its rating next
 * to the same badge on Trustpilot's site.
 */
export function starBuckets(score: number): {
  full: number;
  half: number;
  empty: number;
} {
  const clamped = Math.min(5, Math.max(0, Number.isFinite(score) ? score : 0));
  const halves = Math.round(clamped * 2);
  const full = Math.floor(halves / 2);
  const half = halves % 2;
  return { full, half, empty: 5 - full - half };
}

/**
 * The score as it is written next to the stars: one decimal, always — "4.0",
 * not "4". Trustpilot writes it that way and a bare integer reads as a
 * different, coarser measurement.
 */
export function formatTrustScore(score: number): string {
  const clamped = Math.min(5, Math.max(0, Number.isFinite(score) ? score : 0));
  return clamped.toFixed(1);
}

/**
 * Trustpilot's word for a score band ("Excellent", "Great", …). Shown because
 * the word is what a shopper actually reads off a Trustpilot badge; the bands
 * are Trustpilot's own published ones.
 */
export function trustScoreLabel(score: number): string {
  if (score >= 4.3) return "Excellent";
  if (score >= 3.8) return "Great";
  if (score >= 3.0) return "Average";
  if (score >= 2.0) return "Poor";
  return "Bad";
}
