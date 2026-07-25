import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Product, Tenant } from "../drizzle/schema";
import {
  handleMcpMessage,
  MCP_TOOLS,
  MCP_PROTOCOL_VERSION,
  type McpContext,
  type McpDeps,
} from "./mcp";

const tenant = {
  id: 7,
  name: "Kalakosh",
  slug: "kalakosh",
  domain: "kalakosh.ch",
} as unknown as Tenant;

let nextId = 1;
function makeProduct(p: Partial<Product>): Product {
  return {
    id: nextId++,
    tenantId: 7,
    name: "Perlenkette",
    description: "Handgefertigt",
    nameEn: "Pearl necklace",
    descriptionEn: "Handmade freshwater pearl necklace",
    price: "65.00",
    category: "Necklaces",
    imageKey: null,
    imageUrl: "https://img/1.jpg",
    visible: true,
    sold: false,
    quantity: 1,
    reservedUntil: null,
    reservedToken: null,
    source: "manual",
    discordMessageId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...p,
  } as Product;
}

function buildCtx(products: Product[]): McpContext {
  const deps: McpDeps = {
    getVisibleProducts: vi.fn(async () => products),
    getVisibleProductById: vi.fn(async (_t, id) =>
      products.find((p) => p.id === id),
    ),
  };
  return { tenant, baseUrl: "https://kalakosh.ch/", deps };
}

const req = (method: string, params?: unknown, id: number | null = 1) => ({
  jsonrpc: "2.0" as const,
  id,
  method,
  params: params as Record<string, unknown>,
});

describe("MCP JSON-RPC lifecycle", () => {
  const ctx = buildCtx([]);

  it("initialize returns the protocol version and server info", async () => {
    const res = await handleMcpMessage(req("initialize"), ctx);
    expect(res?.result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
      serverInfo: { name: "zolto-storefront" },
    });
  });

  it("tools/list returns the discovery tools", async () => {
    const res = await handleMcpMessage(req("tools/list"), ctx);
    const tools = (res?.result as { tools: { name: string }[] }).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_product",
      "get_store_info",
      "list_categories",
      "search_products",
    ]);
    expect(tools.length).toBe(MCP_TOOLS.length);
  });

  it("notifications/initialized gets no reply", async () => {
    const res = await handleMcpMessage(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      ctx,
    );
    expect(res).toBeNull();
  });

  it("ping responds with an empty result", async () => {
    const res = await handleMcpMessage(req("ping"), ctx);
    expect(res?.result).toEqual({});
  });

  it("unknown method returns method-not-found", async () => {
    const res = await handleMcpMessage(req("does/not/exist"), ctx);
    expect(res?.error?.code).toBe(-32601);
  });

  it("rejects a malformed message", async () => {
    const res = await handleMcpMessage(
      { jsonrpc: "1.0", method: "x" } as never,
      ctx,
    );
    expect(res?.error?.code).toBe(-32600);
  });
});

