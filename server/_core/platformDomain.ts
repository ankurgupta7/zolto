/**
 * The platform's own root domain — gwinn.ch in standalone deploys, or
 * gwinn.kalakosh.ch when run alongside Kalakosh-ch — derived from
 * PUBLIC_BASE_URL, the one env var set consistently across every deploy mode
 * (falls back to SITE_DOMAIN for standalone deploys that only set that one).
 *
 * Used anywhere we need to recognize "this hostname is ours" without hard-
 * coding a single domain: Caddy's on-demand-TLS ask endpoint (domainAsk.ts),
 * the cross-subdomain session cookie (cookies.ts), and the OAuth redirect
 * target validator (oauth.ts).
 */
export function getPlatformRootDomain(): string | null {
  const base = process.env.PUBLIC_BASE_URL?.trim();
  if (base) {
    try {
      return new URL(base).hostname.toLowerCase();
    } catch {
      // fall through to SITE_DOMAIN
    }
  }
  const site = process.env.SITE_DOMAIN?.trim().toLowerCase();
  // Only a real registrable domain counts — excludes the ":80" by-IP testing
  // mode and bare hosts like "localhost", where subdomain-wide behavior
  // (widened cookies, cross-subdomain redirects) isn't meaningful.
  if (site && site.includes(".")) return site;
  return null;
}

/** True when `hostname` is the platform root domain or one of its subdomains. */
export function isPlatformHost(
  hostname: string | undefined,
  root: string | null,
): boolean {
  if (!hostname || !root) return false;
  const host = hostname.toLowerCase();
  return host === root || host.endsWith(`.${root}`);
}
