import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { Product, Tenant } from "../drizzle/schema";
import { renderStorefrontLlmsTxt } from "./llms";

const tenant = {
  id: 7,
  name: "Kalakosh",
  slug: "kalakosh",
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
});
