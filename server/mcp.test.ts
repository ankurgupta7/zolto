import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Product, Tenant } from "../drizzle/schema";
import {
  handleMcpMessage,
  MCP_TOOLS,
  MCP_PROTOCOL_VERSION,
  resetMcpRateLimits,
  type McpContext,
  type McpDeps,
} from "./mcp";
import { CheckoutError } from "./checkoutSession";

const tenant = {
  id: 7,
  name: "Kalakosh",
  slug: "kalakosh",
  domain: "kalakosh.ch",
  plan: "free",
  stripeConnectedAccountId: "acct_kalakosh",
} as unknown as Tenant;

/** A successful checkout, as the shared service would return it. */
const checkoutOk = {
  url: "https://checkout.stripe.com/cs_agent_1",
  sessionId: "cs_agent_1",
  amountTotal: 6500,
  currency: "chf",
  platformFeeRappen: 65,
  items: [{ id: 1, name: "Perlenkette", price: "65.00" }],
};

const createCheckout = vi.fn();

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

function buildCtx(
  products: Product[],
  overrides: Partial<McpContext> = {},
): McpContext {
  const deps: McpDeps = {
    getVisibleProducts: vi.fn(async () => products),
    getVisibleProductById: vi.fn(async (_t, id) =>
      products.find((p) => p.id === id),
    ),
    createCheckout,
  };
  return { tenant, baseUrl: "https://kalakosh.ch/", deps, ...overrides };
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
      "create_checkout",
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

  it("get_pricing returns the two CHF plans and the online platform fee", async () => {
    const r = await call("get_pricing");
    const sc = r.structuredContent as {
      currency: string;
      freeTrialDays: number;
      plans: {
        id: string;
        pricePerMonth: number;
        onlineFeePercent: number;
        aiPhotoAllowancePerMonth: number | null;
      }[];
      platformFee: { percent: number; proBreakEvenOnlineChfPerMonth: number };
    };
    expect(sc.currency).toBe("CHF");
    expect(sc.freeTrialDays).toBe(14);
    expect(sc.plans.map((p) => p.id)).toEqual(["free", "pro"]);
    // Free carries the 1% online/agent fee and a monthly AI taste; Pro is
    // fee-free with unmetered AI.
    const free = sc.plans.find((p) => p.id === "free")!;
    const pro = sc.plans.find((p) => p.id === "pro")!;
    expect(free.pricePerMonth).toBe(0);
    expect(free.onlineFeePercent).toBe(1);
    expect(free.aiPhotoAllowancePerMonth).toBeGreaterThan(0);
    expect(pro.onlineFeePercent).toBe(0);
    expect(pro.aiPhotoAllowancePerMonth).toBeNull();
    // The fee block explains the model to agents, break-even included.
    expect(sc.platformFee.percent).toBe(1);
    expect(sc.platformFee.proBreakEvenOnlineChfPerMonth).toBe(2500);
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

// ── Agent commerce (create_checkout) ──────────────────────────────────────────

describe("create_checkout — agents buying from the merchant directly", () => {
  const product = makeProduct({ id: 1, name: "Perlenkette" });

  async function call(args: unknown, ctx = buildCtx([product])) {
    const res = await handleMcpMessage(
      req("tools/call", { name: "create_checkout", arguments: args }),
      ctx,
    );
    return res?.result as {
      isError?: boolean;
      structuredContent?: Record<string, unknown>;
      content: { text: string }[];
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    resetMcpRateLimits();
    createCheckout.mockResolvedValue(checkoutOk);
  });

  it("returns a payment link for the buyer, not a completed purchase", async () => {
    const result = await call({ product_ids: [1] });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      checkoutUrl: "https://checkout.stripe.com/cs_agent_1",
      currency: "CHF",
      itemsSubtotal: "65.00",
      expiresInMinutes: 30,
    });
    // The agent is told shipping is still to come — the subtotal is not a total.
    expect(result.structuredContent!.note).toMatch(/Shipping is chosen/i);
  });

  it("always attributes the sale to the agent channel", async () => {
    await call({ product_ids: [1] });
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "agent", productIds: [1] }),
    );
  });

  it("creates the checkout on the merchant's own account, via the same service as the web cart", async () => {
    await call({ product_ids: [1] });
    const arg = createCheckout.mock.calls[0][0];
    expect(arg.tenant).toBe(tenant);
    expect(arg.baseUrl).toBe("https://kalakosh.ch");
  });

  it("surfaces a sold-out race as a readable tool error", async () => {
    createCheckout.mockRejectedValue(
      new CheckoutError("CONFLICT", "Already sold: Perlenkette."),
    );
    const result = await call({ product_ids: [1] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Already sold/);
  });

  it("surfaces a store that hasn't connected payments yet", async () => {
    createCheckout.mockRejectedValue(
      new CheckoutError(
        "NOT_CONNECTED",
        "This store hasn't connected online payments yet. Please enquire via WhatsApp.",
      ),
    );
    const result = await call({ product_ids: [1] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/hasn't connected online payments/);
  });

  it("does not leak internal failures to the agent", async () => {
    createCheckout.mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.5:3306"),
    );
    const result = await call({ product_ids: [1] });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toMatch(/ECONNREFUSED|3306/);
  });

  it("validates product_ids before touching checkout", async () => {
    for (const bad of [
      {},
      { product_ids: [] },
      { product_ids: "1" },
      { product_ids: [0] },
      { product_ids: [-3] },
      { product_ids: [1.5] },
      { product_ids: ["abc"] },
    ]) {
      const result = await call(bad);
      expect(result.isError).toBe(true);
    }
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("refuses a cart larger than the shared maximum", async () => {
    const result = await call({
      product_ids: Array.from({ length: 51 }, (_, i) => i + 1),
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/at most 50/);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("rate limits a looping agent so it cannot hold the whole catalogue", async () => {
    const ctx = buildCtx([product], { clientKey: "203.0.113.9" });
    for (let i = 0; i < 10; i++) {
      expect((await call({ product_ids: [1] }, ctx)).isError).toBeUndefined();
    }
    const blocked = await call({ product_ids: [1] }, ctx);
    expect(blocked.isError).toBe(true);
    expect(blocked.content[0].text).toMatch(/Too many checkouts/);
    expect(createCheckout).toHaveBeenCalledTimes(10);
  });

  it("does not let one caller's limit block a different buyer", async () => {
    const noisy = buildCtx([product], { clientKey: "203.0.113.9" });
    for (let i = 0; i < 11; i++) await call({ product_ids: [1] }, noisy);

    const other = buildCtx([product], { clientKey: "198.51.100.4" });
    expect((await call({ product_ids: [1] }, other)).isError).toBeUndefined();
  });
});

describe("get_store_info — buyability", () => {
  async function storeInfo(ctx: McpContext) {
    const res = await handleMcpMessage(
      req("tools/call", { name: "get_store_info", arguments: {} }),
      ctx,
    );
    return (res?.result as { structuredContent: Record<string, unknown> })
      .structuredContent;
  }

  it("tells an agent it can buy when the merchant has connected Stripe", async () => {
    const info = await storeInfo(buildCtx([]));
    expect(info.canBuyHere).toBe(true);
    expect(info.checkout).toMatch(/create_checkout/);
  });

  it("tells an agent to buy elsewhere when the merchant has not", async () => {
    const info = await storeInfo(
      buildCtx([], {
        tenant: { ...tenant, stripeConnectedAccountId: null } as Tenant,
      }),
    );
    expect(info.canBuyHere).toBe(false);
    expect(info.checkout).toMatch(/in person|contacting the merchant/i);
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
