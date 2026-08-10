/**
 * Storefront SEO primitives — the single source of truth for the structured data
 * a tenant storefront publishes, shared by the client (React pages) and the
 * server (crawler-facing <head> injection, sitemap).
 *
 * Why shared: AI crawlers (GPTBot, ClaudeBot, PerplexityBot, …) largely do not
 * execute JavaScript, so JSON-LD rendered only by React is invisible to them —
 * the same reasoning that produced server/marketingSeo.ts for the marketing
 * surface. The server injects these nodes into the served HTML; the client
 * renders the identical nodes for JS-capable clients. Keeping both on one
 * builder is what stops the two representations from drifting apart.
 *
 * Pure string/object transforms — unit-testable without a browser or a database.
 */

import { normalizeBaseUrl } from "./marketing";
import { zoltoCreatorJsonLd, zoltoCreatorRef } from "./attribution";

/** Who the store is, as far as structured data is concerned. */
export interface StorefrontIdentity {
  storeName: string;
  /** Absolute origin for this storefront, e.g. "https://aurora.zolto.ch". */
  baseUrl: string;
  /** ISO 4217 code, any case — normalized to upper case on output. */
  currency: string;
  description?: string | null;
  logoUrl?: string | null;
  /**
   * Whether this store carries the "Made with Zolto" credit — from
   * shared/attribution.ts `showsZoltoAttribution`, not from the plan directly.
   * Defaults to true when absent, so a caller that hasn't been taught about
   * white-labelling credits the platform rather than silently dropping it.
   */
  attribution?: boolean;
}

/** Does this identity carry the platform credit? Absent means yes. */
function credited(identity: StorefrontIdentity): boolean {
  return identity.attribution !== false;
}

/**
 * The product fields structured data needs. A subset of the `products` row, so
 * the client can build this from its own query shape and the server from a
 * Drizzle row without either depending on the other.
 */
export interface ProductSeo {
  id: number;
  name: string;
  description: string;
  price: string | number;
  category: string;
  images: string[];
  sold: boolean;
  quantity: number;
}

export function storefrontProductPath(id: number): string {
  return `/product/${id}`;
}

export function storefrontProductUrl(baseUrl: string, id: number): string {
  return `${normalizeBaseUrl(baseUrl)}${storefrontProductPath(id)}`;
}

/**
 * Whether a piece is actually purchasable. Mirrors the catalogue filter in
 * server/llms.ts so the schema, the LLM brief, and the shop never disagree
 * about what's available.
 */
export function isInStock(p: Pick<ProductSeo, "sold" | "quantity">): boolean {
  return !p.sold && p.quantity > 0;
}

function currencyCode(currency: string): string {
  return (currency || "chf").toUpperCase();
}

function formatPrice(price: string | number): string {
  return Number(price).toFixed(2);
}

/**
 * schema.org/Product for a single piece, with its Offer.
 *
 * Deliberately omits `shippingDetails`: rates are order- and destination-
 * dependent (free over CHF 50 within CH, flat CHF 8 below, CHF 15 to the EU —
 * see server/checkoutSession.ts), and a single flat node can only misstate them.
 * No claim beats a wrong claim in structured data.
 */
export function productJsonLd(
  p: ProductSeo,
  identity: StorefrontIdentity,
): Record<string, unknown> {
  const base = normalizeBaseUrl(identity.baseUrl);
  return {
    "@type": "Product",
    "@id": `${storefrontProductUrl(base, p.id)}#product`,
    name: p.name,
    description: p.description,
    ...(p.images.length > 0 ? { image: p.images } : {}),
    sku: `SKU-${p.id}`,
    category: p.category,
    brand: { "@type": "Brand", name: identity.storeName },
    offers: {
      "@type": "Offer",
      url: storefrontProductUrl(base, p.id),
      priceCurrency: currencyCode(identity.currency),
      price: formatPrice(p.price),
      availability: isInStock(p)
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${base}/#store` },
    },
  };
}

/**
 * schema.org/Store for the storefront itself — the identity node every other
 * node points at. Storefront homepages are the single largest AI-traffic
 * destination, and until now they published no structured identity at all.
 */
export function storeJsonLd(
  identity: StorefrontIdentity,
): Record<string, unknown> {
  const base = normalizeBaseUrl(identity.baseUrl);
  return {
    "@type": "Store",
    "@id": `${base}/#store`,
    name: identity.storeName,
    url: `${base}/`,
    ...(identity.description ? { description: identity.description } : {}),
    ...(identity.logoUrl
      ? { logo: { "@type": "ImageObject", url: identity.logoUrl } }
      : {}),
    currenciesAccepted: currencyCode(identity.currency),
  };
}

