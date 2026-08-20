import {
  type StorefrontIdentity,
  type ProductSeo,
  storeJsonLd,
  websiteJsonLd,
  breadcrumbJsonLd,
  shopCollectionJsonLd,
  productJsonLd,
  attributionJsonLd,
  isInStock,
} from "@shared/storefront";
import { normalizeBaseUrl } from "@shared/marketing";
import { platformCreditSentence } from "@shared/attribution";
import { BRAND } from "@shared/brand";
import {
  escapeHtml,
  setMetaContent,
  setTitle,
  appendToHead,
  appendAfterRoot,
  renderJsonLd,
} from "./headInject";

/**
 * Server-side SEO for tenant storefronts — the counterpart to
 * server/marketingSeo.ts, and for the same reason: most AI crawlers (GPTBot,
 * OAI-SearchBot, ClaudeBot, PerplexityBot, …) do not execute JavaScript, so the
 * Product JSON-LD that client/src/pages/ProductDetail.tsx renders inside React is
 * invisible to them. Storefront homepages and product pages are where the
 * majority of AI referral traffic lands, so they need real HTML.
 *
 * This module only *builds* strings; the tenant and catalogue lookups happen in
 * server/htmlHead.ts, which keeps everything here pure and unit-testable.
 */

export interface StorefrontSeo {
  title: string;
  description: string;
  /** Canonical path on the storefront's own origin. */
  path: string;
  jsonLd: Record<string, unknown>[];
  /** Plain-text body served to non-JS crawlers. */
  noscript: string;
}

export interface StorefrontSeoData {
  identity: StorefrontIdentity;
  /** The store's visible catalogue — used for `/` and `/shop`. */
  products: ProductSeo[];
  /** The product for a `/product/:id` request, if it resolved. */
  product?: ProductSeo | null;
}

/**
 * Map a `products` row onto the shared SEO shape. Prefers the English
 * name/description the same way server/llms.ts does — AI consumers read English
 * far more reliably than a merchant's primary locale, and the fallback keeps
 * stores that never translated their catalogue intact.
 */
export function toProductSeo(p: {
  id: number;
  name: string;
  nameEn?: string | null;
  description: string;
  descriptionEn?: string | null;
  price: string | number;
  category: string;
  imageUrl?: string | null;
  sold: boolean;
  quantity: number;
}): ProductSeo {
  return {
    id: p.id,
    name: p.nameEn?.trim() || p.name,
    description: p.descriptionEn?.trim() || p.description,
    price: p.price,
    category: p.category,
    images: p.imageUrl ? [p.imageUrl] : [],
    sold: p.sold,
    quantity: p.quantity,
  };
}

