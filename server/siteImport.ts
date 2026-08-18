/**
 * Read a merchant's existing shop and turn it into something importable.
 *
 * This is the extraction half of the paid switch-in import (shared/platform.ts
 * SITE_IMPORT). A merchant who already sells somewhere has typed their whole
 * catalogue in once; the premise of Zolto is that they never do it again, and
 * the CSV/Stripe importers (server/providerMigration.ts) already cover the
 * cases where the old platform will hand over a file. This covers the case that
 * is actually most common for a small maker: there is no export, there is just
 * a website.
 *
 * Deliberately pure — no network, no db, no LLM. Everything here takes HTML in
 * and gives structured data out, which is what makes a crawler over hostile
 * input testable at all. Fetching lives in server/siteCrawler.ts.
 *
 * Extraction is layered by how much the source actually promises:
 *
 *   1. JSON-LD (schema.org Product / Offer / LocalBusiness). Shopify,
 *      WooCommerce, Squarespace and Wix all emit it, it is machine-authored,
 *      and it carries price, currency, availability and stock. Trusted first.
 *   2. OpenGraph / meta tags. Present on nearly every product page even when
 *      JSON-LD isn't, but only ever describes ONE product — the page you're on.
 *   3. Nothing. A shop that renders its catalogue purely client-side yields
 *      nothing here, and the honest answer is to say so (SITE_IMPORT.caveat)
 *      rather than to guess at prices from stray numbers in the markup.
 *
 * No HTML parser is used on purpose: jsdom is a devDependency (test-only), and
 * pulling a DOM into the server bundle to read a handful of script and meta tags
 * is not worth it. The regexes below are scoped to exactly those tags.
 */

import { parseSwissAmount } from "./providerMigration";

// ─── Shapes ───────────────────────────────────────────────────────────────────

/**
 * One product recovered from the source site. Mirrors MigrationRow in
 * server/providerMigration.ts so both importers converge on the same reviewed
 * preview → products.csvImport path, but adds where it came from so the preview
 * can link a row back to the page it was read off.
 */
export interface ExtractedProduct {
  name: string;
  description: string;
  /** null when the page stated no readable price — the merchant fills it in. */
  price: number | null;
  /** Uppercase ISO code as the source stated it, e.g. "CHF". */
  currency?: string;
  /** Stock. Defaults to 1 in stock / 0 when the source says sold out. */
  quantity: number;
  imageUrl?: string;
  /** The source's own category text, mapped to store categories client-side. */
  rawCategory: string;
  sourceUrl: string;
}

/** Shop-level details worth carrying over, so the merchant re-types nothing. */
export interface ExtractedProfile {
  storeName?: string;
  about?: string;
  email?: string;
  phone?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  /** Free text, as the source wrote it ("Mo–Fr 09:00–18:00"). */
  openingHours?: string;
  logoUrl?: string;
  /** The site's own brand colour, as `#rrggbb`. See themeColorFromHtml. */
  primaryColor?: string;
}

export interface PageExtraction {
  products: ExtractedProduct[];
  profile: ExtractedProfile;
  categories: string[];
  /** Same-origin links worth crawling next. */
  links: string[];
}

export interface SiteExtraction {
  products: ExtractedProduct[];
  profile: ExtractedProfile;
  categories: string[];
  /** Merchant-facing notes: what we could not read, and what we guessed. */
  warnings: string[];
}

// ─── Low-level HTML scraping ──────────────────────────────────────────────────

