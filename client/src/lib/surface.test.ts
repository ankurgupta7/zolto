import { describe, it, expect } from "vitest";
import {
  resolveSurface,
  tenantSlugFromHost,
  tenantSlugFromDocument,
  isDevHost,
  storeAdminUrl,
  storeHomeUrl,
} from "./surface";

describe("isDevHost", () => {
  it("treats localhost / loopback / .local as dev", () => {
    expect(isDevHost("localhost")).toBe(true);
    expect(isDevHost("localhost:5173")).toBe(true);
    expect(isDevHost("127.0.0.1")).toBe(true);
    expect(isDevHost("mymachine.local")).toBe(true);
  });
  it("treats real domains as non-dev", () => {
    expect(isDevHost("zolto.ch")).toBe(false);
    expect(isDevHost("kalakosh.ch")).toBe(false);
  });
});

describe("tenantSlugFromHost", () => {
  it("extracts the slug from a platform subdomain", () => {
    expect(tenantSlugFromHost("kalakosh.zolto.ch")).toBe("kalakosh");
    expect(tenantSlugFromHost("kalakosh.zolto.ch:443")).toBe("kalakosh");
  });
  it("returns null for the apex and reserved subdomains", () => {
    expect(tenantSlugFromHost("zolto.ch")).toBeNull();
    expect(tenantSlugFromHost("www.zolto.ch")).toBeNull();
    expect(tenantSlugFromHost("app.zolto.ch")).toBeNull();
    expect(tenantSlugFromHost("api.zolto.ch")).toBeNull();
  });
  it("returns null for custom domains (resolved server-side)", () => {
    expect(tenantSlugFromHost("kalakosh.ch")).toBeNull();
  });
});

describe("resolveSurface", () => {
  it("apex hosts render the marketing surface", () => {
    expect(resolveSurface({ hostname: "zolto.ch" })).toEqual({
      surface: "marketing",
      tenantSlug: null,
    });
    expect(resolveSurface({ hostname: "www.zolto.ch" }).surface).toBe(
      "marketing",
    );
  });

  it("subdomains render the tenant storefront with the derived slug", () => {
    expect(resolveSurface({ hostname: "kalakosh.zolto.ch" })).toEqual({
      surface: "storefront",
      tenantSlug: "kalakosh",
    });
  });

  // A custom domain carries no slug, so the server stamps the one it resolved
  // into the shell. Before that tag existed every custom domain fell through to
  // VITE_DEFAULT_TENANT_SLUG and the SPA asked the API for the wrong store.
  it("custom domains use the slug the server stamped into the shell", () => {
    expect(
      resolveSurface({
        hostname: "shop.aurora-atelier.ch",
        hostTenantSlug: "aurora",
        defaultTenantSlug: "demo",
      }),
    ).toEqual({ surface: "storefront", tenantSlug: "aurora" });
  });

  it("custom domains fall back to the default tenant slug with no stamped slug", () => {
    expect(
      resolveSurface({
        hostname: "kalakosh.ch",
        hostTenantSlug: null,
        defaultTenantSlug: "kalakosh",
      }),
    ).toEqual({ surface: "storefront", tenantSlug: "kalakosh" });
  });

  it("prefers the hostname's own slug over a stale stamped one", () => {
    // The subdomain is authoritative when it has a slug: a cached shell must
    // never make blah.zolto.ch render someone else's store.
    expect(
      resolveSurface({
        hostname: "kalakosh.zolto.ch",
        hostTenantSlug: "aurora",
      }).tenantSlug,
    ).toBe("kalakosh");
  });

  it("reads the stamped slug from the document by default", () => {
    const meta = document.createElement("meta");
    meta.name = "zolto-tenant-slug";
    meta.content = "aurora";
    document.head.appendChild(meta);
    try {
      expect(tenantSlugFromDocument()).toBe("aurora");
      expect(
        resolveSurface({ hostname: "shop.aurora-atelier.ch" }).tenantSlug,
      ).toBe("aurora");
    } finally {
      meta.remove();
    }
    expect(tenantSlugFromDocument()).toBeNull();
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
        hostname: "kalakosh.zolto.ch",
        search: "?surface=marketing",
      }),
    ).toEqual({ surface: "marketing", tenantSlug: null });
    expect(
      resolveSurface({
        hostname: "zolto.ch",
        search: "?surface=storefront&tenant=demo",
      }),
    ).toEqual({ surface: "storefront", tenantSlug: "demo" });
  });
});

describe("storeAdminUrl / storeHomeUrl (cross-surface navigation)", () => {
  it("sends the browser to the tenant subdomain from the platform apex", () => {
    expect(storeAdminUrl("kalakosh", "zolto.ch")).toBe(
      "https://kalakosh.zolto.ch/admin",
    );
    expect(storeAdminUrl("kalakosh", "www.zolto.ch")).toBe(
      "https://kalakosh.zolto.ch/admin",
    );
    expect(storeHomeUrl("kalakosh", "zolto.ch")).toBe(
      "https://kalakosh.zolto.ch/",
    );
  });

  it("stays same-origin and forces the storefront surface in dev / preview", () => {
    expect(storeAdminUrl("kalakosh", "localhost")).toBe(
      "/admin?surface=storefront&tenant=kalakosh",
    );
    expect(storeHomeUrl("kalakosh", "localhost")).toBe(
      "/?surface=storefront&tenant=kalakosh",
    );
  });

  it("encodes the slug in the query-param form", () => {
    expect(storeAdminUrl("a b", "localhost")).toBe(
      "/admin?surface=storefront&tenant=a%20b",
    );
  });
});
