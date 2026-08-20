/**
 * Surface resolution — decides whether the current request is the Gwinn
 * marketing/SaaS surface (pricing, signup, onboarding) or a tenant storefront,
 * based on the hostname. Pure functions so they can be unit-tested without a DOM.
 *
 * Hostname model (hostname-aware, single app):
 *   - Apex / www of the platform domain  → "marketing"  (gwinn.ch, www.gwinn.ch)
 *   - Any other host                     → "storefront" (kalakosh.gwinn.ch, kalakosh.ch)
 *
 * A platform subdomain carries its store's slug in the hostname; a custom
 * domain doesn't, so the server stamps the resolved slug into the shell as
 * `<meta name="gwinn-tenant-slug">` (server/storefrontHead.ts) and this module
 * reads it.
 *
 * Dev override (localhost / 127.0.0.1, or any host when explicitly set):
 *   - ?surface=marketing|storefront   forces the surface
 *   - ?tenant=<slug>                  forces the storefront tenant slug
 *   - VITE_DEFAULT_TENANT_SLUG        default storefront slug when none derivable
 */

export type Surface = "marketing" | "storefront";

/** Hostnames (and suffixes) that render the Gwinn marketing surface. */
const MARKETING_HOSTS = new Set(["gwinn.ch", "www.gwinn.ch"]);

/** The platform apex domain — subdomains of it map to tenant slugs. */
const PLATFORM_APEX = "gwinn.ch";

const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", ""]);

export function isDevHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  return DEV_HOSTS.has(host) || host.endsWith(".local");
}

/**
 * Derive the tenant slug from a storefront hostname.
 * `kalakosh.gwinn.ch` → "kalakosh". Custom domains (kalakosh.ch) and the apex
 * itself return null — the caller falls back to a configured default. Custom-domain
 * → slug mapping is resolved server-side (tenant context middleware), not here.
 */
export function tenantSlugFromHost(hostname: string): string | null {
  const host = hostname.split(":")[0].toLowerCase();
  if (host === PLATFORM_APEX || host === `www.${PLATFORM_APEX}`) return null;
  if (host.endsWith(`.${PLATFORM_APEX}`)) {
    const sub = host.slice(0, -1 * (PLATFORM_APEX.length + 1));
    // Ignore reserved/infra subdomains.
    if (!sub || sub === "www" || sub === "app" || sub === "api") return null;
    // Only the left-most label is the slug (kalakosh.foo.gwinn.ch → "kalakosh").
    return sub.split(".")[0];
  }
  return null;
}

export interface SurfaceResolution {
  surface: Surface;
  /** Tenant slug for storefront surfaces; null on marketing. */
  tenantSlug: string | null;
}

export interface ResolveOptions {
  hostname: string;
  /** URLSearchParams-like search string, e.g. window.location.search. */
  search?: string;
  /** Fallback slug (from VITE_DEFAULT_TENANT_SLUG) for dev / custom domains. */
  defaultTenantSlug?: string;
  /**
   * The slug the server stamped into the shell for this host
   * (`<meta name="gwinn-tenant-slug">`) — the only way to know which store a
   * custom domain belongs to, since the hostname carries no slug. Defaults to
   * reading the document; pass explicitly in tests.
   */
  hostTenantSlug?: string | null;
}

/**
 * The slug the server resolved for this host, read from the injected meta tag
 * (server/storefrontHead.ts). Null on the marketing shell, in tests, and in the
 * dev server before any tenant is resolved.
 */
export function tenantSlugFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="gwinn-tenant-slug"]',
  );
  return meta?.content?.trim() || null;
}

/**
 * Absolute URL to a tenant's storefront home. Cross-surface navigation MUST be
 * a real (full-page) navigation, not a wouter <Link>: the surface is resolved
 * once at app mount, so a client-side route change from the marketing app to
 * /admin just 404s inside the marketing router (it has no such route). From the
 * platform apex we send the browser to the tenant's own subdomain; in dev /
 * preview (where subdomains aren't available) we stay same-origin and force the
 * storefront surface with query params.
 */
export function storefrontOrigin(
  slug: string,
  hostname: string,
): { origin: string; needsSurfaceParam: boolean } {
  const host = hostname.split(":")[0].toLowerCase();
  if (host === PLATFORM_APEX || host === `www.${PLATFORM_APEX}`) {
    return {
      origin: `https://${slug}.${PLATFORM_APEX}`,
      needsSurfaceParam: false,
    };
  }
  // Dev / preview / custom host: same origin, force the storefront surface.
  return { origin: "", needsSurfaceParam: true };
}

/** Full-page-navigation URL to the tenant admin dashboard. */
export function storeAdminUrl(
  slug: string,
  hostname: string = typeof window !== "undefined"
    ? window.location.hostname
    : "",
): string {
  const { origin, needsSurfaceParam } = storefrontOrigin(slug, hostname);
  return needsSurfaceParam
    ? `/admin?surface=storefront&tenant=${encodeURIComponent(slug)}`
    : `${origin}/admin`;
}

/** Full-page-navigation URL to the tenant's public storefront home. */
export function storeHomeUrl(
  slug: string,
  hostname: string = typeof window !== "undefined"
    ? window.location.hostname
    : "",
): string {
  const { origin, needsSurfaceParam } = storefrontOrigin(slug, hostname);
  return needsSurfaceParam
    ? `/?surface=storefront&tenant=${encodeURIComponent(slug)}`
    : `${origin}/`;
}

export function resolveSurface({
  hostname,
  search = "",
  defaultTenantSlug = "demo",
  hostTenantSlug = tenantSlugFromDocument(),
}: ResolveOptions): SurfaceResolution {
  const params = new URLSearchParams(search);
  const forcedSurface = params.get("surface");
  const forcedTenant = params.get("tenant");
  const dev = isDevHost(hostname);

  // Explicit override (query param) always wins — available in dev, or on any
  // host, so previews/tests can exercise both surfaces deterministically.
  if (forcedSurface === "marketing") {
    return { surface: "marketing", tenantSlug: null };
  }
  if (forcedSurface === "storefront") {
    return {
      surface: "storefront",
      tenantSlug: forcedTenant || defaultTenantSlug,
    };
  }

  const host = hostname.split(":")[0].toLowerCase();

  // Production marketing hosts.
  if (MARKETING_HOSTS.has(host)) {
    return { surface: "marketing", tenantSlug: null };
  }

  // Dev: default to the storefront (preserves the existing local dev experience),
  // honoring ?tenant=<slug> when provided.
  if (dev) {
    return {
      surface: "storefront",
      tenantSlug: forcedTenant || defaultTenantSlug,
    };
  }

  // Any other production host is a tenant storefront (subdomain or custom domain).
  // On a custom domain the hostname yields no slug, so the server-stamped one is
  // what keeps the SPA pointed at the right store — ahead of the configured
  // default, which used to win and made every custom domain render (and query
  // the API for) VITE_DEFAULT_TENANT_SLUG's store instead of the merchant's.
  return {
    surface: "storefront",
    tenantSlug:
      tenantSlugFromHost(hostname) ||
      forcedTenant ||
      hostTenantSlug ||
      defaultTenantSlug,
  };
}
