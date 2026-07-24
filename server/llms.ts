import type { Express, Response } from "express";
import type { Product, Tenant } from "../drizzle/schema";
import {
  normalizeBaseUrl,
  renderMarketingLlmsTxt,
  renderMarketingLlmsFullTxt,
} from "@shared/marketing";
import { getVisibleProducts } from "./db";
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
 * to query it programmatically (MCP). Product-aware — generated from the store's
 * visible, in-stock catalogue.
 */
export function renderStorefrontLlmsTxt(
  tenant: Tenant,
  products: Product[],
  baseUrl: string,
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
  lines.push(
    `> Handcrafted jewelry and accessories, sold online and in person. This store runs on Zolto. ${inStock.length} item(s) currently available.`,
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
    `- Model Context Protocol (MCP) endpoint: ${base}/mcp — JSON-RPC 2.0 over HTTP. Tools: \`search_products\`, \`get_product\`, \`list_categories\`, \`get_store_info\`.`,
  );
  lines.push(`- Full catalogue: ${base}/shop`);
  lines.push(
    "- Shipping: CHF 8 within Switzerland (free over CHF 50), CHF 15 to the EU.",
  );
  lines.push("");

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
      const products = await getVisibleProducts(tenant.id);
      send(res, renderStorefrontLlmsTxt(tenant, products, base));
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
      const products = await getVisibleProducts(tenant.id);
      send(res, renderStorefrontLlmsTxt(tenant, products, base));
    } else {
      send(res, renderMarketingLlmsFullTxt(base));
    }
  });
}
