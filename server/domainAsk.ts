/**
 * Custom-domain support — Caddy on-demand-TLS "ask" endpoint.
 *
 * When Caddy serves tenant custom domains (shop.example.com), its on-demand
 * TLS asks this endpoint before minting a certificate:
 *
 *   tls {
 *     on_demand
 *     ask http://app:3000/api/domain-ask
 *   }
 *
 * We answer 200 only for domains a tenant actually registered in their
 * settings (and whose plan includes the custom-domain feature), so random
 * hostnames can't drive Let's Encrypt issuance through our Caddy. Anything
 * else gets 404. See SELF_HOSTING.md for the full Caddyfile.
 */

import type { Express, Request, Response } from "express";
import { getTenantSettingsByDomain, getTenantById } from "./db";
import { PLAN_FEATURES, type PlanId } from "./_core/trpc";

const HOSTNAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

export function registerDomainAsk(app: Express): void {
  app.get("/api/domain-ask", async (req: Request, res: Response) => {
    const domain = String(req.query.domain ?? "").toLowerCase();
    if (!HOSTNAME_RE.test(domain)) {
      res.status(400).end();
      return;
    }
    try {
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
