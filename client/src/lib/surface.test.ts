import { describe, it, expect } from "vitest";
import { resolveSurface, tenantSlugFromHost, isDevHost } from "./surface";

describe("isDevHost", () => {
  it("treats localhost / loopback / .local as dev", () => {
    expect(isDevHost("localhost")).toBe(true);
    expect(isDevHost("localhost:5173")).toBe(true);
    expect(isDevHost("127.0.0.1")).toBe(true);
    expect(isDevHost("mymachine.local")).toBe(true);
  });
  it("treats real domains as non-dev", () => {
    expect(isDevHost("zolto.com")).toBe(false);
    expect(isDevHost("kalakosh.ch")).toBe(false);
  });
});

describe("tenantSlugFromHost", () => {
  it("extracts the slug from a platform subdomain", () => {
    expect(tenantSlugFromHost("kalakosh.zolto.com")).toBe("kalakosh");
    expect(tenantSlugFromHost("kalakosh.zolto.com:443")).toBe("kalakosh");
  });
  it("returns null for the apex and reserved subdomains", () => {
    expect(tenantSlugFromHost("zolto.com")).toBeNull();
    expect(tenantSlugFromHost("www.zolto.com")).toBeNull();
    expect(tenantSlugFromHost("app.zolto.com")).toBeNull();
    expect(tenantSlugFromHost("api.zolto.com")).toBeNull();
  });
  it("returns null for custom domains (resolved server-side)", () => {
    expect(tenantSlugFromHost("kalakosh.ch")).toBeNull();
  });
});

describe("resolveSurface", () => {
  it("apex hosts render the marketing surface", () => {
    expect(resolveSurface({ hostname: "zolto.com" })).toEqual({
      surface: "marketing",
      tenantSlug: null,
    });
    expect(resolveSurface({ hostname: "www.zolto.com" }).surface).toBe(
      "marketing",
    );
  });

  it("subdomains render the tenant storefront with the derived slug", () => {
    expect(resolveSurface({ hostname: "kalakosh.zolto.com" })).toEqual({
      surface: "storefront",
      tenantSlug: "kalakosh",
    });
  });

  it("custom domains fall back to the default tenant slug", () => {
    expect(
      resolveSurface({
        hostname: "kalakosh.ch",
        defaultTenantSlug: "kalakosh",
      }),
    ).toEqual({ surface: "storefront", tenantSlug: "kalakosh" });
  });

  it("dev host defaults to storefront but honors ?tenant", () => {
    expect(
      resolveSurface({ hostname: "localhost", defaultTenantSlug: "kalakosh" }),
    ).toEqual({
      surface: "storefront",
      tenantSlug: "kalakosh",
    });
    expect(
      resolveSurface({ hostname: "localhost", search: "?tenant=demo" })
        .tenantSlug,
    ).toBe("demo");
  });

  it("?surface override wins on any host", () => {
    expect(
      resolveSurface({
        hostname: "kalakosh.zolto.com",
        search: "?surface=marketing",
      }),
    ).toEqual({ surface: "marketing", tenantSlug: null });
    expect(
      resolveSurface({
        hostname: "zolto.com",
        search: "?surface=storefront&tenant=demo",
      }),
    ).toEqual({ surface: "storefront", tenantSlug: "demo" });
  });
});
