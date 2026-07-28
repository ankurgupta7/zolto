/**
 * Caddy on-demand-TLS "ask" endpoint — covers two kinds of tenant hostnames:
 *
 * 1. Platform subdomains (blah.zolto.ch, or blah.zolto.kalakosh.ch when run
 *    alongside Kalakosh-ch) — every tenant's default storefront. We answer
 *    200 for any subdomain of the platform's root domain whose left-most
 *    label matches a real tenant slug. No plan gate: this is the free-tier
 *    home every tenant gets, not the paid custom-domain feature.
 * 2. Tenant custom domains (shop.example.com) — answer 200 only for domains
 *    a tenant actually registered in their settings, and only when their
 *    plan still includes the custom-domain feature.
 *
 * The platform root domain is read from PUBLIC_BASE_URL (set in every deploy
 * mode — standalone or alongside Kalakosh-ch) rather than SITE_DOMAIN, which
 * only applies to Zolto's own bundled Caddy and would be wrong/unset when a
 * different Caddy (e.g. Kalakosh-ch's) is fronting the app.
 *
 * Caddy calls this before minting a certificate for either case:
 *
 *   on_demand_tls {
 *     ask http://app:3000/api/domain-ask
 *   }
 *
 * Anything that doesn't match gets 404, so random hostnames can't drive
 * Let's Encrypt issuance through our Caddy. See SELF_HOSTING.md for the
 * full Caddyfile.
 */

import type { Express, Request, Response } from "express";
import {
  getTenantSettingsByDomain,
  getTenantById,
  getTenantBySlug,
} from "./db";
import { PLAN_FEATURES, type PlanId } from "./_core/trpc";
import { getPlatformRootDomain } from "./_core/platformDomain";

const HOSTNAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

export function registerDomainAsk(app: Express): void {
  app.get("/api/domain-ask", async (req: Request, res: Response) => {
    const domain = String(req.query.domain ?? "").toLowerCase();
    if (!HOSTNAME_RE.test(domain)) {
      res.status(400).end();
      return;
    }
    try {
      const root = getPlatformRootDomain();
      if (root && domain.endsWith(`.${root}`)) {
        const slug = domain.slice(0, -(root.length + 1));
        if (!slug || slug === "www" || slug.includes(".")) {
          res.status(404).end();
          return;
        }
        const tenant = await getTenantBySlug(slug);
        res.status(tenant ? 200 : 404).end();
        return;
      }

      const settings = await getTenantSettingsByDomain(domain);
      if (!settings) {
        res.status(404).end();
        return;
      }
      // Plan gate: the domain must belong to a tenant whose plan still
      // includes custom domains (a downgrade to free turns TLS issuance off).
      const tenant = await getTenantById(settings.tenantId);
      const allowed =
        tenant && PLAN_FEATURES[tenant.plan as PlanId]?.customDomain === true;
      res.status(allowed ? 200 : 403).end();
    } catch (err) {
      console.error("[DomainAsk] lookup failed:", err);
      res.status(500).end();
    }
  });
}