/** Decode the handful of entities that actually show up in titles and prices. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
      const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
        nbsp: " ",
        eacute: "é",
        egrave: "è",
        agrave: "à",
        uuml: "ü",
        ouml: "ö",
        auml: "ä",
      };
      return named[code.toLowerCase()] ?? m;
    })
    .replace(/ /g, " ");
}

/** Strip tags and collapse whitespace — for turning a description block into text. */
export function htmlToText(html: string): string {
  return (
    decodeEntities(
      html
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/[ \t\f\v]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      // Tags become spaces so words don't fuse ("<b>a</b><b>b</b>" → "a b"), but
      // that leaves a gap before punctuation that closed a tag ("safe</b>." →
      // "safe ."). Close it back up.
      .replace(/ +([.,;:!?%)\]])/g, "$1")
      .replace(/([([]) +/g, "$1")
      .trim()
  );
}

/** Every `<script type="application/ld+json">` payload, parsed and flattened. */
export function parseJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re =
    /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of Array.from(html.matchAll(re))) {
    const raw = match[1].trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Some CMSes emit trailing commas or wrap in CDATA. One cheap repair pass,
      // then give up — a malformed block is not worth a parser.
      try {
        parsed = JSON.parse(
          raw
            .replace(/^\s*<!\[CDATA\[/, "")
            .replace(/\]\]>\s*$/, "")
            .replace(/,\s*([}\]])/g, "$1"),
        );
      } catch {
        continue;
      }
    }
    // A block may be a node, an array of nodes, or a @graph envelope.
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const graph = (node as { "@graph"?: unknown })["@graph"];
      if (Array.isArray(graph)) {
        queue.push(...graph);
        continue;
      }
      out.push(node);
    }
  }
  return out;
}

/** `<meta name=… content=…>` and `<meta property=… content=…>`, lowercased keys. */
export function parseMetaTags(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of Array.from(html.matchAll(/<meta\b[^>]*>/gi))) {
    const el = tag[0];
    const key = /(?:property|name)\s*=\s*["']([^"']+)["']/i
      .exec(el)?.[1]
      ?.toLowerCase();
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(el)?.[1];
    if (key && content && !out.has(key)) out.set(key, decodeEntities(content));
  }
  return out;
}

/** Absolute, same-origin `href`s — the crawl frontier. */
export function sameOriginLinks(html: string, pageUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  const seen = new Set<string>();
  // The fragment is captured rather than excluded — excluding "#" made an
  // href like "/products/bowl#top" fail to match at all, silently dropping
  // every anchored link on the site. It is stripped after parsing instead.
  for (const m of Array.from(
    html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi),
  )) {
    let abs: URL;
    try {
      abs = new URL(decodeEntities(m[1]), pageUrl);
    } catch {
      continue;
    }
    if (abs.origin !== origin) continue;
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = "";
    seen.add(abs.toString());
  }
  return Array.from(seen);
}

/**
 * Does this URL look like a product or a collection page?
 *
 * Used only to ORDER the crawl, never to exclude — a shop with an unusual URL
 * scheme still gets crawled, it just gets read later. Covers the paths the big
 * platforms actually mint.
 */
export function looksLikeCatalogueUrl(url: string): boolean {
  return /\/(products?|shop|store|collections?|catalog(ue)?|artikel|produkte?|boutique|produit|prodotti|negozio|item)(\/|$|\?)/i.test(
    url,
  );
}

// ─── schema.org ───────────────────────────────────────────────────────────────

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function nodeTypes(node: unknown): string[] {
  const t = (node as { "@type"?: unknown })?.["@type"];
  return asArray(t as string | string[]).map((s) => String(s).toLowerCase());
}

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim() || undefined;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const item of v) {
      const s = firstString(item);
      if (s) return s;
    }
    return undefined;
  }
  if (v && typeof v === "object") {
    // { "@value": … } / { url: … } / { name: … } wrappers.
    const o = v as Record<string, unknown>;
    return firstString(o["@value"] ?? o.url ?? o.name ?? o.contentUrl);
  }
  return undefined;
}

function absolutize(
  raw: string | undefined,
  pageUrl: string,
): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return undefined;
  }
}

