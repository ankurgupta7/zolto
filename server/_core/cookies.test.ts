import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { Request } from "express";
import { getSessionCookieOptions } from "./cookies";

function req(overrides: Partial<Request>): Request {
  return { protocol: "http", headers: {}, ...overrides } as Request;
}

const ORIGINAL_PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL;

beforeEach(() => {
  delete process.env.PUBLIC_BASE_URL;
});

afterEach(() => {
  if (ORIGINAL_PUBLIC_BASE_URL === undefined)
    delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = ORIGINAL_PUBLIC_BASE_URL;
});

describe("getSessionCookieOptions", () => {
  it("always sets the httpOnly, path and sameSite defaults", () => {
    const opts = getSessionCookieOptions(req({}));
    expect(opts).toMatchObject({ httpOnly: true, path: "/", sameSite: "none" });
  });

  it("marks the cookie secure for a direct https request", () => {
    expect(getSessionCookieOptions(req({ protocol: "https" })).secure).toBe(
      true,
    );
  });

  it("is not secure for a plain http request with no forwarded proto", () => {
    expect(getSessionCookieOptions(req({})).secure).toBe(false);
  });

  it("honours an x-forwarded-proto string header", () => {
    const opts = getSessionCookieOptions(
      req({ headers: { "x-forwarded-proto": "https" } as never }),
    );
    expect(opts.secure).toBe(true);
  });

  it("parses a comma-separated forwarded proto list", () => {
    const opts = getSessionCookieOptions(
      req({ headers: { "x-forwarded-proto": "https,http" } as never }),
    );
    expect(opts.secure).toBe(true);
  });

  it("honours an x-forwarded-proto array header", () => {
    const opts = getSessionCookieOptions(
      req({ headers: { "x-forwarded-proto": ["https"] } as never }),
    );
    expect(opts.secure).toBe(true);
  });

  it("stays insecure when the forwarded proto is http", () => {
    const opts = getSessionCookieOptions(
      req({ headers: { "x-forwarded-proto": "http" } as never }),
    );
    expect(opts.secure).toBe(false);
  });

  it("has no domain override when PUBLIC_BASE_URL isn't configured", () => {
    const opts = getSessionCookieOptions(
      req({ headers: { host: "blah.zolto.ch" } as never }),
    );
    expect(opts.domain).toBeUndefined();
  });

  describe("cross-subdomain widening (PUBLIC_BASE_URL set)", () => {
    beforeEach(() => {
      process.env.PUBLIC_BASE_URL = "https://zolto.ch";
    });

    it("widens the cookie domain for the platform's own apex", () => {
      const opts = getSessionCookieOptions(
        req({ headers: { host: "zolto.ch" } as never }),
      );
      expect(opts.domain).toBe(".zolto.ch");
    });

    it("widens the cookie domain for a tenant subdomain", () => {
      const opts = getSessionCookieOptions(
        req({ headers: { host: "blah.zolto.ch" } as never }),
      );
      expect(opts.domain).toBe(".zolto.ch");
    });

    it("prefers x-forwarded-host over the raw host header", () => {
      const opts = getSessionCookieOptions(
        req({
          headers: {
            host: "internal-service:3000",
            "x-forwarded-host": "blah.zolto.ch",
          } as never,
        }),
      );
      expect(opts.domain).toBe(".zolto.ch");
    });

    it("stays host-only for a tenant's custom domain (unrelated host)", () => {
      const opts = getSessionCookieOptions(
        req({ headers: { host: "shop.example.com" } as never }),
      );
      expect(opts.domain).toBeUndefined();
    });
  });
});