/** Parse `/product/123` → 123. Returns null for any other path. */
export function parseProductPath(path: string): number | null {
  const m = /^\/product\/(\d+)$/.exec(path);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizePath(path: string): string {
  return path.split("?")[0].replace(/\/+$/, "") || "/";
}

function categorySummary(products: ProductSeo[]): string {
  const counts = new Map<string, number>();
  for (const p of products.filter(isInStock)) {
    counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
  }
  if (counts.size === 0) return "";
  return Array.from(counts.entries())
    .map(([cat, n]) => `${cat} (${n})`)
    .join(", ");
}

function priceLine(p: ProductSeo, currency: string): string {
  const status = isInStock(p) ? "" : " — sold";
  return `${p.name}: ${currency.toUpperCase()} ${Number(p.price).toFixed(2)}${status}`;
}

/**
 * Resolve SEO for a storefront path, or `null` when the path isn't a public
 * storefront route (checkout, admin, …) — in which case the HTML is served with
 * branding only.
 */
export function getStorefrontSeo(
  path: string,
  data: StorefrontSeoData,
): StorefrontSeo | null {
  const clean = normalizePath(path);
  const { identity, products } = data;
  const store = identity.storeName;
  const currency = identity.currency;
  const base = normalizeBaseUrl(identity.baseUrl);

  const common = [
    storeJsonLd(identity),
    websiteJsonLd(identity),
    ...attributionJsonLd(identity),
  ];
  const inStock = products.filter(isInStock);

  const productId = parseProductPath(clean);
  if (productId !== null) {
    const p = data.product;
    // Unknown/hidden product: no SEO rather than a page claiming to exist.
    if (!p || p.id !== productId) return null;
    const availability = isInStock(p) ? "Available" : "Sold";
    return {
      path: clean,
      title: `${p.name} — ${store}`,
      description:
        `${p.name} — ${currency.toUpperCase()} ${Number(p.price).toFixed(2)}. ${p.description}`.slice(
          0,
          300,
        ),
      jsonLd: [
        ...common,
        productJsonLd(p, identity),
        breadcrumbJsonLd(base, [
          ["Home", "/"],
          ["Shop", "/shop"],
          [p.name, clean],
        ]),
      ],
      noscript: `${p.name} — ${currency.toUpperCase()} ${Number(p.price).toFixed(2)} (${availability}). Category: ${p.category}. ${p.description}`,
    };
  }

  switch (clean) {
    case "/": {
      const cats = categorySummary(products);
      const desc =
        identity.description?.trim() ||
        `${store} — handcrafted items, available online and in person. ${inStock.length} item(s) currently available.`;
      return {
        path: "/",
        title: store,
        description: desc,
        jsonLd: common,
        noscript: `${desc}${cats ? ` Categories: ${cats}.` : ""} Browse the full catalogue at ${base}/shop.`,
      };
    }
    case "/shop": {
      const cats = categorySummary(products);
      return {
        path: "/shop",
        title: `Shop — ${store}`,
        description: `Browse all ${inStock.length} item(s) available from ${store}.${cats ? ` Categories: ${cats}.` : ""}`,
        jsonLd: [
          ...common,
          shopCollectionJsonLd(products, identity),
          breadcrumbJsonLd(base, [
            ["Home", "/"],
            ["Shop", "/shop"],
          ]),
        ],
        noscript:
          inStock.length === 0
            ? `${store} has no items in stock right now.`
            : `Available from ${store}: ${inStock
                .slice(0, 50)
                .map((p) => priceLine(p, currency))
                .join("; ")}.`,
      };
    }
    case "/about":
      return {
        path: "/about",
        title: `About — ${store}`,
        description: `About ${store} — who we are and what we make.`,
        jsonLd: [
          ...common,
          {
            "@type": "AboutPage",
            name: `About ${store}`,
            url: `${base}/about`,
            isPartOf: { "@id": `${base}/#website` },
          },
          breadcrumbJsonLd(base, [
            ["Home", "/"],
            ["About", "/about"],
          ]),
        ],
        noscript: `About ${store}.`,
      };
    case "/contact":
      return {
        path: "/contact",
        title: `Contact — ${store}`,
        description: `Get in touch with ${store}.`,
        jsonLd: [
          ...common,
          {
            "@type": "ContactPage",
            name: `Contact ${store}`,
            url: `${base}/contact`,
            isPartOf: { "@id": `${base}/#website` },
          },
          breadcrumbJsonLd(base, [
            ["Home", "/"],
            ["Contact", "/contact"],
          ]),
        ],
        noscript: `Contact ${store}.`,
      };
    case "/faq":
      return {
        path: "/faq",
        title: `FAQ — ${store}`,
        description: `Frequently asked questions about ordering, shipping and returns from ${store}.`,
        jsonLd: [
          ...common,
          breadcrumbJsonLd(base, [
            ["Home", "/"],
            ["FAQ", "/faq"],
          ]),
        ],
        noscript: `Frequently asked questions about ordering from ${store}.`,
      };
    default:
      return null;
  }
}

/**
 * Inject storefront SEO into the served index.html. A no-op for non-public
 * routes, so checkout and admin are untouched.
 */
export function injectStorefrontSeo(
  html: string,
  path: string,
  data: StorefrontSeoData,
): string {
  const seo = getStorefrontSeo(path, data);
  if (!seo) return html;

  const base = normalizeBaseUrl(data.identity.baseUrl);
  const canonical = `${base}${seo.path === "/" ? "/" : seo.path}`;

  let out = html;
  out = setTitle(out, seo.title);
  out = setMetaContent(out, "name", "description", seo.description);
  out = setMetaContent(out, "property", "og:title", seo.title);
  out = setMetaContent(out, "property", "og:description", seo.description);
  out = setMetaContent(out, "property", "twitter:title", seo.title);
  out = setMetaContent(out, "property", "twitter:description", seo.description);

  out = appendToHead(
    out,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />` +
      `<meta property="og:url" content="${escapeHtml(canonical)}" />` +
      renderJsonLd(seo.jsonLd),
  );

  // The credit, as real markup a non-JS crawler can read and follow. The
  // React footer renders the same line for everyone else — this is the copy
  // that reaches the AI crawlers, which are the ones that never run our JS.
  const credit =
    data.identity.attribution === false
      ? ""
      : `<p>${escapeHtml(platformCreditSentence(data.identity.storeName))} ` +
        `<a href="${BRAND.url}/">${escapeHtml(BRAND.url)}</a></p>`;

  out = appendAfterRoot(
    out,
    `<noscript><h1>${escapeHtml(seo.title)}</h1><p>${escapeHtml(seo.noscript)}</p>` +
      `<p><a href="${base}/shop">Shop</a> · <a href="${base}/llms.txt">llms.txt</a></p>` +
      `${credit}</noscript>`,
  );

  return out;
}