/**
 * Stock from a schema.org Offer.
 *
 * `inventoryLevel` is exact when present. Otherwise availability is a
 * two-state signal, and 1 is the honest default for "in stock but unstated" —
 * a maker's site rarely publishes counts, and starting at 1 means the first
 * sale is possible while an obviously wrong 999 is not.
 */
export function stockFromOffer(offer: Record<string, unknown>): number {
  const level = firstString(offer.inventoryLevel);
  if (level !== undefined) {
    const n = Number.parseInt(level.replace(/[^\d-]/g, ""), 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  const availability = (firstString(offer.availability) ?? "").toLowerCase();
  if (!availability) return 1;
  if (/(outofstock|soldout|discontinued)/.test(availability)) return 0;
  return 1;
}

/** Pull every Product node out of a page's JSON-LD. */
export function productsFromJsonLd(
  nodes: unknown[],
  pageUrl: string,
): ExtractedProduct[] {
  const out: ExtractedProduct[] = [];
  for (const node of nodes) {
    if (!nodeTypes(node).includes("product")) continue;
    const p = node as Record<string, unknown>;
    const name = firstString(p.name);
    if (!name) continue;

    // An offer may be a single node, a list, or an AggregateOffer envelope.
    const offers = asArray(p.offers as unknown[] | unknown)
      .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
      .flatMap((o) =>
        nodeTypes(o).includes("aggregateoffer")
          ? asArray(o.offers as unknown[] | unknown).filter(
              (x): x is Record<string, unknown> => !!x && typeof x === "object",
            )
          : [o],
      );
    const offer = offers[0];

    const rawPrice =
      firstString(offer?.price) ??
      firstString(offer?.lowPrice) ??
      firstString((p.offers as Record<string, unknown>)?.lowPrice);
    const price = rawPrice ? parseSwissAmount(rawPrice) : null;
    const currency = (
      firstString(offer?.priceCurrency) ?? firstString(p.priceCurrency)
    )
      ?.toUpperCase()
      .slice(0, 3);

    out.push({
      name: decodeEntities(name).slice(0, 200),
      description: htmlToText(firstString(p.description) ?? "").slice(0, 4000),
      price,
      currency,
      quantity: offer ? stockFromOffer(offer) : 1,
      imageUrl: absolutize(firstString(p.image), pageUrl),
      rawCategory: decodeEntities(firstString(p.category) ?? "").slice(0, 120),
      sourceUrl: absolutize(firstString(p.url), pageUrl) ?? pageUrl,
    });
  }
  return out;
}

/** Shop details from LocalBusiness / Organization / Store nodes. */
export function profileFromJsonLd(
  nodes: unknown[],
  pageUrl: string,
): ExtractedProfile {
  const profile: ExtractedProfile = {};
  for (const node of nodes) {
    const types = nodeTypes(node);
    const isBusiness = types.some((t) =>
      /(localbusiness|organization|store|shop|website)/.test(t),
    );
    if (!isBusiness) continue;
    const n = node as Record<string, unknown>;

    profile.storeName ??= firstString(n.name);
    profile.about ??= htmlToText(firstString(n.description) ?? "") || undefined;
    profile.email ??= firstString(n.email)?.replace(/^mailto:/i, "");
    profile.phone ??= firstString(n.telephone);
    profile.logoUrl ??= absolutize(firstString(n.logo), pageUrl);

    const address = n.address;
    if (address && typeof address === "object") {
      const a = address as Record<string, unknown>;
      profile.addressLine ??= firstString(a.streetAddress);
      profile.postalCode ??= firstString(a.postalCode);
      profile.city ??= firstString(a.addressLocality);
    }

    const hours = asArray(n.openingHours as string | string[])
      .map((h) => firstString(h))
      .filter((h): h is string => !!h);
    if (hours.length && !profile.openingHours) {
      profile.openingHours = hours.join("; ").slice(0, 255);
    }
  }
  return profile;
}

// ─── Meta-tag fallback ────────────────────────────────────────────────────────

/**
 * The current page as a product, read from OpenGraph.
 *
 * Only trusted when the page declares itself a product (`og:type`) or states a
 * price — otherwise every "About us" page on the site would import as an item
 * priced at nothing.
 */
export function productFromMeta(
  meta: Map<string, string>,
  pageUrl: string,
): ExtractedProduct | null {
  const rawPrice =
    meta.get("product:price:amount") ??
    meta.get("og:price:amount") ??
    meta.get("twitter:data1");
  const type = (meta.get("og:type") ?? "").toLowerCase();
  const declaresProduct = type.includes("product");
  if (!declaresProduct && !rawPrice) return null;

  const name = meta.get("og:title") ?? meta.get("twitter:title");
  if (!name) return null;

  const availability = (
    meta.get("product:availability") ??
    meta.get("og:availability") ??
    ""
  ).toLowerCase();

  return {
    name: name.slice(0, 200),
    description: (
      meta.get("og:description") ??
      meta.get("description") ??
      ""
    ).slice(0, 4000),
    price: rawPrice ? parseSwissAmount(rawPrice) : null,
    currency: (
      meta.get("product:price:currency") ?? meta.get("og:price:currency")
    )
      ?.toUpperCase()
      .slice(0, 3),
    quantity: /(out\s*of\s*stock|oos|soldout|sold out)/.test(availability)
      ? 0
      : 1,
    imageUrl: absolutize(meta.get("og:image"), pageUrl),
    rawCategory: "",
    sourceUrl: pageUrl,
  };
}

/** Contact details from the page body, when neither JSON-LD nor meta had them. */
export function contactFromHtml(html: string): {
  email?: string;
  phone?: string;
} {
  const text = htmlToText(html);
  const email = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/.exec(
    // mailto: links are a far better signal than loose text.
    /href\s*=\s*["']mailto:([^"'?]+)/i.exec(html)?.[1] ?? text,
  )?.[0];
  const phone = /(?:href\s*=\s*["']tel:([^"']+))/i.exec(html)?.[1]?.trim();
  return {
    email: email?.toLowerCase(),
    phone: phone?.replace(/\s+/g, " "),
  };
}

/** The site's logo, from JSON-LD, then `<link rel="…icon">`, then og:image. */
export function logoFromHtml(
  html: string,
  meta: Map<string, string>,
  pageUrl: string,
): string | undefined {
  const rel =
    /<link\b[^>]*rel\s*=\s*["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]*>/i.exec(
      html,
    )?.[0];
  const relHref = rel
    ? /href\s*=\s*["']([^"']+)["']/i.exec(rel)?.[1]
    : undefined;
  return (
    absolutize(relHref, pageUrl) ?? absolutize(meta.get("og:image"), pageUrl)
  );
}

/**
 * The site's brand colour, from `<meta name="theme-color">` (or Microsoft's
 * older tile colour), normalised to `#rrggbb`.
 *
 * Deliberately only the declared colour, never a colour guessed by counting
 * hex codes in the stylesheet: the most frequent hex on a page is nearly
 * always a grey from the body text or a border, and importing that as a
 * merchant's brand would repaint their whole storefront the wrong colour on
 * their first day. Nothing found means nothing changes.
 */
export function themeColorFromHtml(
  meta: Map<string, string>,
): string | undefined {
  const raw = meta.get("theme-color") ?? meta.get("msapplication-tilecolor");
  if (!raw) return undefined;
  const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw.trim());
  if (!hex) return undefined;
  const value = hex[1].toLowerCase();
  // #abc and #aabbcc mean the same colour; tenant_settings stores the long form.
  return value.length === 3
    ? `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`
    : `#${value}`;
}

// ─── Page + site assembly ─────────────────────────────────────────────────────

/** Everything one fetched page yields. */
export function extractPage(html: string, pageUrl: string): PageExtraction {
  const nodes = parseJsonLd(html);
  const meta = parseMetaTags(html);

  const products = productsFromJsonLd(nodes, pageUrl);
  // Only fall back to meta when structured data produced nothing for this page:
  // a page with both would otherwise import the same item twice.
  if (products.length === 0) {
    const fromMeta = productFromMeta(meta, pageUrl);
    if (fromMeta) products.push(fromMeta);
  }

  const profile = profileFromJsonLd(nodes, pageUrl);
  profile.storeName ??= meta.get("og:site_name");
  profile.about ??= meta.get("og:description") ?? meta.get("description");
  const contact = contactFromHtml(html);
  profile.email ??= contact.email;
  profile.phone ??= contact.phone;
  profile.logoUrl ??= logoFromHtml(html, meta, pageUrl);
  profile.primaryColor ??= themeColorFromHtml(meta);

  // Categories: the product's own category, plus breadcrumb trails, which is
  // how most shops actually express their sections.
  const categories = new Set<string>();
  for (const p of products) if (p.rawCategory) categories.add(p.rawCategory);
  for (const node of nodes) {
    if (!nodeTypes(node).includes("breadcrumblist")) continue;
    const items = asArray(
      (node as Record<string, unknown>).itemListElement as unknown[],
    );
    for (const item of items) {
      const label = firstString(
        (item as Record<string, unknown>)?.name ??
          (item as Record<string, unknown>)?.item,
      );
      // The first crumb is "Home" and the last is the product itself; the
      // middle is the section the merchant actually named.
      if (label && !/^(home|start|accueil|startseite)$/i.test(label)) {
        categories.add(label.slice(0, 120));
      }
    }
  }

  return {
    products,
    profile,
    categories: Array.from(categories),
    links: sameOriginLinks(html, pageUrl),
  };
}

/**
 * Fold every crawled page into one importable result.
 *
 * Deduped by name, case-insensitively — the same product reachable from a
 * collection page and its own URL is one product. Richer wins: a row with a
 * price replaces one without, because the detail page usually carries more than
 * the listing tile did.
 */
export function mergeExtractions(pages: PageExtraction[]): SiteExtraction {
  const byName = new Map<string, ExtractedProduct>();
  for (const page of pages) {
    for (const product of page.products) {
      const key = product.name.trim().toLowerCase();
      if (!key) continue;
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, product);
        continue;
      }
      byName.set(key, {
        ...existing,
        price: existing.price ?? product.price,
        currency: existing.currency ?? product.currency,
        imageUrl: existing.imageUrl ?? product.imageUrl,
        rawCategory: existing.rawCategory || product.rawCategory,
        description:
          existing.description.length >= product.description.length
            ? existing.description
            : product.description,
        // A zero from any page wins: "sold out" stated anywhere is a fact,
        // while the 1 is only ever an assumption.
        quantity: Math.min(existing.quantity, product.quantity),
      });
    }
  }

  const profile: ExtractedProfile = {};
  for (const page of pages) {
    for (const [k, v] of Object.entries(page.profile)) {
      if (v && !(profile as Record<string, unknown>)[k]) {
        (profile as Record<string, unknown>)[k] = v;
      }
    }
  }

  const categories = new Set<string>();
  for (const page of pages) for (const c of page.categories) categories.add(c);

  const products = Array.from(byName.values());
  const warnings: string[] = [];
  if (products.length === 0) {
    warnings.push(
      "We couldn't find any products we could read on that site. Some shops build their catalogue in the browser, which leaves nothing for us to import.",
    );
  }
  const noPrice = products.filter((p) => p.price === null).length;
  if (noPrice > 0) {
    warnings.push(
      `${noPrice} of ${products.length} products had no price we could read — you can fill those in before importing.`,
    );
  }
  const noImage = products.filter((p) => !p.imageUrl).length;
  if (noImage > 0) {
    warnings.push(`${noImage} products came without a photo.`);
  }

  return { products, profile, categories: Array.from(categories), warnings };
}
