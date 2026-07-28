import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getPlatformRootDomain, isPlatformHost } from "./platformDomain";

const ORIGINAL_PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;
const ORIGINAL_SITE_DOMAIN = process.env.SITE_DOMAIN;

beforeEach(() => {
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.SITE_DOMAIN;
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_BASE_URL === undefined)
    delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = ORIGINAL_PUBLIC_BASE_URL;
  if (ORIGINAL_SITE_DOMAIN === undefined) delete process.env.SITE_DOMAIN;
  else process.env.SITE_DOMAIN = ORIGINAL_SITE_DOMAIN;
});

describe("getPlatformRootDomain", () => {
  it("prefers PUBLIC_BASE_URL's hostname", () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.ch";
    process.env.SITE_DOMAIN = "ignored.example";
    expect(getPlatformRootDomain()).toBe("zolto.ch");
  });

  it("supports the alongside-Kalakosh-ch domain scheme", () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.kalakosh.ch";
    expect(getPlatformRootDomain()).toBe("zolto.kalakosh.ch");
  });

  it("falls back to SITE_DOMAIN when PUBLIC_BASE_URL is unset", () => {
    process.env.SITE_DOMAIN = "zolto.ch";
    expect(getPlatformRootDomain()).toBe("zolto.ch");
  });

  it("ignores SITE_DOMAIN's by-IP testing form (:80)", () => {
    process.env.SITE_DOMAIN = ":80";
    expect(getPlatformRootDomain()).toBeNull();
  });

  it("ignores a malformed PUBLIC_BASE_URL and falls back to SITE_DOMAIN", () => {
    process.env.PUBLIC_BASE_URL = "not a url";
    process.env.SITE_DOMAIN = "zolto.ch";
    expect(getPlatformRootDomain()).toBe("zolto.ch");
  });

  it("returns null when neither is configured", () => {
    expect(getPlatformRootDomain()).toBeNull();
  });
});

describe("isPlatformHost", () => {
  it("matches the root domain itself", () => {
    expect(isPlatformHost("zolto.ch", "zolto.ch")).toBe(true);
  });

  it("matches a subdomain of the root", () => {
    expect(isPlatformHost("blah.zolto.ch", "zolto.ch")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isPlatformHost("Blah.Zolto.CH", "zolto.ch")).toBe(true);
  });

  it("rejects an unrelated domain", () => {
    expect(isPlatformHost("shop.example.com", "zolto.ch")).toBe(false);
  });

  it("rejects a domain that merely ends with the same characters", () => {
    expect(isPlatformHost("notzolto.ch", "zolto.ch")).toBe(false);
  });

  it("returns false when root is null", () => {
    expect(isPlatformHost("zolto.ch", null)).toBe(false);
  });

  it("returns false when hostname is missing", () => {
    expect(isPlatformHost(undefined, "zolto.ch")).toBe(false);
  });
});
