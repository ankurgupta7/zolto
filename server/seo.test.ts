import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { registerSeoRoutes } from "./seo";
import { STORY_SLUG } from "@shared/marketing";

/**
 * Tenant resolution is mocked per-test: `null` exercises the platform apex
 * (marketing sitemap), a tenant object exercises the storefront path.
 */
const resolved: { tenant: { id: number; name: string } | null } = {
  tenant: null,
};
const visibleProducts = vi.fn(async () => [] as unknown[]);

vi.mock("./tenantResolve", () => ({
  resolveTenantFromRequest: async () => resolved.tenant,
}));

vi.mock("./db", () => ({
  getVisibleProducts: (id: number) => visibleProducts(id),
}));

function buildApp() {
  const app = express();
  registerSeoRoutes(app);
  return app;
}

const ORIGINAL_BASE_URL = process.env.PUBLIC_BASE_URL;

beforeEach(() => {
  resolved.tenant = null;
  visibleProducts.mockResolvedValue([]);
});

afterEach(() => {
  if (ORIGINAL_BASE_URL === undefined) {
    delete process.env.PUBLIC_BASE_URL;
  } else {
    process.env.PUBLIC_BASE_URL = ORIGINAL_BASE_URL;
  }
});

describe("GET /sitemap.xml", () => {
  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = "https://zolto.com";
  });

  it("serves XML with the configured base URL", async () => {
    const res = await request(buildApp()).get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("xml");
    expect(res.text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(res.text).toContain("<loc>https://zolto.com/</loc>");
    expect(res.text).toContain(
      "<loc>https://zolto.com/blog/launch-diary-1</loc>",
    );
    expect(res.text).toContain(
      `<loc>https://zolto.com/stories/${STORY_SLUG}</loc>`,
    );
  });

  it("sets a cache header", async () => {
    const res = await request(buildApp()).get("/sitemap.xml");
    expect(res.headers["cache-control"]).toContain("max-age");
  });
});

describe("GET /sitemap.xml without PUBLIC_BASE_URL", () => {
  beforeEach(() => {
    delete process.env.PUBLIC_BASE_URL;
  });

  it("falls back to the request host", async () => {
    const res = await request(buildApp())
      .get("/sitemap.xml")
      .set("Host", "example.test");
    expect(res.status).toBe(200);
    expect(res.text).toContain("example.test");
  });
});

describe("GET /robots.txt", () => {
  beforeEach(() => {
    process.env.PUBLIC_BASE_URL = "https://zolto.com";
  });

  it("serves plain text pointing at the sitemap", async () => {
    const res = await request(buildApp()).get("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.text).toContain("User-agent: *");
    expect(res.text).toContain("Sitemap: https://zolto.com/sitemap.xml");
  });

  it("repeats the disallow list inside each AI-crawler group", () => {
    // A robots.txt agent obeys only its most specific matching group, so a bare
    // "Allow: /" under User-agent: GPTBot would exempt it from the * disallows.
    return request(buildApp())
      .get("/robots.txt")
      .then((res) => {
        const gptbot = res.text
          .split("User-agent: GPTBot")[1]
          .split("User-agent:")[0];
        expect(gptbot).toContain("Disallow: /signin");
      });
  });
});

describe("storefront surface", () => {
  beforeEach(() => {
    // PUBLIC_BASE_URL names the *platform* origin; a storefront must ignore it
    // and use its own host, or every store would advertise zolto.com URLs.
    process.env.PUBLIC_BASE_URL = "https://zolto.com";
    resolved.tenant = { id: 42, name: "Aurora Atelier" };
  });

  it("serves the store's own sitemap, not the marketing one", async () => {
    visibleProducts.mockResolvedValue([
      {
        id: 3,
        name: "Pearl Drops",
        nameEn: null,
        description: "Pearls",
        descriptionEn: null,
        price: "89.00",
        category: "Earrings",
        imageUrl: "https://cdn.test/3.jpg",
        sold: false,
        quantity: 2,
        updatedAt: new Date("2026-05-06T00:00:00Z"),
      },
    ]);

    const res = await request(buildApp())
      .get("/sitemap.xml")
      .set("Host", "aurora.zolto.ch");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<loc>http://aurora.zolto.ch/</loc>");
    expect(res.text).toContain("<loc>http://aurora.zolto.ch/product/3</loc>");
    expect(res.text).toContain("<lastmod>2026-05-06</lastmod>");
    // The regression this guards: marketing URLs 404 on a storefront host.
    expect(res.text).not.toContain("/pricing");
    expect(res.text).not.toContain("/blog");
    expect(res.text).not.toContain("zolto.com");
  });

  it("omits sold-out products from the sitemap", async () => {
    visibleProducts.mockResolvedValue([
      {
        id: 4,
        name: "Gone",
        nameEn: null,
        description: "d",
        descriptionEn: null,
        price: "10.00",
        category: "Rings",
        imageUrl: null,
        sold: true,
        quantity: 0,
        updatedAt: null,
      },
    ]);

    const res = await request(buildApp())
      .get("/sitemap.xml")
      .set("Host", "aurora.zolto.ch");
    expect(res.text).not.toContain("/product/4");
  });

  it("points robots.txt at the store's own sitemap and blocks checkout", async () => {
    const res = await request(buildApp())
      .get("/robots.txt")
      .set("Host", "aurora.zolto.ch");

    expect(res.text).toContain("Sitemap: http://aurora.zolto.ch/sitemap.xml");
    expect(res.text).toContain("Disallow: /checkout");
    expect(res.text).toContain("Disallow: /admin");
    expect(res.text).not.toContain("zolto.com");
  });
});
