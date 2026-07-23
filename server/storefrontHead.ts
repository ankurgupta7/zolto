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

export interface StorefrontBranding {
  storeName: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

/** Replace a meta tag's content by name/property (no-op if the tag is absent). */
function setMetaContent(
  html: string,
  attr: "name" | "property",
  key: string,
  value: string,
): string {
  const re = new RegExp(
    `(<meta\\s+${attr}=["']${key}["']\\s+content=["'])[^"']*(["'])`,
    "i",
  );
  return html.replace(re, `$1${escapeHtml(value)}$2`);
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
  out = out.replace(
    /<\/head>/i,
    `<link rel="icon" href="${escapeHtml(faviconHref)}" /></head>`,
  );

  // Tab title + OG identity.
  const title = (b.metaTitle && b.metaTitle.trim()) || b.storeName;
  out = out.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(title)}</title>`,
  );
  out = setMetaContent(out, "property", "og:title", title);
  out = setMetaContent(out, "property", "twitter:title", title);
  out = setMetaContent(out, "property", "og:site_name", b.storeName);
  if (b.metaDescription && b.metaDescription.trim()) {
    const d = b.metaDescription.trim();
    out = setMetaContent(out, "name", "description", d);
    out = setMetaContent(out, "property", "og:description", d);
    out = setMetaContent(out, "property", "twitter:description", d);
  }

  return out;
}
