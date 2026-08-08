import type { Request } from "express";
import type { Tenant } from "../drizzle/schema";
import { getTenantBySlug, getTenantByCustomDomain } from "./db";
import { getPlatformRootDomain, isPlatformHost } from "./_core/platformDomain";

/**
 * Subdomains of the platform root that are infrastructure, never tenant slugs.
 * Same list the client's surface resolver uses (client/src/lib/surface.ts) —
 * `app` in particular is PLATFORM_DOMAIN, the CNAME target custom domains
 * point at, so it must never resolve to a store that registered that slug.
 */
const RESERVED_LABELS = new Set(["www", "app", "api"]);

/**
 * Resolve the tenant for a hostname (and optional X-Tenant-Slug header).
 *
 * The single implementation behind both entry points — the tRPC context
 * (server/_core/context.ts) and plain Express routes (SEO, llms.txt, MCP) —
 * so the two can't drift apart on which host serves which store.
 *
 * Order:
 *   1. `X-Tenant-Slug` header (POS apps, API clients, the storefront SPA).
 *   2. A subdomain of the platform root domain → its left-most label is a slug
 *      (blah.zolto.ch → "blah"). The apex and reserved labels resolve to null:
 *      that's the platform surface, not a store.
 *   3. Any other hostname → a registered custom domain (shop.example.com).
 *   4. No fallback — an unknown host resolves to null. Zolto is a fresh
 *      product, not Kalakosh; Kalakosh remains separate on kalakosh.ch.
 *
 * Steps 2 and 3 are mutually exclusive, and deliberately so. Resolution used to
 * try the left-most label against `tenants.slug` for EVERY host, which made
 * `shop.example.com` resolve to whichever store had the slug "shop" — a custom
 * domain silently serving another merchant's catalogue. A host under the
 * platform root is only ever a slug; a host outside it is only ever a custom
 * domain.
 *
 * When no platform root is configured (local dev, or a by-IP deploy where
 * PUBLIC_BASE_URL/SITE_DOMAIN aren't set), there is no root to test against, so
 * the left-most label is still tried after the custom-domain lookup — that's
 * what makes `blah.localhost:5173` work.
 */
export async function resolveTenantForHost(
  host: string,
  headerSlug?: string | null,
): Promise<Tenant | null> {
  if (headerSlug) {
    const tenant = await getTenantBySlug(headerSlug);
    if (tenant) return tenant;
  }

  const hostname = (host || "").split(":")[0].toLowerCase();
  if (!hostname) return null;

  const root = getPlatformRootDomain();
  if (root && isPlatformHost(hostname, root)) {
    if (hostname === root) return null; // the platform apex itself
    const label = hostname.slice(0, -(root.length + 1)).split(".")[0];
    if (!label || RESERVED_LABELS.has(label)) return null;
    return (await getTenantBySlug(label)) ?? null;
  }

  const byDomain = await getTenantByCustomDomain(hostname);
  if (byDomain) return byDomain;

  if (!root) {
    const label = hostname.split(".")[0];
    if (label && !RESERVED_LABELS.has(label)) {
      return (await getTenantBySlug(label)) ?? null;
    }
  }

  return null;
}

/**
 * Resolve the tenant for a plain Express request (not tRPC). Used by the
 * SEO/LLM and MCP routes, which run outside the tRPC pipeline.
 */
export async function resolveTenantFromRequest(
  req: Request,
): Promise<Tenant | null> {
  try {
    const headerSlug = req.headers["x-tenant-slug"];
    const slug = Array.isArray(headerSlug) ? headerSlug[0] : headerSlug;
    return await resolveTenantForHost(req.headers.host || "", slug ?? null);
  } catch {
    return null;
  }
}
