import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";

const { authenticateRequest, getTenantBySlug, getTenantByCustomDomain } =
  vi.hoisted(() => ({
    authenticateRequest: vi.fn(),
    getTenantBySlug: vi.fn(),
    getTenantByCustomDomain: vi.fn(),
  }));

vi.mock("./sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("../db", () => ({ getTenantBySlug, getTenantByCustomDomain }));

import { createContext } from "./context";

function opts(headers: Record<string, string> = {}) {
  return { req: { headers }, res: {} } as never;
}

const ORIGINAL_PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

beforeEach(() => {
  vi.clearAllMocks();
  // The production shape: a configured platform root, so a host is either one
  // of its subdomains (a slug) or a custom domain — never both.
  process.env.PUBLIC_BASE_URL = "https://zolto.ch";
  getTenantBySlug.mockResolvedValue(undefined);
  getTenantByCustomDomain.mockResolvedValue(undefined);
});

afterAll(() => {
  if (ORIGINAL_PUBLIC_BASE_URL === undefined)
    delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = ORIGINAL_PUBLIC_BASE_URL;
});

describe("createContext — user", () => {
  it("attaches the authenticated user", async () => {
    authenticateRequest.mockResolvedValue({ id: 1, openId: "google:1" });
    const ctx = await createContext(opts({ host: "zolto.ch" }));
    expect(ctx.user).toMatchObject({ id: 1 });
  });

  it("leaves the user null when authentication fails", async () => {
    authenticateRequest.mockRejectedValue(new Error("no session"));
    const ctx = await createContext(opts({ host: "zolto.ch" }));
    expect(ctx.user).toBeNull();
  });
});

describe("createContext — tenant resolution", () => {
  beforeEach(() => {
    authenticateRequest.mockRejectedValue(new Error("anon"));
  });

  it("resolves the tenant from the X-Tenant-Slug header", async () => {
    getTenantBySlug.mockResolvedValueOnce({ id: 7, slug: "aurora" });
    const ctx = await createContext(opts({ "x-tenant-slug": "aurora" }));
    expect(ctx.tenant).toMatchObject({ id: 7 });
    expect(getTenantBySlug).toHaveBeenCalledTimes(1);
  });

  it("resolves the tenant from a subdomain when there is no header", async () => {
    getTenantBySlug.mockResolvedValueOnce({ id: 8, slug: "lumiere" });
    const ctx = await createContext(opts({ host: "lumiere.zolto.ch" }));
    expect(ctx.tenant).toMatchObject({ id: 8 });
    expect(getTenantBySlug).toHaveBeenCalledWith("lumiere");
  });

  it("falls through to the subdomain when the header slug has no match", async () => {
    getTenantBySlug
      .mockResolvedValueOnce(undefined) // header lookup misses
      .mockResolvedValueOnce({ id: 9, slug: "sub" }); // subdomain lookup hits
    const ctx = await createContext(
      opts({ "x-tenant-slug": "nope", host: "sub.zolto.ch" }),
    );
    expect(ctx.tenant).toMatchObject({ id: 9 });
    expect(getTenantBySlug).toHaveBeenCalledTimes(2);
  });

  // The custom-domain half of the feature: Caddy already issues TLS for the
  // hostname, and this is what makes the request land in the right store.
  it("resolves the tenant from a registered custom domain", async () => {
    getTenantByCustomDomain.mockResolvedValueOnce({ id: 11, slug: "aurora" });
    const ctx = await createContext(opts({ host: "shop.aurora-atelier.ch" }));
    expect(ctx.tenant).toMatchObject({ id: 11 });
    expect(getTenantByCustomDomain).toHaveBeenCalledWith(
      "shop.aurora-atelier.ch",
    );
    // Never as a slug: a custom domain must not pick up the store that happens
    // to be slugged after its left-most label.
    expect(getTenantBySlug).not.toHaveBeenCalled();
  });

  it("ignores reserved subdomains (www, app, api)", async () => {
    for (const host of ["www.zolto.ch", "app.zolto.ch", "api.zolto.ch"]) {
      const ctx = await createContext(opts({ host }));
      expect(ctx.tenant).toBeNull();
    }
    expect(getTenantBySlug).not.toHaveBeenCalled();
    expect(getTenantByCustomDomain).not.toHaveBeenCalled();
  });

  it("returns a null tenant when nothing resolves", async () => {
    const ctx = await createContext(opts({ host: "zolto.ch" }));
    expect(ctx.tenant).toBeNull();
  });

  it("treats a lookup error as an unresolved tenant", async () => {
    getTenantBySlug.mockRejectedValue(new Error("db down"));
    const ctx = await createContext(opts({ "x-tenant-slug": "aurora" }));
    expect(ctx.tenant).toBeNull();
  });
});
