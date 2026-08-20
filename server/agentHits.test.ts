import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const recordAgentHit = vi.fn(async () => {});
const resolveTenantFromRequest = vi.fn(
  async () => null as { id: number } | null,
);

vi.mock("./db", () => ({
  recordAgentHit: (...a: unknown[]) => recordAgentHit(...(a as [])),
}));
vi.mock("./tenantResolve", () => ({
  resolveTenantFromRequest: (...a: unknown[]) =>
    resolveTenantFromRequest(...(a as [])),
}));

const {
  mcpToolFromBody,
  noteAgentHit,
  registerAgentHitTracking,
  shouldCount,
  PLATFORM_TENANT_ID,
} = await import("./agentHits");

/**
 * The middleware records on `res.on("finish")`, which fires after supertest's
 * promise resolves. Yielding to the macrotask queue lets the listener and its
 * async body run before we assert.
 */
const settle = () => new Promise((r) => setTimeout(r, 0));

function appWith(routes: (app: express.Express) => void) {
  const app = express();
  app.use(express.json());
  registerAgentHitTracking(app);
  routes(app);
  return app;
}

const GPTBOT =
  "Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const BROWSER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

beforeEach(() => {
  recordAgentHit.mockClear();
  resolveTenantFromRequest.mockReset();
  resolveTenantFromRequest.mockResolvedValue(null);
});

describe("mcpToolFromBody", () => {
  it("names the tool on a tools/call", () => {
    expect(
      mcpToolFromBody({
        method: "tools/call",
        params: { name: "create_checkout" },
      }),
    ).toBe("create_checkout");
  });

  it("returns the empty sentinel for the non-tool MCP methods", () => {
    for (const method of ["initialize", "tools/list", "ping"]) {
      expect(mcpToolFromBody({ method })).toBe("");
    }
  });

  it("survives every shape a hostile body can take", () => {
    // This runs before the MCP handler validates anything, on a public
    // endpoint, so "malformed" is the expected case rather than the odd one.
    for (const body of [
      undefined,
      null,
      "a string",
      42,
      [],
      { method: "tools/call" },
      { method: "tools/call", params: null },
      { method: "tools/call", params: "nope" },
      { method: "tools/call", params: { name: 123 } },
      { method: { nested: "object" } },
    ]) {
      expect(mcpToolFromBody(body)).toBe("");
    }
  });

  it("bounds and sanitises an attacker-chosen tool name", () => {
    // The value is echoed into the admin panel and stored in a varchar(64).
    const long = mcpToolFromBody({
      method: "tools/call",
      params: { name: "x".repeat(200) },
    });
    expect(long.length).toBe(64);
    expect(
      mcpToolFromBody({
        method: "tools/call",
        params: { name: "<script>alert(1)</script>" },
      }),
    ).toBe("scriptalert1script");
  });
});

describe("shouldCount", () => {
  it("counts a named agent even when it looks like a browser", () => {
    // Several on-demand fetchers ship a browser-shaped User-Agent.
    expect(shouldCount("ChatGPT", `${BROWSER} ChatGPT-User/1.0`)).toBe(true);
  });

  it("does not count an ordinary browser", () => {
    // /robots.txt and /sitemap.xml get real human traffic; counting a curious
    // shopper as agent reach would inflate the one number this reports.
    expect(shouldCount("Other", BROWSER)).toBe(false);
  });

  it("counts an unnamed non-browser caller", () => {
    expect(shouldCount("Other", "curl/8.4.0")).toBe(true);
    expect(shouldCount("Other", undefined)).toBe(true);
  });
});

describe("noteAgentHit", () => {
  it("writes the classified bucket", async () => {
    await noteAgentHit({
      tenantId: 7,
      surface: "llms.txt",
      mcpTool: "",
      userAgent: GPTBOT,
      now: new Date("2026-08-14T09:00:00Z"),
    });
    expect(recordAgentHit).toHaveBeenCalledWith({
      tenantId: 7,
      day: "2026-08-14",
      surface: "llms.txt",
      mcpTool: "",
      agent: "GPTBot",
    });
  });

  it("stores no raw User-Agent — only the label", async () => {
    await noteAgentHit({
      tenantId: 7,
      surface: "mcp",
      mcpTool: "search_products",
      userAgent: GPTBOT,
    });
    const written = JSON.stringify(recordAgentHit.mock.calls[0]?.[0]);
    expect(written).not.toContain("openai.com/gptbot");
    expect(written).not.toContain("Mozilla");
  });

  it("skips a browser entirely", async () => {
    await noteAgentHit({
      tenantId: 7,
      surface: "robots.txt",
      mcpTool: "",
      userAgent: BROWSER,
    });
    expect(recordAgentHit).not.toHaveBeenCalled();
  });
});

