import { describe, expect, it, vi, beforeEach } from "vitest";

const { authenticateRequest, findFirst } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  findFirst: vi.fn(),
}));

vi.mock("./sdk", () => ({ sdk: { authenticateRequest } }));
vi.mock("../db", () => ({
  db: { query: { tenants: { findFirst } } },
}));

import { createContext } from "./context";

function opts(headers: Record<string, string> = {}) {
  return { req: { headers }, res: {} } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createContext — user", () => {
  it("attaches the authenticated user", async () => {
    authenticateRequest.mockResolvedValue({ id: 1, openId: "google:1" });
    findFirst.mockResolvedValue(null);
    const ctx = await createContext(opts({ host: "zolto.ch" }));
    expect(ctx.user).toMatchObject({ id: 1 });
  });

  it("leaves the user null when authentication fails", async () => {
    authenticateRequest.mockRejectedValue(new Error("no session"));
    findFirst.mockResolvedValue(null);
    const ctx = await createContext(opts({ host: "zolto.ch" }));
    expect(ctx.user).toBeNull();
  });
});

describe("createContext — tenant resolution", () => {
  beforeEach(() => {
    authenticateRequest.mockRejectedValue(new Error("anon"));
  });

  it("resolves the tenant from the X-Tenant-Slug header", async () => {
    findFirst.mockResolvedValueOnce({ id: 7, slug: "aurora" });
    const ctx = await createContext(opts({ "x-tenant-slug": "aurora" }));
    expect(ctx.tenant).toMatchObject({ id: 7 });
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it("resolves the tenant from a subdomain when there is no header", async () => {
    findFirst.mockResolvedValueOnce({ id: 8, slug: "lumiere" });
    const ctx = await createContext(opts({ host: "lumiere.zolto.ch" }));
    expect(ctx.tenant).toMatchObject({ id: 8 });
  });

  it("falls through to the subdomain when the header slug has no match", async () => {
    findFirst
      .mockResolvedValueOnce(undefined) // header lookup misses
      .mockResolvedValueOnce({ id: 9, slug: "sub" }); // subdomain lookup hits
    const ctx = await createContext(
      opts({ "x-tenant-slug": "nope", host: "sub.zolto.ch" }),
    );
    expect(ctx.tenant).toMatchObject({ id: 9 });
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("ignores reserved subdomains (www, zolto)", async () => {
    const ctx = await createContext(opts({ host: "www.zolto.ch" }));
    expect(ctx.tenant).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns a null tenant when nothing resolves", async () => {
    findFirst.mockResolvedValue(undefined);
    const ctx = await createContext(opts({ host: "zolto.ch" }));
    expect(ctx.tenant).toBeNull();
  });

  it("treats a lookup error as an unresolved tenant", async () => {
    findFirst.mockRejectedValue(new Error("db down"));
    const ctx = await createContext(opts({ "x-tenant-slug": "aurora" }));
    expect(ctx.tenant).toBeNull();
  });
});
