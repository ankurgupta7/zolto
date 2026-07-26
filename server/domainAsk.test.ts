import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const dbMock = vi.hoisted(() => ({
  getTenantSettingsByDomain: vi.fn(),
  getTenantById: vi.fn(),
}));

vi.mock("./db", () => dbMock);

import { registerDomainAsk } from "./domainAsk";

function buildApp() {
  const app = express();
  registerDomainAsk(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.getTenantSettingsByDomain.mockResolvedValue({ tenantId: 42 });
  dbMock.getTenantById.mockResolvedValue({ id: 42, plan: "maker" });
});

describe("GET /api/domain-ask (Caddy on-demand TLS)", () => {
  it("answers 200 for a registered domain on a custom-domain plan", async () => {
    const res = await request(buildApp()).get(
      "/api/domain-ask?domain=shop.example.com",
    );
    expect(res.status).toBe(200);
    expect(dbMock.getTenantSettingsByDomain).toHaveBeenCalledWith(
      "shop.example.com",
    );
  });

  it("404s for unregistered domains (no cert minting for strangers)", async () => {
    dbMock.getTenantSettingsByDomain.mockResolvedValue(undefined);
    const res = await request(buildApp()).get(
      "/api/domain-ask?domain=evil.example.com",
    );
    expect(res.status).toBe(404);
  });

  it("403s when the tenant downgraded off custom domains", async () => {
    dbMock.getTenantById.mockResolvedValue({ id: 42, plan: "free" });
    const res = await request(buildApp()).get(
      "/api/domain-ask?domain=shop.example.com",
    );
    expect(res.status).toBe(403);
  });

  it("400s malformed hostnames without hitting the DB", async () => {
    const res = await request(buildApp()).get(
      "/api/domain-ask?domain=https://x",
    );
    expect(res.status).toBe(400);
    expect(dbMock.getTenantSettingsByDomain).not.toHaveBeenCalled();
  });

  it("normalizes case", async () => {
    await request(buildApp()).get("/api/domain-ask?domain=Shop.Example.COM");
    expect(dbMock.getTenantSettingsByDomain).toHaveBeenCalledWith(
      "shop.example.com",
    );
  });
});