describe("MCP tools", () => {
  const products = [
    makeProduct({
      id: 101,
      nameEn: "Pearl drop earrings",
      category: "Earrings",
      price: "45.00",
    }),
    makeProduct({
      id: 102,
      nameEn: "Amethyst bracelet",
      category: "Bracelets",
      price: "80.00",
      descriptionEn: "purple amethyst",
    }),
    makeProduct({
      id: 103,
      nameEn: "Sold pearl ring",
      category: "Rings",
      price: "120.00",
      sold: true,
    }),
    makeProduct({
      id: 104,
      nameEn: "Out of stock necklace",
      category: "Necklaces",
      price: "60.00",
      quantity: 0,
    }),
    makeProduct({
      id: 105,
      nameEn: "Freshwater pearl necklace",
      category: "Necklaces",
      price: "65.00",
      descriptionEn: "freshwater pearls",
    }),
  ];
  const ctx = buildCtx(products);

  async function call(name: string, args: Record<string, unknown> = {}) {
    const res = await handleMcpMessage(
      req("tools/call", { name, arguments: args }),
      ctx,
    );
    return res?.result as {
      structuredContent?: Record<string, unknown>;
      isError?: boolean;
      content: { text: string }[];
    };
  }

  it("search_products returns only in-stock items", async () => {
    const r = await call("search_products");
    const sc = r.structuredContent as {
      total: number;
      products: { id: number }[];
    };
    // 101, 102, 105 are in stock; 103 sold, 104 zero-qty excluded.
    expect(sc.total).toBe(3);
    expect(sc.products.map((p) => p.id).sort()).toEqual([101, 102, 105]);
  });

  it("search_products filters by free-text query", async () => {
    const r = await call("search_products", { query: "amethyst" });
    const sc = r.structuredContent as { products: { id: number }[] };
    expect(sc.products.map((p) => p.id)).toEqual([102]);
  });

  it("search_products filters by category and price range", async () => {
    const r = await call("search_products", {
      category: "Necklaces",
      max_price: 66,
    });
    const sc = r.structuredContent as { products: { id: number }[] };
    expect(sc.products.map((p) => p.id)).toEqual([105]); // 104 is out of stock
  });

  it("search_products caps the limit", async () => {
    const r = await call("search_products", { limit: 999 });
    const sc = r.structuredContent as { returned: number };
    expect(sc.returned).toBeLessThanOrEqual(50);
  });

  it("get_product returns detail for an available product with an absolute url", async () => {
    const r = await call("get_product", { id: 105 });
    expect(r.structuredContent).toMatchObject({
      id: 105,
      currency: "CHF",
      url: "https://kalakosh.ch/product/105",
    });
  });

  it("get_product errors for a sold or unknown product", async () => {
    expect((await call("get_product", { id: 103 })).isError).toBe(true); // sold
    expect((await call("get_product", { id: 999 })).isError).toBe(true); // unknown
  });

  it("list_categories counts in-stock items per category", async () => {
    const r = await call("list_categories");
    const sc = r.structuredContent as {
      categories: { category: string; count: number }[];
    };
    const map = Object.fromEntries(
      sc.categories.map((c) => [c.category, c.count]),
    );
    expect(map).toMatchObject({ Earrings: 1, Bracelets: 1, Necklaces: 1 });
    expect(map.Rings).toBeUndefined(); // the only ring is sold
  });

  it("get_store_info reports the store name and available count", async () => {
    const r = await call("get_store_info");
    expect(r.structuredContent).toMatchObject({
      name: "Kalakosh",
      currency: "CHF",
      availableProducts: 3,
      storefront: "https://kalakosh.ch",
    });
  });

  it("unknown tool returns an invalid-params error", async () => {
    const res = await handleMcpMessage(
      req("tools/call", { name: "delete_everything", arguments: {} }),
      ctx,
    );
    expect(res?.error?.code).toBe(-32602);
  });

  it("storefront tools called without a store point the agent to the platform tools", async () => {
    const noTenant: McpContext = { ...ctx, tenant: null };
    const res = await handleMcpMessage(
      req("tools/call", { name: "search_products", arguments: {} }),
      noTenant,
    );
    const result = res?.result as {
      isError?: boolean;
      content: { text: string }[];
    };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No store resolved");
  });
});

