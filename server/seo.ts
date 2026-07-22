import type { Express, Request } from "express";
import { renderRobotsTxt, renderSitemapXml } from "@shared/marketing";

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
 * Register SEO discovery routes for the marketing surface: /sitemap.xml and
 * /robots.txt. Must be registered before the SPA catch-all so the raw XML/text
 * is served instead of index.html. The URL set comes from @shared/marketing, so
 * it always matches the routes the marketing router actually serves.
 */
export function registerSeoRoutes(app: Express): void {
  app.get("/sitemap.xml", (req, res) => {
    res
      .type("application/xml")
      .set("Cache-Control", "public, max-age=3600")
      .send(renderSitemapXml(resolveBaseUrl(req)));
  });

  app.get("/robots.txt", (req, res) => {
    res
      .type("text/plain")
      .set("Cache-Control", "public, max-age=3600")
      .send(renderRobotsTxt(resolveBaseUrl(req)));
  });
}
