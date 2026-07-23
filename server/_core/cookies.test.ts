import { describe, expect, it } from "vitest";
import type { Request } from "express";
import { getSessionCookieOptions } from "./cookies";

function req(overrides: Partial<Request>): Request {
  return { protocol: "http", headers: {}, ...overrides } as Request;
}

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
});
