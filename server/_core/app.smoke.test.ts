import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { Express } from "express";
import request from "supertest";
import { createApp } from "./app";

// End-to-end smoke test: boots the REAL Express app assembled by createApp()
// (every router, proxy, webhook and the tRPC adapter wired exactly as in
// production) and drives it over HTTP with supertest. No database is
// configured, so reads degrade to their fallbacks — this verifies the whole
// surface is wired and responds, not the individual business logic (that lives
// in the per-module unit tests).

const SAVED: Record<string, string | undefined> = {};
const ENV = {
  GOOGLE_CLIENT_ID: "smoke-client-id",
  GOOGLE_CLIENT_SECRET: "smoke-client-secret",
  JWT_SECRET: "a-smoke-jwt-secret-that-is-long-enough",
};

let app: Express;

beforeAll(async () => {
  for (const [k, v] of Object.entries(ENV)) {
    SAVED[k] = process.env[k];
    process.env[k] = v;
  }
  // No DATABASE_URL: the app must still boot and serve, degrading DB reads.
  SAVED.DATABASE_URL = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;

  app = await createApp();
});

afterAll(() => {
  for (const k of [...Object.keys(ENV), "DATABASE_URL"]) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

describe("app smoke: the server boots and assembles", () => {
  it("returns an Express app from createApp()", () => {
    expect(typeof app).toBe("function");
  });
});

describe("app smoke: SEO & agent discovery routes", () => {
  // These assert the *generated* documents, not just their shape. The repo
  // used to carry a client/public/robots.txt and sitemap.xml describing a
  // different site entirely; both satisfied "looks like robots text" / "looks
  // like a sitemap". Pin the details only the generator produces, so content
  // pointing at the wrong domain can't pass as correct again.
  it("serves the generated /robots.txt, welcoming AI crawlers", async () => {
    const res = await request(app).get("/robots.txt");
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/User-agent/i);
    expect(res.text).toContain("ClaudeBot");
    expect(res.text).toContain("/llms.txt");
    expect(res.text).toMatch(/^Sitemap: .*\/sitemap\.xml$/m);
    expect(res.text).not.toContain("kalakosh.ch");
  });

  it("serves the generated /sitemap.xml covering the marketing routes", async () => {
    const res = await request(app).get("/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("<urlset");
    expect(res.text).toContain("/pricing</loc>");
    expect(res.text).toContain("/blog</loc>");
    expect(res.text).not.toContain("kalakosh.ch");
  });

  it("serves /llms.txt", async () => {
    const res = await request(app).get("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.text.length).toBeGreaterThan(0);
  });
});

describe("app smoke: OAuth wiring", () => {
  it("redirects /api/oauth/login to the Google consent screen", async () => {
    const res = await request(app).get("/api/oauth/login");
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("accounts.google.com");
  });
});

describe("app smoke: Stripe webhook wiring (raw body before JSON parser)", () => {
  it("rejects an unconfigured/unsigned webhook with 400", async () => {
    const res = await request(app)
      .post("/api/stripe/webhook")
      .set("content-type", "application/json")
      .send("{}");
    expect(res.status).toBe(400);
  });
});

describe("app smoke: tRPC API is mounted", () => {
  it("answers a public query (auth.me) with a tRPC envelope", async () => {
    const res = await request(app).get("/api/trpc/auth.me");
    expect(res.status).toBe(200);
    // superjson-wrapped result; anonymous request => user is null
    expect(res.body).toMatchObject({ result: { data: { json: null } } });
  });

  it("runs a mutation through the JSON body parser (auth.logout)", async () => {
    const res = await request(app)
      .post("/api/trpc/auth.logout")
      .set("content-type", "application/json")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      result: { data: { json: { success: true } } },
    });
  });

  it("maps a tenant-guarded read to 404 when no tenant resolves", async () => {
    const res = await request(app).get("/api/trpc/products.list");
    expect(res.status).toBe(404);
    expect(res.body?.error?.json?.data?.code).toBe("NOT_FOUND");
  });
});

describe("app smoke: unknown routes 404 (no SPA catch-all in the API app)", () => {
  it("returns 404 for an unmapped path", async () => {
    const res = await request(app).get("/definitely-not-a-route");
    expect(res.status).toBe(404);
  });
});
