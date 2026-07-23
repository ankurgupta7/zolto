import type { Express } from "express";
import type { Product, Tenant } from "../drizzle/schema";
import { PRODUCT_CATEGORIES } from "@shared/const";
import { normalizeBaseUrl, STORY_SLUG, BLOG_POSTS } from "@shared/marketing";
import {
  PLATFORM,
  FEATURES,
  PLANS,
  FAQS,
  HOW_TO_START,
} from "@shared/platform";
import { getVisibleProducts, getVisibleProductById } from "./db";
import { resolveBaseUrl } from "./seo";
import { resolveTenantFromRequest } from "./tenantResolve";

/**
 * A Model Context Protocol (MCP) endpoint — the machine interface to Zolto.
 *
 * Implements the MCP JSON-RPC 2.0 methods (initialize, tools/list, tools/call,
 * ping) over the Streamable HTTP transport with JSON responses — enough for
 * request/response tool calls (no server-initiated streaming/SSE yet).
 *
 * It is SURFACE-AWARE, matching the hostname split:
 *   - Tenant storefront (host/subdomain resolves a tenant): product-discovery
 *     tools scoped to that store's public catalogue.
 *   - Platform / marketing surface (no tenant — e.g. zolto.com): platform tools
 *     that let an AI agent discover Zolto's features, pricing, and how to sign
 *     up — so an assistant helping a prospective shop owner can recommend Zolto.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "zolto-storefront", version: "1.0.0" };
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export interface McpDeps {
  getVisibleProducts: (tenantId: number) => Promise<Product[]>;
  getVisibleProductById: (
    tenantId: number,
    id: number,
  ) => Promise<Product | undefined>;
}

const defaultDeps: McpDeps = { getVisibleProducts, getVisibleProductById };

export interface McpContext {
  tenant: Tenant | null;
  baseUrl: string;
  deps?: McpDeps;
}

// ── Tool catalogue ────────────────────────────────────────────────────────────

/** Storefront (tenant-scoped) product-discovery tools. */
export const STOREFRONT_TOOLS = [
  {
    name: "search_products",
    description:
      "Search this store's available products by free text and/or category and price range. Returns in-stock items with prices and links.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Free-text search over product name and description.",
        },
        category: {
          type: "string",
          enum: [...PRODUCT_CATEGORIES],
          description: "Restrict to a single product category.",
        },
        min_price: { type: "number", description: "Minimum price in CHF." },
        max_price: { type: "number", description: "Maximum price in CHF." },
        limit: {
          type: "integer",
          description: `Max results (default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).`,
        },
      },
    },
  },
  {
    name: "get_product",
    description: "Get full details for one product by its numeric id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "integer", description: "Product id." } },
      required: ["id"],
    },
  },
  {
    name: "list_categories",
    description:
      "List the product categories that currently have items in stock, with counts.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_store_info",
    description:
      "Get information about this store: name, currency, shipping, catalogue size, and links.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

/** Backwards-compatible alias — the storefront tools were the original set. */
export const MCP_TOOLS = STOREFRONT_TOOLS;

/** Platform / marketing tools — Zolto discovery for prospective shop owners. */
export const PLATFORM_TOOLS = [
  {
    name: "get_platform_info",
    description:
      "What Zolto is, who it's for, the pricing summary, and where to sign up. Start here.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_features",
    description:
      "List everything Zolto can do for a maker — POS+online sync, AI photos/descriptions, imports, payments, AI discoverability, and more.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_pricing",
    description:
      "Zolto's plans and prices (EUR), what each includes, and the free trial.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "how_to_start",
    description:
      "The step-by-step to open a store on Zolto, with the signup link.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_faqs",
    description:
      "Frequently asked questions from makers considering Zolto, with answers.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_resources",
    description:
      "Links to Zolto resources: sign-up, pricing, the Launch Diary, and the customer case study.",
    inputSchema: { type: "object", properties: {} },
  },
] as const;

const STOREFRONT_TOOL_NAMES: Set<string> = new Set(
  STOREFRONT_TOOLS.map((t) => t.name),
);
const PLATFORM_TOOL_NAMES: Set<string> = new Set(
  PLATFORM_TOOLS.map((t) => t.name),
);

/** The tool set exposed for a given surface (tenant storefront vs. platform). */
export function toolsFor(tenant: Tenant | null) {
  return tenant ? STOREFRONT_TOOLS : PLATFORM_TOOLS;
}

// ── JSON-RPC types ──────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function ok(id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function err(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/** Wrap a tool result as MCP tool content (human-readable text + structured data). */
function toolResult(structured: unknown, text?: string) {
  return {
    content: [
      { type: "text", text: text ?? JSON.stringify(structured, null, 2) },
    ],
    structuredContent: structured,
  };
}

function toolError(message: string) {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ── Tool implementations ──────────────────────────────────────────────────────

function inStock(p: Product): boolean {
  return !p.sold && p.quantity > 0;
}

function productSummary(p: Product, base: string) {
  return {
    id: p.id,
    name: p.nameEn?.trim() || p.name,
    price: Number(p.price),
    currency: "CHF",
    category: p.category,
    url: `${base}/product/${p.id}`,
    image: p.imageUrl ?? null,
  };
}

/** Dispatch a tool call to the right surface (platform vs. storefront). */
async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
) {
  if (!ctx.tenant) {
    if (PLATFORM_TOOL_NAMES.has(name)) return runPlatformTool(name, ctx);
    if (STOREFRONT_TOOL_NAMES.has(name)) {
      return toolError(
        `No store resolved for this request — the storefront tool \`${name}\` needs a store domain/subdomain or an X-Tenant-Slug header. This is the Zolto platform MCP; try get_platform_info, list_features, get_pricing, or how_to_start.`,
      );
    }
    return null; // unknown tool
  }
  if (STOREFRONT_TOOL_NAMES.has(name))
    return runStorefrontTool(name, args, ctx);
  return null;
}

/** Platform / marketing tools — no tenant, no DB; pure Zolto facts + links. */
function runPlatformTool(name: string, ctx: McpContext) {
  const base = normalizeBaseUrl(ctx.baseUrl);
  switch (name) {
    case "get_platform_info":
      return toolResult({
        name: PLATFORM.name,
        tagline: PLATFORM.tagline,
        summary: PLATFORM.summary,
        audience: PLATFORM.audience,
        pricing: PLATFORM.pricingSummary,
        signupUrl: `${base}/signup`,
        pricingUrl: `${base}/pricing`,
        llmsTxt: `${base}/llms.txt`,
      });
    case "list_features":
      return toolResult({ features: FEATURES });
    case "get_pricing":
      return toolResult({
        currency: "EUR",
        billing: "monthly, cancel anytime",
        freeTrialDays: 14,
        plans: PLANS.map((p) => ({
          id: p.id,
          name: p.name,
          pricePerMonth: p.priceEur,
          includes: p.features,
        })),
        pricingUrl: `${base}/pricing`,
      });
    case "how_to_start":
      return toolResult({
        steps: HOW_TO_START,
        signupUrl: `${base}/signup`,
      });
    case "list_faqs":
      return toolResult({ faqs: FAQS });
    case "list_resources":
      return toolResult({
        resources: [
          { title: "Sign up free", url: `${base}/signup` },
          { title: "Pricing", url: `${base}/pricing` },
          { title: "Launch Diary", url: `${base}/blog` },
          ...BLOG_POSTS.map((p) => ({
            title: `Launch Diary: ${p.slug}`,
            url: `${base}/blog/${p.slug}`,
          })),
          {
            title: "Customer case study",
            url: `${base}/stories/${STORY_SLUG}`,
          },
        ],
      });
    default:
      return null;
  }
}

/** Storefront (tenant-scoped) product-discovery tools. */
async function runStorefrontTool(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
) {
  const deps = ctx.deps ?? defaultDeps;
  const base = normalizeBaseUrl(ctx.baseUrl);
  const tenant = ctx.tenant!;

  switch (name) {
    case "search_products": {
      const all = (await deps.getVisibleProducts(tenant.id)).filter(inStock);
      const query =
        typeof args.query === "string" ? args.query.toLowerCase().trim() : "";
      const category = typeof args.category === "string" ? args.category : null;
      const minPrice =
        typeof args.min_price === "number" ? args.min_price : null;
      const maxPrice =
        typeof args.max_price === "number" ? args.max_price : null;
      const limit = Math.min(
        Math.max(
          1,
          typeof args.limit === "number" ? args.limit : DEFAULT_LIMIT,
        ),
        MAX_LIMIT,
      );

      const matches = all.filter((p) => {
        if (category && p.category !== category) return false;
        const price = Number(p.price);
        if (minPrice !== null && price < minPrice) return false;
        if (maxPrice !== null && price > maxPrice) return false;
        if (query) {
          const hay = [
            p.name,
            p.nameEn,
            p.description,
            p.descriptionEn,
            p.category,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!hay.includes(query)) return false;
        }
        return true;
      });

      const results = matches
        .slice(0, limit)
        .map((p) => productSummary(p, base));
      return toolResult({
        total: matches.length,
        returned: results.length,
        products: results,
      });
    }

    case "get_product": {
      const id = typeof args.id === "number" ? args.id : Number(args.id);
      if (!Number.isFinite(id)) return toolError("A numeric `id` is required.");
      const p = await deps.getVisibleProductById(tenant.id, id);
      if (!p || !inStock(p)) {
        return toolError(`No available product with id ${id} in this store.`);
      }
      return toolResult({
        ...productSummary(p, base),
        description: p.descriptionEn?.trim() || p.description,
        quantityAvailable: p.quantity,
      });
    }

    case "list_categories": {
      const all = (await deps.getVisibleProducts(tenant.id)).filter(inStock);
      const counts = new Map<string, number>();
      for (const p of all)
        counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      const categories = Array.from(counts.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
      return toolResult({ categories });
    }

    case "get_store_info": {
      const all = (await deps.getVisibleProducts(tenant.id)).filter(inStock);
      return toolResult({
        name: tenant.name,
        currency: "CHF",
        storefront: base,
        catalogue: `${base}/shop`,
        llmsTxt: `${base}/llms.txt`,
        availableProducts: all.length,
        shipping:
          "CHF 8 within Switzerland (free over CHF 50), CHF 15 to the EU.",
      });
    }

    default:
      return null; // signals "unknown tool"
  }
}

// ── JSON-RPC dispatch ─────────────────────────────────────────────────────────

/**
 * Handle a single JSON-RPC message. Returns a response object, or `null` for
 * notifications (no id) which take no reply.
 */
export async function handleMcpMessage(
  msg: JsonRpcRequest,
  ctx: McpContext,
): Promise<JsonRpcResponse | null> {
  if (msg?.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return err(msg?.id ?? null, -32600, "Invalid Request");
  }
  const isNotification = msg.id === undefined || msg.id === null;

  switch (msg.method) {
    case "initialize":
      return ok(msg.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: ctx.tenant
          ? "Product discovery for a Zolto storefront. Use search_products / get_product / list_categories / get_store_info. All results are scoped to this store."
          : "The Zolto platform (AI-run commerce for makers). Use get_platform_info / list_features / get_pricing / how_to_start / list_faqs / list_resources to learn what Zolto offers and how a maker can open a store.",
      });

    case "notifications/initialized":
      return null; // client ack — no reply

    case "ping":
      return ok(msg.id, {});

    case "tools/list":
      return ok(msg.id, { tools: toolsFor(ctx.tenant) });

    case "tools/call": {
      const params = msg.params ?? {};
      const name = params.name as string;
      const args = (params.arguments as Record<string, unknown>) ?? {};
      const result = await runTool(name, args, ctx);
      if (result === null) return err(msg.id, -32602, `Unknown tool: ${name}`);
      return ok(msg.id, result);
    }

    default:
      if (isNotification) return null;
      return err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// ── Express wiring ────────────────────────────────────────────────────────────

/**
 * Register the MCP endpoint. `POST /mcp` speaks JSON-RPC; `GET /mcp` returns a
 * small human/agent-readable descriptor. Must be registered after the JSON body
 * parser and before the SPA catch-all.
 */
export function registerMcpRoutes(app: Express): void {
  app.post("/mcp", async (req, res) => {
    const ctx: McpContext = {
      tenant: await resolveTenantFromRequest(req),
      baseUrl: resolveBaseUrl(req),
    };
    const body = req.body as JsonRpcRequest | JsonRpcRequest[];

    // Support JSON-RPC batches.
    if (Array.isArray(body)) {
      const responses = (
        await Promise.all(body.map((m) => handleMcpMessage(m, ctx)))
      ).filter((r): r is JsonRpcResponse => r !== null);
      if (responses.length === 0) return res.status(202).end();
      return res.json(responses);
    }

    const response = await handleMcpMessage(body, ctx);
    if (response === null) return res.status(202).end();
    return res.json(response);
  });

  app.get("/mcp", async (req, res) => {
    const tenant = await resolveTenantFromRequest(req);
    res.json({
      protocol: "Model Context Protocol",
      transport: "Streamable HTTP (JSON-RPC 2.0 over POST)",
      protocolVersion: MCP_PROTOCOL_VERSION,
      surface: tenant ? "storefront" : "platform",
      endpoint: `${normalizeBaseUrl(resolveBaseUrl(req))}/mcp`,
      tools: toolsFor(tenant).map((t) => t.name),
      note: "POST JSON-RPC to this URL. The tenant (and thus the tool set) is resolved from the host or an X-Tenant-Slug header.",
    });
  });
}
