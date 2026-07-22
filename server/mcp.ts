import type { Express } from "express";
import type { Product, Tenant } from "../drizzle/schema";
import { PRODUCT_CATEGORIES } from "@shared/const";
import { normalizeBaseUrl } from "@shared/marketing";
import { getVisibleProducts, getVisibleProductById } from "./db";
import { resolveBaseUrl } from "./seo";
import { resolveTenantFromRequest } from "./tenantResolve";

/**
 * A Model Context Protocol (MCP) endpoint for storefront product discovery.
 *
 * Implements the MCP JSON-RPC 2.0 methods (initialize, tools/list, tools/call,
 * ping) over the Streamable HTTP transport with JSON responses — enough for
 * request/response tool calls, which is all these read-only discovery tools need
 * (no server-initiated streaming/SSE yet). Every tool is scoped to the tenant
 * resolved from the request (host subdomain or X-Tenant-Slug), so an MCP client
 * pointed at a store domain only ever sees that store's public catalogue.
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

export const MCP_TOOLS = [
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

async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: McpContext,
) {
  const deps = ctx.deps ?? defaultDeps;
  const base = normalizeBaseUrl(ctx.baseUrl);
  if (!ctx.tenant) {
    return toolError(
      "No store resolved for this request. Reach the MCP endpoint via a store domain/subdomain, or send an X-Tenant-Slug header.",
    );
  }
  const tenant = ctx.tenant;

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
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return err(msg?.id ?? null, -32600, "Invalid Request");
  }
  const isNotification = msg.id === undefined || msg.id === null;

  switch (msg.method) {
    case "initialize":
      return ok(msg.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Product discovery for a Zolto storefront. Use search_products / get_product / list_categories / get_store_info. All results are scoped to this store.",
      });

    case "notifications/initialized":
      return null; // client ack — no reply

    case "ping":
      return ok(msg.id, {});

    case "tools/list":
      return ok(msg.id, { tools: MCP_TOOLS });

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

  app.get("/mcp", (req, res) => {
    res.json({
      protocol: "Model Context Protocol",
      transport: "Streamable HTTP (JSON-RPC 2.0 over POST)",
      protocolVersion: MCP_PROTOCOL_VERSION,
      endpoint: `${normalizeBaseUrl(resolveBaseUrl(req))}/mcp`,
      tools: MCP_TOOLS.map((t) => t.name),
      note: "POST JSON-RPC to this URL. Tenant is resolved from the host or an X-Tenant-Slug header.",
    });
  });
}
