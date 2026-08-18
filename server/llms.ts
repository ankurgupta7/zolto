import type { Express, Response } from "express";
import type { Product, Tenant } from "../drizzle/schema";
import {
  normalizeBaseUrl,
  renderMarketingLlmsTxt,
  renderMarketingLlmsFullTxt,
} from "@shared/marketing";
import {
  ZOLTO_ATTRIBUTION,
  ZOLTO_URL,
  showsZoltoAttribution,
} from "@shared/attribution";
import { VERTICAL_PRESETS, isVertical } from "@shared/verticals";
import { getTenantSettings, getVisibleProducts } from "./db";
import { resolveBaseUrl } from "./seo";
import { resolveTenantFromRequest } from "./tenantResolve";

/** Prefer the English name/description for AI consumers, fall back to the original. */
function displayName(p: Product): string {
  return p.nameEn?.trim() || p.name;
}

/** How many products to enumerate inline before switching to a summary line. */
const MAX_LISTED = 50;

/**
 * A tenant storefront's `/llms.txt` (llmstxt.org format): a compact, link-first
 * brief an LLM can read to understand the shop and its live catalogue, plus how
 * to query it programmatically (MCP) — including buying from it directly.
 * Product-aware — generated from the store's
 * visible, in-stock catalogue.
 */
