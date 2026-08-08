/**
 * Per-tenant <head> injection for storefront requests. A storefront is served
 * from the same shared index.html as the Zolto marketing site, so without this
 * every store would show Zolto's favicon and "Zolto" tab title. This rewrites the
 * served HTML per tenant: the store's own favicon (uploaded, or a generated
 * initial-mark in its brand colour) and its own tab title / OG identity.
 *
 * All tenant-supplied values are escaped before injection (a store owner controls
 * these), and favicon URLs are restricted to http(s)/data-image to block
 * javascript: and other unsafe schemes.
 */

import {
  escapeHtml,
  setMetaContent,
  setTitle,
  appendToHead,
} from "./headInject";

export interface StorefrontBranding {
  storeName: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  /**
   * The slug of the store this host serves, stamped into the shell as
   * `<meta name="zolto-tenant-slug">`. The client can derive the slug itself
   * from a platform subdomain, but not from a custom domain — only the server
   * knows that shop.example.com is "aurora". Without it the SPA fell back to
   * VITE_DEFAULT_TENANT_SLUG on every custom domain and asked the API for the
   * wrong store (see client/src/lib/surface.ts).
   */
  tenantSlug?: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Only allow image URLs we're comfortable putting in a favicon href. */
export function isSafeImageUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return (
    u.startsWith("https://") ||
    u.startsWith("http://") ||
    u.startsWith("data:image/")
  );
}

/**
 * A generated favicon (data-URI SVG) for a store with no uploaded icon: a rounded
 * square in the brand colour with the store's initial. Keeps storefronts
 * off-Zolto even before they upload a logo.
 */
export function tenantFaviconDataUri(
  storeName: string,
  primaryColor?: string | null,
): string {
  const color =
    primaryColor && HEX.test(primaryColor) ? primaryColor : "#2d2620";
  const initial = (storeName.trim()[0] || "•").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="38" fill="#f8f6f2">${escapeHtml(initial)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Rewrite the served HTML for a storefront: swap Zolto's favicon + tab identity
 * for the tenant's. Returns the html unchanged if there's nothing to brand.
 */
export function injectStorefrontHead(
  html: string,
  b: StorefrontBranding,
): string {
  const faviconHref =
    b.faviconUrl && isSafeImageUrl(b.faviconUrl)
      ? b.faviconUrl
      : tenantFaviconDataUri(b.storeName, b.primaryColor);

  let out = html;

  // Remove Zolto's favicon/apple-touch links so its icon can't win.
  out = out.replace(
    /\s*<link\s+rel=["'](?:icon|apple-touch-icon)["'][^>]*>/gi,
    "",
  );
  // Inject the tenant favicon.
  out = appendToHead(
    out,
    `<link rel="icon" href="${escapeHtml(faviconHref)}" />`,
  );

  // Which store this host serves, for the SPA's surface resolver.
  if (b.tenantSlug?.trim()) {
    out = appendToHead(
      out,
      `<meta name="zolto-tenant-slug" content="${escapeHtml(b.tenantSlug.trim())}" />`,
    );
  }

  // Tab title + OG identity.
  const title = b.metaTitle?.trim() || b.storeName;
  out = setTitle(out, title);
  out = setMetaContent(out, "property", "og:title", title);
  out = setMetaContent(out, "property", "twitter:title", title);
  out = setMetaContent(out, "property", "og:site_name", b.storeName);
  if (b.metaDescription?.trim()) {
    const d = b.metaDescription.trim();
    out = setMetaContent(out, "name", "description", d);
    out = setMetaContent(out, "property", "og:description", d);
    out = setMetaContent(out, "property", "twitter:description", d);
  }

  return out;
}
