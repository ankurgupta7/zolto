import { BRAND } from "@shared/brand";
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const dbMock = vi.hoisted(() => ({
  getTenantSettingsByDomain: vi.fn(),
  getTenantById: vi.fn(),
  getTenantBySlug: vi.fn(),
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
  delete process.env.SITE_DOMAIN;
  delete process.env.PUBLIC_BASE_URL;
  dbMock.getTenantSettingsByDomain.mockResolvedValue({ tenantId: 42 });
  dbMock.getTenantById.mockResolvedValue({ id: 42, plan: "pro" });
  dbMock.getTenantBySlug.mockResolvedValue(undefined);
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

describe(`GET /api/domain-ask — platform subdomains (blah.${BRAND.domain})`, () => {
  beforeEach(() => {
    process.env.SITE_DOMAIN = BRAND.domain;
  });

  it("derives the root domain from PUBLIC_BASE_URL over SITE_DOMAIN", async () => {
    // Alongside Kalakosh-ch: SITE_DOMAIN is unset/irrelevant (Gwinn's own
    // Caddy never runs), but PUBLIC_BASE_URL always points at the real
    // public host — the ask endpoint must key off that, not SITE_DOMAIN.
    delete process.env.SITE_DOMAIN;
    process.env.PUBLIC_BASE_URL = "https://gwinn.kalakosh.ch";
    dbMock.getTenantBySlug.mockResolvedValue({ id: 7, slug: "blah" });
    const res = await request(buildApp()).get(
      "/api/domain-ask?domain=blah.gwinn.kalakosh.ch",
    );
    expect(res.status).toBe(200);
    expect(dbMock.getTenantBySlug).toHaveBeenCalledWith("blah");
  });

  it("answers 200 for a subdomain matching a real tenant slug, no plan gate", async () => {
    dbMock.getTenantBySlug.mockResolvedValue({ id: 7, slug: "blah" });
    const res = await request(buildApp()).get(
      `/api/domain-ask?domain=blah.${BRAND.domain}`,
    );
    expect(res.status).toBe(200);
    expect(dbMock.getTenantBySlug).toHaveBeenCalledWith("blah");
    expect(dbMock.getTenantById).not.toHaveBeenCalled();
    expect(dbMock.getTenantSettingsByDomain).not.toHaveBeenCalled();
  });

  it("404s a subdomain with no matching tenant", async () => {
    dbMock.getTenantBySlug.mockResolvedValue(undefined);
    const res = await request(buildApp()).get(
      `/api/domain-ask?domain=nosuchtenant.${BRAND.domain}`,
    );
    expect(res.status).toBe(404);
  });

  // Regression: this used to 404, which meant Caddy refused to issue a
  // certificate for www.gwinn.ch and aborted every handshake with a TLS
  // internal error. The hostname was unreachable — crawlers reported the
  // whole site as down — even though the Caddyfile only wanted to redirect it.
  it("allows www without a tenant lookup, so its cert can be issued", async () => {
    const res = await request(buildApp()).get(
      `/api/domain-ask?domain=www.${BRAND.domain}`,
    );
    expect(res.status).toBe(200);
    expect(dbMock.getTenantBySlug).not.toHaveBeenCalled();
  });

  it("does not allow a www-prefixed deeper subdomain", async () => {
    const res = await request(buildApp()).get(
      `/api/domain-ask?domain=www.blah.${BRAND.domain}`,
    );
    expect(res.status).toBe(404);
    expect(dbMock.getTenantBySlug).not.toHaveBeenCalled();
  });

  it("404s deeper subdomains without a tenant lookup", async () => {
    const res = await request(buildApp()).get(
      `/api/domain-ask?domain=a.b.${BRAND.domain}`,
    );
    expect(res.status).toBe(404);
    expect(dbMock.getTenantBySlug).not.toHaveBeenCalled();
  });

  it("still handles an unrelated custom domain when SITE_DOMAIN is set", async () => {
    const res = await request(buildApp()).get(
      "/api/domain-ask?domain=shop.example.com",
    );
    expect(res.status).toBe(200);
    expect(dbMock.getTenantSettingsByDomain).toHaveBeenCalledWith(
      "shop.example.com",
    );
    expect(dbMock.getTenantBySlug).not.toHaveBeenCalled();
  });
});