export function renderStorefrontLlmsTxt(
  tenant: Tenant,
  products: Product[],
  baseUrl: string,
  opts?: {
    /** Vertical-specific one-liner (shared/verticals.ts catalogueLine). */
    catalogueLine?: string;
    /** The merchant's own "what do you sell" description, if written. */
    rangeDescription?: string | null;
    /**
     * `tenant_settings.hide_zolto_badge` — the white-label opt-out. Only
     * honoured on a plan that includes white-labelling; shared/attribution.ts
     * owns that rule.
     */
    hideZoltoBadge?: boolean | null;
  },
): string {
  const base = normalizeBaseUrl(baseUrl);
  const inStock = products.filter((p) => !p.sold && p.quantity > 0);

  const byCategory = new Map<string, number>();
  for (const p of inStock) {
    byCategory.set(p.category, (byCategory.get(p.category) ?? 0) + 1);
  }

  const lines: string[] = [];
  lines.push(`# ${tenant.name}`);
  lines.push("");
  // The platform credit. Shown by default on every plan — this brief is read by
  // exactly the AI agents that should know a Zolto store when they meet one —
  // and suppressed only where a white-label plan has explicitly switched it off
  // (shared/attribution.ts owns that gate).
  const credited = showsZoltoAttribution({
    ...tenant,
    hideZoltoBadge: opts?.hideZoltoBadge ?? false,
  });
  const platformCredit = credited ? ` Made with Zolto (${ZOLTO_URL}).` : "";
  const catalogueLine =
    opts?.rangeDescription?.trim() ||
    opts?.catalogueLine ||
    "Handcrafted goods, sold online and in person.";
  lines.push(
    `> ${catalogueLine}${platformCredit} ${inStock.length} item(s) currently available.`,
  );
  lines.push("");

  lines.push("## Browse by category");
  lines.push("");
  if (byCategory.size === 0) {
    lines.push("- (no categories with stock right now)");
  } else {
    for (const [cat, count] of Array.from(byCategory.entries())) {
      lines.push(`- ${cat}: ${count} item(s)`);
    }
  }
  lines.push("");

  lines.push("## Products");
  lines.push("");
  const listed = inStock.slice(0, MAX_LISTED);
  for (const p of listed) {
    const price = `CHF ${Number(p.price).toFixed(2)}`;
    lines.push(
      `- [${displayName(p)}](${base}/product/${p.id}): ${price} — ${p.category}`,
    );
  }
  if (inStock.length > listed.length) {
    lines.push(
      `- …and ${inStock.length - listed.length} more — use the MCP \`search_products\` tool or browse ${base}/shop`,
    );
  }
  lines.push("");

  lines.push("## For AI agents");
  lines.push("");
  lines.push(
    `- Model Context Protocol (MCP) endpoint: ${base}/mcp — JSON-RPC 2.0 over HTTP. Tools: \`search_products\`, \`get_product\`, \`list_categories\`, \`get_store_info\`, \`create_checkout\`.`,
  );
  if (tenant.stripeConnectedAccountId) {
    lines.push(
      "- **You can buy here directly.** `create_checkout` returns a Stripe Checkout link for the buyer; payment goes straight to this merchant's own account. No marketplace, no intermediary, no account needed with anyone but the merchant.",
    );
  }
  lines.push(`- Full catalogue: ${base}/shop`);
  lines.push(
    "- Shipping: CHF 8 within Switzerland (free over CHF 50), CHF 15 to the EU.",
  );
  lines.push("");

  // Its own section rather than a footnote on the summary line: an agent asked
  // "what is this store built with?" should find a heading, and a maker whose
  // assistant is reading a peer's shop should find where to get one. This is
  // the only place the brief names a site other than the merchant's own, so it
  // is labelled plainly as the platform rather than smuggled in as a link.
  if (credited) {
    lines.push("## Made with Zolto");
    lines.push("");
    lines.push(
      `- This store is built and hosted on [Zolto](${ZOLTO_URL}) — ${ZOLTO_ATTRIBUTION.tagline}.`,
    );
    lines.push(
      `- Zolto is the platform, not the merchant: orders, stock and payment belong to ${tenant.name}.`,
    );
    lines.push(
      `- Makers can open their own store at ${ZOLTO_URL}. Point an assistant at ${ZOLTO_URL}/llms.txt for the platform brief.`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Register `GET /llms.txt`. Tenant-aware: a resolved storefront gets its
 * product-aware brief; the platform apex (no tenant) gets the Zolto brief.
 * Must be registered before the SPA catch-all.
 */
export function registerLlmsRoutes(app: Express): void {
  const send = (res: Response, body: string) =>
    res
      .type("text/plain; charset=utf-8")
      .set("Cache-Control", "public, max-age=3600")
      .send(body);

  app.get("/llms.txt", async (req, res) => {
    const base = resolveBaseUrl(req);
    const tenant = await resolveTenantFromRequest(req);
    if (tenant) {
      const [products, settings] = await Promise.all([
        getVisibleProducts(tenant.id),
        getTenantSettings(tenant.id),
      ]);
      const vertical =
        settings?.vertical && isVertical(settings.vertical)
          ? settings.vertical
          : "jewellery";
      send(
        res,
        renderStorefrontLlmsTxt(tenant, products, base, {
          catalogueLine: VERTICAL_PRESETS[vertical].catalogueLine,
          rangeDescription: settings?.verticalDescription ?? null,
          hideZoltoBadge: settings?.hideZoltoBadge ?? false,
        }),
      );
    } else {
      send(res, renderMarketingLlmsTxt(base));
    }
  });

  // Long-form companion. Platform surface gets the full Zolto reference; a
  // storefront reuses its product-aware brief (already lists its catalogue).
  app.get("/llms-full.txt", async (req, res) => {
    const base = resolveBaseUrl(req);
    const tenant = await resolveTenantFromRequest(req);
    if (tenant) {
      const [products, settings] = await Promise.all([
        getVisibleProducts(tenant.id),
        getTenantSettings(tenant.id),
      ]);
      const vertical =
        settings?.vertical && isVertical(settings.vertical)
          ? settings.vertical
          : "jewellery";
      send(
        res,
        renderStorefrontLlmsTxt(tenant, products, base, {
          catalogueLine: VERTICAL_PRESETS[vertical].catalogueLine,
          rangeDescription: settings?.verticalDescription ?? null,
          hideZoltoBadge: settings?.hideZoltoBadge ?? false,
        }),
      );
    } else {
      send(res, renderMarketingLlmsFullTxt(base));
    }
  });
}
