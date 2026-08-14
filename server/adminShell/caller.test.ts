import { afterEach, describe, expect, it } from "vitest";
import type { Tenant, User } from "../../drizzle/schema";
import {
  assertOperator,
  hostForTenant,
  NotAnOperatorError,
  operatorRequest,
  operatorResponse,
  platformContext,
  storeContext,
} from "./caller";

const operator = {
  id: 1,
  tenantId: 1,
  openId: "google:1",
  email: "owner@zolto.ch",
  name: "Owner",
  role: "superadmin",
  loginMethod: "google",
} as unknown as User;

const storeAdmin = { ...operator, id: 2, role: "admin" } as User;

const tenant = {
  id: 42,
  slug: "kalakosh",
  name: "Kalakosh",
  plan: "free",
} as unknown as Tenant;

const originalBaseUrl = process.env.PUBLIC_BASE_URL;
const originalPlatformDomain = process.env.PLATFORM_DOMAIN;

afterEach(() => {
  process.env.PUBLIC_BASE_URL = originalBaseUrl;
  process.env.PLATFORM_DOMAIN = originalPlatformDomain;
  if (originalBaseUrl === undefined) delete process.env.PUBLIC_BASE_URL;
  if (originalPlatformDomain === undefined) delete process.env.PLATFORM_DOMAIN;
});

describe("assertOperator", () => {
  it("accepts a platform owner", () => {
    expect(() => assertOperator(operator)).not.toThrow();
  });

  it("refuses an admin of a store — being an admin somewhere is not platform ownership", () => {
    expect(() => assertOperator(storeAdmin)).toThrow(NotAnOperatorError);
    expect(() => assertOperator(storeAdmin)).toThrow(
      /deploy\/tenant-admin\.sh/,
    );
  });
});

describe("platformContext", () => {
  it("leaves the tenant null so cross-tenant reads stay cross-tenant", () => {
    const ctx = platformContext(operator);
    expect(ctx.tenant).toBeNull();
    expect(ctx.user).toBe(operator);
  });

  it("cannot be built for a non-operator", () => {
    expect(() => platformContext(storeAdmin)).toThrow(NotAnOperatorError);
  });
});

describe("storeContext", () => {
  const ctx = storeContext(operator, tenant);

  it("sets ctx.tenant, which the tenantAdminProcedure handlers read", () => {
    expect(ctx.tenant).toBe(tenant);
  });

  it("also points ctx.user.tenantId at the store, which the adminProcedure handlers read", () => {
    // products, orders and POS pairing scope every query through
    // ctx.user.tenantId — setting only ctx.tenant would leave half the menu
    // acting on the operator's own store instead of the chosen one.
    expect(ctx.user?.tenantId).toBe(42);
  });

  it("keeps the superadmin role, which is what makes acting on another store legitimate", () => {
    expect(ctx.user?.role).toBe("superadmin");
  });

  it("does not mutate the operator row it was given", () => {
    expect(operator.tenantId).toBe(1);
  });

  it("cannot be built for a non-operator", () => {
    expect(() => storeContext(storeAdmin, tenant)).toThrow(NotAnOperatorError);
  });
});

describe("operatorRequest", () => {
  it("carries the host, in both the ways express exposes it", () => {
    const req = operatorRequest("kalakosh.zolto.ch");
    expect(req.headers.host).toBe("kalakosh.zolto.ch");
    expect(req.get("Host")).toBe("kalakosh.zolto.ch");
  });
});

describe("operatorResponse", () => {
  const res = operatorResponse();

  it("explains itself rather than failing as 'not a function'", () => {
    expect(() => (res as unknown as Record<string, unknown>).cookie).toThrow(
      /admin shell has no HTTP response/,
    );
  });

  it("stays safe to await and to inspect", async () => {
    expect(await Promise.resolve(res)).toBe(res);
    expect(() => JSON.stringify({ res })).not.toThrow();
  });
});

describe("hostForTenant", () => {
  it("prefers PUBLIC_BASE_URL, as getCanonicalOrigin does", () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.ch";
    expect(hostForTenant(tenant)).toBe("zolto.ch");
  });

  it("falls back to the store's own subdomain so pairing links point at it", () => {
    delete process.env.PUBLIC_BASE_URL;
    process.env.PLATFORM_DOMAIN = "zolto.ch";
    expect(hostForTenant(tenant)).toBe("kalakosh.zolto.ch");
    expect(hostForTenant(null)).toBe("zolto.ch");
  });

  it("survives a malformed PUBLIC_BASE_URL", () => {
    process.env.PUBLIC_BASE_URL = "not a url";
    process.env.PLATFORM_DOMAIN = "zolto.ch";
    expect(hostForTenant(tenant)).toBe("kalakosh.zolto.ch");
  });

  it("has a last resort when nothing is configured", () => {
    delete process.env.PUBLIC_BASE_URL;
    delete process.env.PLATFORM_DOMAIN;
    expect(hostForTenant(null)).toBe("localhost:3000");
  });
});