describe("registerAgentHitTracking", () => {
  it("counts a storefront llms.txt fetch against that store", async () => {
    resolveTenantFromRequest.mockResolvedValue({ id: 42 });
    const app = appWith((a) => a.get("/llms.txt", (_q, r) => r.send("# shop")));

    await request(app).get("/llms.txt").set("User-Agent", GPTBOT).expect(200);
    await settle();

    expect(recordAgentHit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 42,
        surface: "llms.txt",
        agent: "GPTBot",
      }),
    );
  });

  it("files an apex hit under the platform sentinel, not a store", async () => {
    resolveTenantFromRequest.mockResolvedValue(null);
    const app = appWith((a) =>
      a.get("/llms.txt", (_q, r) => r.send("# gwinn")),
    );

    await request(app).get("/llms.txt").set("User-Agent", GPTBOT).expect(200);
    await settle();

    expect(recordAgentHit).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: PLATFORM_TENANT_ID }),
    );
  });

  it("names the MCP tool an agent called", async () => {
    resolveTenantFromRequest.mockResolvedValue({ id: 42 });
    const app = appWith((a) => a.post("/mcp", (_q, r) => r.json({ ok: true })));

    await request(app)
      .post("/mcp")
      .set("User-Agent", "Claude-User/1.0")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "create_checkout" },
      })
      .expect(200);
    await settle();

    expect(recordAgentHit).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "mcp",
        mcpTool: "create_checkout",
        agent: "Claude",
      }),
    );
  });

  it("ignores every path that is not a machine surface", async () => {
    const app = appWith((a) => {
      a.get("/shop", (_q, r) => r.send("shop"));
      a.get("/api/trpc/products.list", (_q, r) => r.json([]));
    });

    await request(app).get("/shop").set("User-Agent", GPTBOT).expect(200);
    await request(app)
      .get("/api/trpc/products.list")
      .set("User-Agent", GPTBOT)
      .expect(200);
    await settle();

    expect(recordAgentHit).not.toHaveBeenCalled();
  });

  it("does not count an error response as reach", async () => {
    // A 429 from the checkout limiter or a 404 from an unresolvable host is
    // interest the store never actually received.
    const app = appWith((a) =>
      a.post("/mcp", (_q, r) => r.status(429).json({ error: "slow down" })),
    );

    await request(app)
      .post("/mcp")
      .set("User-Agent", GPTBOT)
      .send({ method: "tools/call", params: { name: "create_checkout" } })
      .expect(429);
    await settle();

    expect(recordAgentHit).not.toHaveBeenCalled();
  });

  it("still serves the page when recording throws", async () => {
    // The rule this whole module is built around: measuring the endpoint an
    // agent buys through must never be a reason it fails.
    recordAgentHit.mockRejectedValueOnce(new Error("database is on fire"));
    resolveTenantFromRequest.mockResolvedValue({ id: 42 });
    const app = appWith((a) => a.get("/llms.txt", (_q, r) => r.send("# shop")));

    const res = await request(app).get("/llms.txt").set("User-Agent", GPTBOT);
    await settle();

    expect(res.status).toBe(200);
    expect(res.text).toBe("# shop");
  });

  it("still serves the page when tenant resolution throws", async () => {
    resolveTenantFromRequest.mockRejectedValueOnce(new Error("no database"));
    const app = appWith((a) => a.get("/llms.txt", (_q, r) => r.send("# shop")));

    const res = await request(app).get("/llms.txt").set("User-Agent", GPTBOT);
    await settle();

    expect(res.status).toBe(200);
    expect(recordAgentHit).not.toHaveBeenCalled();
  });

  it("does not resolve a tenant before the response is sent", async () => {
    // Rule 1: the lookup happens on finish, so it cannot add latency to /mcp.
    resolveTenantFromRequest.mockResolvedValue({ id: 42 });
    let resolvedDuringHandler = false;
    const app = appWith((a) =>
      a.get("/llms.txt", (_q, r) => {
        resolvedDuringHandler = resolveTenantFromRequest.mock.calls.length > 0;
        r.send("# shop");
      }),
    );

    await request(app).get("/llms.txt").set("User-Agent", GPTBOT).expect(200);
    await settle();

    expect(resolvedDuringHandler).toBe(false);
    expect(resolveTenantFromRequest).toHaveBeenCalledTimes(1);
  });
});
