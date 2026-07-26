/**
 * Surface resolution — decides whether the current request is the Zolto
 * marketing/SaaS surface (pricing, signup, onboarding) or a tenant storefront,
 * based on the hostname. Pure functions so they can be unit-tested without a DOM.
 *
 * Hostname model (hostname-aware, single app):
 *   - Apex / www of the platform domain  → "marketing"  (zolto.ch, www.zolto.ch)
 *   - Any other host                     → "storefront" (kalakosh.zolto.ch, kalakosh.ch)
 *
 * Dev override (localhost / 127.0.0.1, or any host when explicitly set):
 *   - ?surface=marketing|storefront   forces the surface
 *   - ?tenant=<slug>                  forces the storefront tenant slug
 *   - VITE_DEFAULT_TENANT_SLUG        default storefront slug when none derivable
 */

export type Surface = "marketing" | "storefront";

/** Hostnames (and suffixes) that render the Zolto marketing surface. */
const MARKETING_HOSTS = new Set(["zolto.ch", "www.zolto.ch"]);

/** The platform apex domain — subdomains of it map to tenant slugs. */
const PLATFORM_APEX = "zolto.ch";

const DEV_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", ""]);

export function isDevHost(hostname: string): boolean {
  const host = hostname.split(":")[0].toLowerCase();
  return DEV_HOSTS.has(host) || host.endsWith(".local");
}

/**
 * Derive the tenant slug from a storefront hostname.
 * `kalakosh.zolto.ch` → "kalakosh". Custom domains (kalakosh.ch) and the apex
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
    // Only the left-most label is the slug (kalakosh.foo.zolto.ch → "kalakosh").
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
}

export function resolveSurface({
  hostname,
  search = "",
  defaultTenantSlug = "demo",
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
  return {
    surface: "storefront",
    tenantSlug:
      tenantSlugFromHost(hostname) || forcedTenant || defaultTenantSlug,
  };
}