/**
 * schema.org/WebSite for the storefront.
 *
 * `creator` is the machine-readable half of the "Made with Zolto" credit: the
 * store is the *publisher* of its own site, Zolto is what *built* it. An AI
 * crawler that reads this graph on a merchant's own domain learns the platform
 * behind it and gets a resolvable `@id` to follow — which the footer link alone
 * cannot give it, since most such crawlers never run our JavaScript.
 */
export function websiteJsonLd(
  identity: StorefrontIdentity,
): Record<string, unknown> {
  const base = normalizeBaseUrl(identity.baseUrl);
  return {
    "@type": "WebSite",
    "@id": `${base}/#website`,
    url: `${base}/`,
    name: identity.storeName,
    publisher: { "@id": `${base}/#store` },
    ...(credited(identity) ? { creator: zoltoCreatorRef() } : {}),
  };
}

/**
 * The graph nodes a credited storefront adds on top of its own: the Zolto
 * Organization that `websiteJsonLd`'s `creator` points at. Empty for a
 * white-labelled store that has opted out, so its graph names no platform at
 * all rather than naming one with a dangling reference.
 */
export function attributionJsonLd(
  identity: StorefrontIdentity,
): Record<string, unknown>[] {
  return credited(identity) ? [zoltoCreatorJsonLd()] : [];
}

export function breadcrumbJsonLd(
  baseUrl: string,
  trail: [string, string][],
): Record<string, unknown> {
  const base = normalizeBaseUrl(baseUrl);
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map(([name, path], i) => ({
      "@type": "ListItem",
      position: i + 1,
      name,
      item: `${base}${path}`,
    })),
  };
}

/** How many products to enumerate in the /shop ItemList before truncating. */
const MAX_LISTED = 50;

/** schema.org/CollectionPage + ItemList for the shop index. */
export function shopCollectionJsonLd(
  products: ProductSeo[],
  identity: StorefrontIdentity,
): Record<string, unknown> {
  const base = normalizeBaseUrl(identity.baseUrl);
  const inStock = products.filter(isInStock);
  return {
    "@type": "CollectionPage",
    "@id": `${base}/shop#collection`,
    name: `Shop — ${identity.storeName}`,
    url: `${base}/shop`,
    isPartOf: { "@id": `${base}/#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: inStock.length,
      itemListElement: inStock.slice(0, MAX_LISTED).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: p.name,
        url: storefrontProductUrl(base, p.id),
      })),
    },
  };
}

// ── Sitemap / robots ──────────────────────────────────────────────────────────

/** Static storefront routes worth indexing, with their sitemap weights. */
const STATIC_STOREFRONT_ROUTES: {
  path: string;
  changefreq: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}[] = [
  { path: "/", changefreq: "daily", priority: 1.0 },
  { path: "/shop", changefreq: "daily", priority: 0.9 },
  { path: "/about", changefreq: "monthly", priority: 0.6 },
  { path: "/faq", changefreq: "monthly", priority: 0.6 },
  { path: "/contact", changefreq: "monthly", priority: 0.5 },
  { path: "/policy", changefreq: "yearly", priority: 0.2 },
  { path: "/impressum", changefreq: "yearly", priority: 0.2 },
];

/**
 * Storefront routes that must never be indexed — cart/checkout funnels have no
 * standalone content and only burn crawl budget.
 */
export const STOREFRONT_NOINDEX_PATHS = ["/checkout", "/admin", "/claim-staff"];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * A storefront's own sitemap.xml: its static pages plus a URL for every visible,
 * in-stock product. Previously a storefront served the *marketing* sitemap,
 * advertising /pricing and /blog — URLs that 404 on a store's host.
 */
export function renderStorefrontSitemapXml(
  baseUrl: string,
  products: (ProductSeo & { updatedAt?: Date | null })[],
): string {
  const base = normalizeBaseUrl(baseUrl);
  const today = isoDate(new Date());

  const staticUrls = STATIC_STOREFRONT_ROUTES.map((r) => ({
    loc: `${base}${r.path === "/" ? "/" : r.path}`,
    lastmod: today,
    changefreq: r.changefreq,
    priority: r.priority,
  }));

  const productUrls = products.filter(isInStock).map((p) => ({
    loc: storefrontProductUrl(base, p.id),
    lastmod: p.updatedAt ? isoDate(p.updatedAt) : today,
    changefreq: "weekly" as const,
    priority: 0.8,
  }));

  const urls = [...staticUrls, ...productUrls]
    .map((u) =>
      [
        "  <url>",
        `    <loc>${u.loc}</loc>`,
        `    <lastmod>${u.lastmod}</lastmod>`,
        `    <changefreq>${u.changefreq}</changefreq>`,
        `    <priority>${u.priority.toFixed(1)}</priority>`,
        "  </url>",
      ].join("\n"),
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
