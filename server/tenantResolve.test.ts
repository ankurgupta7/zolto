import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dbMock = vi.hoisted(() => ({
  getTenantBySlug: vi.fn(),
  getTenantByCustomDomain: vi.fn(),
}));

vi.mock("./db", () => dbMock);

import {
  resolveTenantForHost,
  resolveTenantFromRequest,
} from "./tenantResolve";
import type { Request } from "express";

const AURORA = { id: 7, slug: "aurora", name: "Aurora Atelier" };
const SHOP = { id: 9, slug: "shop", name: "Someone Else's Store" };

const ORIGINAL_PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const ORIGINAL_SITE_DOMAIN = process.env.SITE_DOMAIN;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PUBLIC_BASE_URL = "https://zolto.ch";
  delete process.env.SITE_DOMAIN;
  dbMock.getTenantBySlug.mockResolvedValue(undefined);
  dbMock.getTenantByCustomDomain.mockResolvedValue(undefined);
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_BASE_URL === undefined)
    delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = ORIGINAL_PUBLIC_BASE_URL;
  if (ORIGINAL_SITE_DOMAIN === undefined) delete process.env.SITE_DOMAIN;
  else process.env.SITE_DOMAIN = ORIGINAL_SITE_DOMAIN;
});

describe("resolveTenantForHost — platform subdomains", () => {
  it("resolves the left-most label of a platform subdomain as a slug", async () => {
    dbMock.getTenantBySlug.mockResolvedValue(AURORA);
    await expect(resolveTenantForHost("aurora.zolto.ch")).resolves.toBe(AURORA);
    expect(dbMock.getTenantBySlug).toHaveBeenCalledWith("aurora");
    expect(dbMock.getTenantByCustomDomain).not.toHaveBeenCalled();
  });

  it("ignores the port", async () => {
    dbMock.getTenantBySlug.mockResolvedValue(AURORA);
    await expect(resolveTenantForHost("aurora.zolto.ch:443")).resolves.toBe(
      AURORA,
    );
    expect(dbMock.getTenantBySlug).toHaveBeenCalledWith("aurora");
  });

  it("works alongside Kalakosh-ch's deeper root domain", async () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.kalakosh.ch";
    dbMock.getTenantBySlug.mockResolvedValue(AURORA);
    await expect(
      resolveTenantForHost("aurora.zolto.kalakosh.ch"),
    ).resolves.toBe(AURORA);
    expect(dbMock.getTenantBySlug).toHaveBeenCalledWith("aurora");
  });

  it("resolves the platform apex and reserved labels to null", async () => {
    dbMock.getTenantBySlug.mockResolvedValue(AURORA);
    for (const host of [
      "zolto.ch",
      "www.zolto.ch",
      "app.zolto.ch",
      "api.zolto.ch",
    ]) {
      await expect(resolveTenantForHost(host)).resolves.toBeNull();
    }
    expect(dbMock.getTenantBySlug).not.toHaveBeenCalled();
  });

  it("returns null for an unknown slug rather than falling through to a domain lookup", async () => {
    await expect(resolveTenantForHost("nobody.zolto.ch")).resolves.toBeNull();
    expect(dbMock.getTenantByCustomDomain).not.toHaveBeenCalled();
  });
});

describe("resolveTenantForHost — custom domains", () => {
  it("resolves a registered custom domain to its tenant", async () => {
    dbMock.getTenantByCustomDomain.mockResolvedValue(AURORA);
    await expect(resolveTenantForHost("shop.aurora-atelier.ch")).resolves.toBe(
      AURORA,
    );
    expect(dbMock.getTenantByCustomDomain).toHaveBeenCalledWith(
      "shop.aurora-atelier.ch",
    );
  });

  it("lower-cases the host before looking it up", async () => {
    dbMock.getTenantByCustomDomain.mockResolvedValue(AURORA);
    await expect(
      resolveTenantForHost("Shop.Aurora-Atelier.CH:443"),
    ).resolves.toBe(AURORA);
    expect(dbMock.getTenantByCustomDomain).toHaveBeenCalledWith(
      "shop.aurora-atelier.ch",
    );
  });

  // The regression this resolver exists for: resolution used to take the
  // host's left-most label as a slug for EVERY host, so a merchant pointing
  // shop.example.com at the platform was served whichever store happened to be
  // slugged "shop".
  it("never falls back to the left-most label as a slug", async () => {
    dbMock.getTenantBySlug.mockResolvedValue(SHOP);
    await expect(resolveTenantForHost("shop.example.com")).resolves.toBeNull();
    expect(dbMock.getTenantBySlug).not.toHaveBeenCalled();
  });

  it("returns null for an unregistered host", async () => {
    await expect(
      resolveTenantForHost("random.example.com"),
    ).resolves.toBeNull();
  });
});

describe("resolveTenantForHost — header and dev hosts", () => {
  it("prefers an explicit X-Tenant-Slug over the host", async () => {
    dbMock.getTenantBySlug.mockResolvedValue(AURORA);
    await expect(resolveTenantForHost("zolto.ch", "aurora")).resolves.toBe(
      AURORA,
    );
    expect(dbMock.getTenantBySlug).toHaveBeenCalledWith("aurora");
  });

  it("falls through to the host when the header names no real tenant", async () => {
    dbMock.getTenantBySlug.mockImplementation(async (slug: string) =>
      slug === "aurora" ? AURORA : undefined,
    );
    await expect(
      resolveTenantForHost("aurora.zolto.ch", "ghost"),
    ).resolves.toBe(AURORA);
  });

  it("still resolves *.localhost when no platform root is configured", async () => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.SITE_DOMAIN;
    dbMock.getTenantBySlug.mockResolvedValue(AURORA);
    await expect(resolveTenantForHost("aurora.localhost:5173")).resolves.toBe(
      AURORA,
    );
    expect(dbMock.getTenantBySlug).toHaveBeenCalledWith("aurora");
  });

  it("prefers a custom domain over the label even with no platform root", async () => {
    delete process.env.PUBLIC_BASE_URL;
    dbMock.getTenantByCustomDomain.mockResolvedValue(AURORA);
    dbMock.getTenantBySlug.mockResolvedValue(SHOP);
    await expect(resolveTenantForHost("shop.example.com")).resolves.toBe(
      AURORA,
    );
  });

  it("returns null for an empty host", async () => {
    await expect(resolveTenantForHost("")).resolves.toBeNull();
  });
});

describe("resolveTenantFromRequest", () => {
  const req = (headers: Record<string, string | string[]>) =>
    ({ headers }) as unknown as Request;

  it("reads the host header", async () => {
    dbMock.getTenantByCustomDomain.mockResolvedValue(AURORA);
    await expect(
      resolveTenantFromRequest(req({ host: "shop.aurora-atelier.ch" })),
    ).resolves.toBe(AURORA);
  });

  it("accepts a repeated x-tenant-slug header", async () => {
    dbMock.getTenantBySlug.mockResolvedValue(AURORA);
    await expect(
      resolveTenantFromRequest(
        req({ host: "zolto.ch", "x-tenant-slug": ["aurora", "other"] }),
      ),
    ).resolves.toBe(AURORA);
    expect(dbMock.getTenantBySlug).toHaveBeenCalledWith("aurora");
  });

  it("never throws — a database failure resolves to null", async () => {
    dbMock.getTenantByCustomDomain.mockRejectedValue(new Error("db down"));
    await expect(
      resolveTenantFromRequest(req({ host: "shop.example.com" })),
    ).resolves.toBeNull();
  });
});
