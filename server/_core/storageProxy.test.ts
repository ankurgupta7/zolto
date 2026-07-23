import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

const { ENV } = vi.hoisted(() => ({
  ENV: { forgeApiUrl: "", forgeApiKey: "" } as {
    forgeApiUrl: string;
    forgeApiKey: string;
  },
}));

vi.mock("./env", () => ({ ENV }));

import { registerStorageProxy } from "./storageProxy";

function makeApp() {
  const app = express();
  registerStorageProxy(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  ENV.forgeApiUrl = "https://forge.example";
  ENV.forgeApiKey = "forge-key";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerStorageProxy", () => {
  it("returns 500 when the proxy is not configured", async () => {
    ENV.forgeApiUrl = "";
    const res = await request(makeApp()).get("/manus-storage/some/key.png");
    expect(res.status).toBe(500);
    expect(res.text).toContain("not configured");
  });

  it("redirects to the presigned URL from the forge backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ url: "https://cdn.example/signed" }),
      })),
    );
    const res = await request(makeApp()).get("/manus-storage/some/key.png");
    expect(res.status).toBe(307);
    expect(res.headers.location).toBe("https://cdn.example/signed");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("returns 502 when the forge backend errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => "missing",
      })),
    );
    const res = await request(makeApp()).get("/manus-storage/some/key.png");
    expect(res.status).toBe(502);
    expect(res.text).toContain("Storage backend error");
  });

  it("returns 502 when the backend returns an empty URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ url: "" }) })),
    );
    const res = await request(makeApp()).get("/manus-storage/some/key.png");
    expect(res.status).toBe(502);
    expect(res.text).toContain("Empty signed URL");
  });

  it("returns 502 when the fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const res = await request(makeApp()).get("/manus-storage/some/key.png");
    expect(res.status).toBe(502);
    expect(res.text).toContain("Storage proxy error");
  });
});
