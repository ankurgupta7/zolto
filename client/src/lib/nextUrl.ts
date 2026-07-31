/**
 * Client-side guard for a `?next=` post-sign-in redirect target.
 *
 * The server has its own copy of this check (server/_core/oauth.ts
 * sanitizeNextTarget) because it is the one that ultimately performs the
 * redirect. This one exists because the sign-in page ALSO acts on `next`
 * itself — an already-signed-in visitor is bounced straight there — so an
 * unchecked `?next=https://evil.example` would be an open redirect that never
 * touches the server.
 *
 * Always returns an ABSOLUTE url on `origin`, never a bare path: the OAuth
 * round-trip returns through the platform's canonical host, so a tenant
 * subdomain's `next` has to name its own origin explicitly or the merchant
 * lands on the wrong host (see server/_core/oauth.ts getCanonicalOrigin).
 */
export function sanitizeNextUrl(
  raw: string | null | undefined,
  origin: string,
): string | null {
  if (!raw || raw.length > 512) return null;
  // No control characters or whitespace (defends against header/redirect
  // smuggling), matching the server-side check.
  for (let i = 0; i < raw.length; i++) {
    if (raw.charCodeAt(i) <= 0x20) return null;
  }

  // A rooted path — but never "//" or "/\", which browsers read as
  // protocol-relative and would resolve to another origin entirely.
  if (raw.startsWith("/")) {
    if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
    return `${origin}${raw}`;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // Same-origin only. Cross-subdomain returns (a merchant signing in from
  // their own store) are safe because the caller passes that store's own
  // href, which IS this origin — nothing here needs to reach another host.
  if (url.origin !== origin) return null;
  return `${url.origin}${url.pathname}${url.search}`;
}
