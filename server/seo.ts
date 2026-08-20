import type { Express, Request } from "express";
import { renderRobotsTxt, renderSitemapXml } from "@shared/marketing";
import {
  renderStorefrontSitemapXml,
  STOREFRONT_NOINDEX_PATHS,
} from "@shared/storefront";
import { getVisibleProducts } from "./db";
import { toProductSeo } from "./storefrontSeo";
import { resolveTenantFromRequest } from "./tenantResolve";

/**
 * Resolve the public base URL for absolute sitemap/robots URLs. Prefers the
 * explicit PUBLIC_BASE_URL (same env the Stripe redirects use), falling back to
 * the request's own scheme+host so a self-hosted deploy still gets valid output
 * without extra config.
 */
export function resolveBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured;
  const proto =
    (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

/**
 * A storefront's base URL always comes from its own host, never PUBLIC_BASE_URL:
 * that env var names the *platform* origin, so honouring it here would make every
 * store's sitemap advertise gwinn.ch URLs.
 */
function resolveStorefrontBaseUrl(req: Request): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  return `${proto}://${host}`;
}

/**
 * Register SEO discovery routes: /sitemap.xml and /robots.txt. Must be registered
 * before the SPA catch-all so the raw XML/text is served instead of index.html.
 *
 * Tenant-aware, the same way server/llms.ts is: a resolved storefront gets a
 * sitemap of its own pages and live product URLs, while the platform apex gets
 * the marketing sitemap. Without this a store served Gwinn's marketing sitemap,
 * advertising /pricing, /blog and /signup — all 404s on a storefront host.
 */
export function registerSeoRoutes(app: Express): void {
  app.get("/sitemap.xml", async (req, res) => {
    const tenant = await resolveTenantFromRequest(req);
    const body = tenant
      ? renderStorefrontSitemapXml(
          resolveStorefrontBaseUrl(req),
          (await getVisibleProducts(tenant.id)).map((p) => ({
            ...toProductSeo(p),
            updatedAt: p.updatedAt,
          })),
        )
      : renderSitemapXml(resolveBaseUrl(req));

    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(body);
  });

  app.get("/robots.txt", async (req, res) => {
    const tenant = await resolveTenantFromRequest(req);
    const body = tenant
      ? renderRobotsTxt(resolveStorefrontBaseUrl(req), STOREFRONT_NOINDEX_PATHS)
      : renderRobotsTxt(resolveBaseUrl(req));

    res
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send(body);
  });
}
