import type { Request } from "express";
import { isMarketingHost } from "@shared/marketing";
import { injectMarketingHead } from "./marketingSeo";
import { injectStorefrontHead } from "./storefrontHead";
import { resolveBaseUrl } from "./seo";
import { resolveTenantFromRequest } from "./tenantResolve";
import { getTenantSettings } from "./db";

/**
 * Rewrite the served index.html <head> for the current request:
 *   - Marketing surface → server-rendered SEO (title/meta/JSON-LD/noscript).
 *   - Tenant storefront → the store's own favicon + tab title / OG identity.
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
    return injectStorefrontHead(html, {
      storeName: settings?.whiteLabelName || tenant.name,
      metaTitle: settings?.metaTitle ?? null,
      metaDescription: settings?.metaDescription ?? null,
      faviconUrl: settings?.faviconUrl || settings?.logoUrl || null,
      primaryColor: settings?.primaryColor ?? null,
    });
  } catch {
    return html;
  }
}
