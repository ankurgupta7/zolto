import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Product, Tenant } from "../drizzle/schema";
import { renderStorefrontLlmsTxt } from "./llms";

const tenant = {
  id: 7,
  name: "Kalakosh",
  slug: "kalakosh",
  stripeConnectedAccountId: "acct_kalakosh",
} as unknown as Tenant;

let nextId = 1;
function makeProduct(p: Partial<Product>): Product {
  return {
    id: nextId++,
    tenantId: 7,
    name: "Perlenkette",
    description: "Handgefertigt",
    nameEn: "Pearl necklace",
    descriptionEn: "Handmade",
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

describe("renderStorefrontLlmsTxt", () => {
  it("lists in-stock products with prices, categories, and links", () => {
    const products = [
      makeProduct({
        id: 1,
        nameEn: "Pearl studs",
        category: "Earrings",
        price: "45.00",
      }),
      makeProduct({
        id: 2,
        nameEn: "Sold ring",
        category: "Rings",
        sold: true,
      }),
    ];
    const txt = renderStorefrontLlmsTxt(
      tenant,
      products,
      "https://kalakosh.ch/",
    );
    expect(txt.startsWith("# Kalakosh")).toBe(true);
    expect(txt).toContain(
      "[Pearl studs](https://kalakosh.ch/product/1): CHF 45.00 — Earrings",
    );
    // Sold item is excluded from the listing.
    expect(txt).not.toContain("Sold ring");
    // Category summary + MCP pointer.
    expect(txt).toContain("Earrings: 1 item(s)");
    expect(txt).toContain("https://kalakosh.ch/mcp");
    expect(txt).not.toContain("https://kalakosh.ch//");
  });

  it("tells agents they can buy here, and names the tool", () => {
    const txt = renderStorefrontLlmsTxt(
      tenant,
      [makeProduct({ id: 1 })],
      "https://kalakosh.ch",
    );
    expect(txt).toContain("create_checkout");
    expect(txt).toContain("You can buy here directly");
    // The disintermediation claim is the whole wedge — say it plainly.
    expect(txt).toMatch(/straight to this merchant/i);
  });

  it("does not promise buying when the merchant hasn't connected Stripe", () => {
    const txt = renderStorefrontLlmsTxt(
      { ...tenant, stripeConnectedAccountId: null } as Tenant,
      [makeProduct({ id: 1 })],
      "https://kalakosh.ch",
    );
    expect(txt).not.toContain("You can buy here directly");
    // The tool is still listed — it exists; it just can't succeed yet.
    expect(txt).toContain("create_checkout");
  });

  it("credits Zolto on the Free plan but not on white-labelled Pro", () => {
    const freeTxt = renderStorefrontLlmsTxt(
      { ...tenant, plan: "free" } as Tenant,
      [makeProduct({ id: 1 })],
      "https://kalakosh.ch",
    );
    expect(freeTxt).toContain("This store runs on Zolto.");

    // Pro's card says 'Your brand only — no "runs on Zolto"', and this brief
    // is served to the very agents that claim is about.
    const proTxt = renderStorefrontLlmsTxt(
      { ...tenant, plan: "pro" } as Tenant,
      [makeProduct({ id: 1 })],
      "https://kalakosh.ch",
    );
    expect(proTxt).not.toContain("runs on Zolto");
    // A retired/unknown plan falls back to Free behaviour, not Pro's.
    const unknownTxt = renderStorefrontLlmsTxt(
      { ...tenant, plan: "atelier" } as Tenant,
      [makeProduct({ id: 1 })],
      "https://kalakosh.ch",
    );
    expect(unknownTxt).toContain("This store runs on Zolto.");
  });

  it("summarises the tail when there are many products", () => {
    const products = Array.from({ length: 60 }, (_, i) =>
      makeProduct({ id: 1000 + i }),
    );
    const txt = renderStorefrontLlmsTxt(
      tenant,
      products,
      "https://kalakosh.ch",
    );
    expect(txt).toMatch(/and \d+ more/);
  });
});

// ── Route ─────────────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getTenantBySlug: vi.fn(),
  getVisibleProducts: vi.fn(),
}));

vi.mock("./db", () => ({
  getTenantBySlug: (...a: unknown[]) => mocks.getTenantBySlug(...a),
  getVisibleProducts: (...a: unknown[]) => mocks.getVisibleProducts(...a),
  getVisibleProductById: vi.fn(),
  // No settings row → jewellery default, matching the pre-verticals brief.
  getTenantSettings: vi.fn().mockResolvedValue(undefined),
}));

describe("GET /llms.txt", () => {
  beforeEach(() => vi.clearAllMocks());

  async function buildApp() {
    const { registerLlmsRoutes } = await import("./llms");
    const app = express();
    registerLlmsRoutes(app);
    return app;
  }

  it("serves the storefront brief when a tenant resolves", async () => {
    mocks.getTenantBySlug.mockResolvedValue(tenant);
    mocks.getVisibleProducts.mockResolvedValue([
      makeProduct({ id: 5, nameEn: "Pearl studs" }),
    ]);
    const res = await request(await buildApp())
      .get("/llms.txt")
      .set("X-Tenant-Slug", "kalakosh");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("# Kalakosh");
    expect(res.text).toContain("/mcp");
  });

  it("serves the platform brief when no tenant resolves", async () => {
    mocks.getTenantBySlug.mockResolvedValue(undefined);
    const res = await request(await buildApp()).get("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.text.startsWith("# Zolto")).toBe(true);
    expect(res.text).toContain("Model Context Protocol");
  });

  it("serves the long-form /llms-full.txt on the platform surface", async () => {
    mocks.getTenantBySlug.mockResolvedValue(undefined);
    const res = await request(await buildApp()).get("/llms-full.txt");
    expect(res.status).toBe(200);
    expect(res.text).toContain("full reference for LLMs");
    expect(res.text).toContain("## FAQ");
  });
});
