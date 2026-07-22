import { describe, expect, it, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerSeoRoutes } from "./seo";
import { STORY_SLUG } from "@shared/marketing";

function buildApp() {
  const app = express();
  registerSeoRoutes(app);
  return app;
}

const ORIGINAL_BASE_URL = process.env.PUBLIC_BASE_URL;

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
});
