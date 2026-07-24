import { describe, expect, it, vi, beforeAll, afterAll } from "vitest";
import type { Express } from "express";
import request from "supertest";

// A storefront happy-path e2e: unlike app.smoke.test.ts (which runs with no
// database and asserts graceful degradation), this boots the real app with the
// DB boundary mocked so a tenant RESOLVES and real data flows end to end:
//   HTTP request → express → tRPC adapter → createContext (tenant resolution)
//   → products router → db read → JSON response.

const { findFirst, getVisibleProducts, getUserByOpenId, getDb } = vi.hoisted(
  () => ({
    findFirst: vi.fn(),
    getVisibleProducts: vi.fn(),
    getUserByOpenId: vi.fn(),
    getDb: vi.fn(),
  }),
);

// The db module is imported across many routers; keep every real export and
// override only the boundary this e2e drives: connection warm-up, the auth
// lookup, the tenant-resolution proxy, and the storefront product read.
vi.mock("../db", async (importActual) => {
  const actual = await importActual<typeof import("../db")>();
  return {
    ...actual,
    getDb,
    getUserByOpenId,
    getVisibleProducts,
    db: { query: { tenants: { findFirst } } },
  };
});

import { createApp } from "./app";

const TENANT = { id: 7, slug: "aurora", plan: "growth", name: "Aurora" };
const PRODUCTS = [
  { id: 1, name: "Mondstein-Ring", category: "Rings", price: "185.00" },
  { id: 2, name: "Perlen-Kollier", category: "Necklaces", price: "240.00" },
];

let app: Express;

beforeAll(async () => {
  getDb.mockResolvedValue({});
  getUserByOpenId.mockResolvedValue(undefined); // anonymous visitor
  findFirst.mockResolvedValue(TENANT);
  getVisibleProducts.mockResolvedValue(PRODUCTS);
  app = await createApp();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("storefront e2e (tenant resolves, data flows)", () => {
  it("resolves the tenant from X-Tenant-Slug and returns its visible products", async () => {
    const res = await request(app)
      .get("/api/trpc/products.list")
      .set("X-Tenant-Slug", "aurora");

    expect(res.status).toBe(200);
    const products = res.body.result.data.json;
    expect(products.map((p: { id: number }) => p.id)).toEqual([1, 2]);
    // The read was scoped to the resolved tenant, not a hard-coded default.
    expect(getVisibleProducts).toHaveBeenCalledWith(7);
  });

  it("applies the category filter passed as a tRPC input", async () => {
    const input = encodeURIComponent(
      JSON.stringify({ json: { category: "Rings" } }),
    );
    const res = await request(app)
      .get(`/api/trpc/products.list?input=${input}`)
      .set("X-Tenant-Slug", "aurora");

    expect(res.status).toBe(200);
    const products = res.body.result.data.json;
    expect(products).toHaveLength(1);
    expect(products[0].category).toBe("Rings");
  });

  it("still 404s a storefront read when the slug matches no tenant", async () => {
    // Miss on both the header lookup and the subdomain fallback.
    findFirst.mockReset();
    findFirst.mockResolvedValue(undefined);
    const res = await request(app)
      .get("/api/trpc/products.list")
      .set("X-Tenant-Slug", "ghost");
    expect(res.status).toBe(404);
  });
});