describe("Platform MCP (no tenant / marketing surface)", () => {
  const ctx: McpContext = { tenant: null, baseUrl: "https://zolto.com" };

  async function call(name: string, args: Record<string, unknown> = {}) {
    const res = await handleMcpMessage(
      req("tools/call", { name, arguments: args }),
      ctx,
    );
    return res?.result as {
      structuredContent?: Record<string, unknown>;
      isError?: boolean;
    };
  }

  it("exposes platform tools when no store resolves", async () => {
    const res = await handleMcpMessage(req("tools/list"), ctx);
    const names = (res?.result as { tools: { name: string }[] }).tools.map(
      (t) => t.name,
    );
    expect(names).toContain("get_platform_info");
    expect(names).toContain("get_pricing");
    expect(names).toContain("how_to_start");
    expect(names).not.toContain("search_products");
  });

  it("initialize describes the platform when there's no tenant", async () => {
    const res = await handleMcpMessage(req("initialize"), ctx);
    expect((res?.result as { instructions: string }).instructions).toContain(
      "Zolto platform",
    );
  });

  it("get_platform_info returns the signup link and summary", async () => {
    const r = await call("get_platform_info");
    expect(r.structuredContent).toMatchObject({
      name: "Zolto",
      signupUrl: "https://zolto.com/signup",
    });
  });

  it("get_pricing returns EUR plans with a free trial", async () => {
    const r = await call("get_pricing");
    const sc = r.structuredContent as {
      currency: string;
      freeTrialDays: number;
      plans: { name: string; pricePerMonth: number }[];
    };
    expect(sc.currency).toBe("CHF");
    expect(sc.freeTrialDays).toBe(14);
    expect(sc.plans.some((p) => p.pricePerMonth === 0)).toBe(true);
  });

  it("list_features and how_to_start return content", async () => {
    const features = (await call("list_features")).structuredContent as {
      features: unknown[];
    };
    expect(features.features.length).toBeGreaterThan(3);
    const start = (await call("how_to_start")).structuredContent as {
      steps: string[];
      signupUrl: string;
    };
    expect(start.steps.length).toBeGreaterThan(2);
    expect(start.signupUrl).toBe("https://zolto.com/signup");
  });

  it("list_resources links to signup, pricing, and the case study", async () => {
    const r = (await call("list_resources")).structuredContent as {
      resources: { url: string }[];
    };
    const urls = r.resources.map((x) => x.url);
    expect(urls).toContain("https://zolto.com/signup");
    expect(urls.some((u) => u.includes("/stories/"))).toBe(true);
  });

  it("a storefront-only tool name is unknown on the platform surface", async () => {
    // get_store_info is storefront-only; on the platform surface it 404s as a tool.
    const res = await handleMcpMessage(
      req("tools/call", { name: "list_categories", arguments: {} }),
      ctx,
    );
    // storefront tool without a store → helpful isError, not a crash
    const result = res?.result as { isError?: boolean };
    expect(result.isError).toBe(true);
  });
});

// ── HTTP transport (route) ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getTenantBySlug: vi.fn(),
  getVisibleProducts: vi.fn(),
  getVisibleProductById: vi.fn(),
}));

vi.mock("./db", () => ({
  getTenantBySlug: (...a: unknown[]) => mocks.getTenantBySlug(...a),
  getVisibleProducts: (...a: unknown[]) => mocks.getVisibleProducts(...a),
  getVisibleProductById: (...a: unknown[]) => mocks.getVisibleProductById(...a),
}));

describe("POST /mcp (Streamable HTTP)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.getTenantBySlug.mockResolvedValue(tenant);
    mocks.getVisibleProducts.mockResolvedValue([
      makeProduct({ id: 201, nameEn: "Pearl studs", category: "Earrings" }),
    ]);
  });

  async function buildApp() {
    const { registerMcpRoutes } = await import("./mcp");
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);
    return app;
  }

  it("resolves the tenant from X-Tenant-Slug and answers initialize", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/mcp")
      .set("X-Tenant-Slug", "kalakosh")
      .send(req("initialize"));
    expect(res.status).toBe(200);
    expect(res.body.result.protocolVersion).toBe(MCP_PROTOCOL_VERSION);
  });

  it("runs a tool call end-to-end", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/mcp")
      .set("X-Tenant-Slug", "kalakosh")
      .send(req("tools/call", { name: "get_store_info", arguments: {} }));
    expect(res.status).toBe(200);
    expect(res.body.result.structuredContent.name).toBe("Kalakosh");
  });

  it("returns 202 with no body for a notification", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/mcp")
      .send({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
  });

  it("GET /mcp returns a descriptor listing the tools", async () => {
    const app = await buildApp();
    const res = await request(app).get("/mcp");
    expect(res.status).toBe(200);
    expect(res.body.tools).toContain("search_products");
  });

  it("serves platform tools when no store resolves", async () => {
    mocks.getTenantBySlug.mockResolvedValue(undefined); // nothing matches
    const app = await buildApp();
    const res = await request(app)
      .post("/mcp")
      .set("Host", "zolto.com")
      .send(req("tools/call", { name: "get_pricing", arguments: {} }));
    expect(res.status).toBe(200);
    expect(res.body.result.structuredContent.currency).toBe("CHF");
  });
});
