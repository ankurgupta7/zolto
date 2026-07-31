import type { Request } from "express";
import { isMarketingHost } from "@shared/marketing";
import { injectMarketingHead } from "./marketingSeo";
import { injectStorefrontHead } from "./storefrontHead";
import {
  injectStorefrontSeo,
  parseProductPath,
  toProductSeo,
} from "./storefrontSeo";
import { resolveBaseUrl } from "./seo";
import { resolveTenantFromRequest } from "./tenantResolve";
import {
  getTenantSettings,
  getVisibleProducts,
  getVisibleProductById,
} from "./db";

/**
 * Rewrite the served index.html <head> for the current request:
 *   - Marketing surface → server-rendered SEO (title/meta/JSON-LD/noscript).
 *   - Tenant storefront → the store's favicon/tab identity, then per-route SEO
 *     (canonical, Store/Product JSON-LD, noscript) so AI and search crawlers
 *     that don't run JavaScript see real content.
 *   - Anything else → unchanged.
 * Always returns HTML; never throws (a lookup failure falls back to the shell).
 */
export async function injectHeadForRequest(
  req: Request,
  html: string,
): Promise<string> {
  try {
    const host = (req.headers.host as string) || "";
    // originalUrl is the one field Express never rewrites when a handler is
    // mounted, so the route survives regardless of how this is wired up.
    // isMarketingHost expects a query string, not a path — passing req.url
    // meant ?surface=marketing never matched.
    const [routePath, search = ""] = req.originalUrl.split("?");
    if (isMarketingHost(host, search)) {
      return injectMarketingHead(html, routePath, resolveBaseUrl(req));
    }

    const tenant = await resolveTenantFromRequest(req);
    if (!tenant) return html;
    const settings = await getTenantSettings(tenant.id);
    const storeName = settings?.whiteLabelName || tenant.name;

    const out = injectStorefrontHead(html, {
      storeName,
      metaTitle: settings?.metaTitle ?? null,
      metaDescription: settings?.metaDescription ?? null,
      faviconUrl: settings?.faviconUrl || settings?.logoUrl || null,
      primaryColor: settings?.primaryColor ?? null,
    });

    // Per-route storefront SEO. Only the routes that need the catalogue pay for
    // it: a product page loads one row, `/` and `/shop` load the visible
    // catalogue, and every other route loads nothing.
    const identity = {
      storeName,
      baseUrl: resolveBaseUrl(req),
      currency: settings?.currency || "chf",
      description: settings?.metaDescription ?? null,
      logoUrl: settings?.logoUrl ?? null,
    };
    const clean = routePath.replace(/\/+$/, "") || "/";

    const productId = parseProductPath(clean);
    if (productId !== null) {
      const row = await getVisibleProductById(tenant.id, productId);
      return injectStorefrontSeo(out, routePath, {
        identity,
        products: [],
        product: row ? toProductSeo(row) : null,
      });
    }

    const products =
      clean === "/" || clean === "/shop"
        ? (await getVisibleProducts(tenant.id)).map(toProductSeo)
        : [];
    return injectStorefrontSeo(out, routePath, { identity, products });
  } catch {
    return html;
  }
}
