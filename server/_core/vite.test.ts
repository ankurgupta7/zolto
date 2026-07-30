import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import request from "supertest";

// Stand in for the real head rewriter so these tests assert the *wiring*
// (which path the SPA fallback sees, and whether it runs at all) rather than
// the SEO content, which is covered by marketingSeo.test.ts.
vi.mock("../htmlHead", () => ({
  injectHeadForRequest: vi.fn(async (req: { path: string }, html: string) =>
    html.replace("__HEAD__", `<title>seen:${req.path}</title>`),
  ),
}));

const { serveStatic } = await import("./vite");

// serveStatic derives its build directory from import.meta.dirname. Under
// NODE_ENV=development that resolves to <repo>/dist/public, so lay a fixture
// build down there and take it back out afterwards.
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DIST_PUBLIC = path.resolve(REPO_ROOT, "dist", "public");
const INDEX_HTML = path.resolve(DIST_PUBLIC, "index.html");
const ASSET = path.resolve(DIST_PUBLIC, "asset.js");

const SHELL = "<!doctype html><html><head>__HEAD__</head><body></body></html>";

let savedNodeEnv: string | undefined;
let createdDist = false;

beforeAll(() => {
  savedNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  createdDist = !fs.existsSync(path.resolve(REPO_ROOT, "dist"));
  fs.mkdirSync(DIST_PUBLIC, { recursive: true });
  fs.writeFileSync(INDEX_HTML, SHELL);
  fs.writeFileSync(ASSET, "console.log('built asset');");
});

afterAll(() => {
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
  fs.rmSync(INDEX_HTML, { force: true });
  fs.rmSync(ASSET, { force: true });
  if (createdDist)
    fs.rmSync(path.resolve(REPO_ROOT, "dist"), {
      recursive: true,
      force: true,
    });
});

function buildApp() {
  const app = express();
  serveStatic(app);
  return app;
}

describe("serveStatic — SPA fallback wiring", () => {
  // Regression: express.static defaults to index:"index.html", so "/" used to
  // be served straight off disk and never reached the head rewriter. The
  // marketing homepage shipped with no title/canonical/JSON-LD/noscript.
  it("routes the apex through the head rewriter instead of serving the raw build", async () => {
    const res = await request(buildApp()).get("/");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>seen:/</title>");
    expect(res.text).not.toContain("__HEAD__");
  });

  // Regression: mounting at "*" made Express strip the matched mount from
  // req.url, so req.path was "/" for every request and every route rendered
  // the homepage's SEO with canonical=/.
  it.each([
    "/pricing",
    "/signup",
    "/blog",
    "/blog/launch-diary-1",
    "/legal/privacy",
  ])("passes the real path through for %s", async (route) => {
    const res = await request(buildApp()).get(route);

    expect(res.status).toBe(200);
    expect(res.text).toContain(`<title>seen:${route}</title>`);
  });

  it("gives each route a distinct head rather than collapsing them onto /", async () => {
    const app = buildApp();
    const [home, pricing, post] = await Promise.all([
      request(app).get("/"),
      request(app).get("/pricing"),
      request(app).get("/blog/launch-diary-1"),
    ]);

    const heads = [home.text, pricing.text, post.text];
    expect(new Set(heads).size).toBe(3);
  });

  it("keeps the query string out of the path it reports", async () => {
    const res = await request(buildApp()).get("/pricing?ref=twitter");

    expect(res.text).toContain("<title>seen:/pricing</title>");
  });

  it("still serves real build assets straight from disk", async () => {
    const res = await request(buildApp()).get("/asset.js");

    expect(res.status).toBe(200);
    expect(res.text).toContain("built asset");
    // Served by express.static, so it is untouched by the head rewriter.
    expect(res.text).not.toContain("seen:");
  });

  it("serves the SPA shell for unknown deep routes", async () => {
    const res = await request(buildApp()).get("/some/deep/unknown/route");

    expect(res.status).toBe(200);
    expect(res.text).toContain("<title>seen:/some/deep/unknown/route</title>");
  });
});
