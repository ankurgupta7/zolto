import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { COOKIE_NAME } from "../../shared/const";

const { dbMock, sendMagicLinkEmail } = vi.hoisted(() => ({
  dbMock: {
    createMagicLinkToken: vi.fn(),
    getMagicLinkTokenByToken: vi.fn(),
    consumeMagicLinkToken: vi.fn(),
    upsertUser: vi.fn(),
    getManagingUsersByEmail: vi.fn(),
    touchUserLastSignedIn: vi.fn(),
  },
  sendMagicLinkEmail: vi.fn(),
}));
vi.mock("../db", () => dbMock);
vi.mock("./email", () => ({ sendMagicLinkEmail }));

import { registerMagicLinkRoutes, requestMagicLink } from "./magicLink";
import { verifySessionJwt } from "./oauth";

const ENV_KEYS = [
  "JWT_SECRET",
  "ADMIN_EMAIL",
  "PUBLIC_BASE_URL",
  "RESEND_API_KEY",
] as const;
const originalEnv: Record<string, string | undefined> = {};

function makeApp() {
  const app = express();
  registerMagicLinkRoutes(app);
  return app;
}

function fakeReq(overrides: Partial<{ headers: Record<string, string> }> = {}) {
  return {
    protocol: "https",
    headers: { host: "zolto.ch", ...(overrides.headers ?? {}) },
  } as unknown as import("express").Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.JWT_SECRET = "a-test-jwt-secret-that-is-long-enough";
  process.env.ADMIN_EMAIL = "admin@example.com";
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.RESEND_API_KEY;
  dbMock.createMagicLinkToken.mockResolvedValue(undefined);
  dbMock.upsertUser.mockResolvedValue(undefined);
  dbMock.consumeMagicLinkToken.mockResolvedValue(undefined);
  // Default: the address manages nothing, so nothing is adopted. Every test
  // that cares about adoption sets this itself.
  dbMock.getManagingUsersByEmail.mockResolvedValue([]);
  dbMock.touchUserLastSignedIn.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.restoreAllMocks();
});

describe("requestMagicLink", () => {
  it("stores a token, emails the link, and reports emailed=true", async () => {
    process.env.RESEND_API_KEY = "re_test";
    sendMagicLinkEmail.mockResolvedValue(true);

    const result = await requestMagicLink({
      email: "Merchant@Example.com",
      next: "/onboarding",
      req: fakeReq(),
    });

    expect(dbMock.createMagicLinkToken).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "merchant@example.com", // normalized
        next: "/onboarding",
        token: expect.stringMatching(/^[0-9a-f]{48}$/),
      }),
    );
    expect(sendMagicLinkEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "merchant@example.com",
        url: expect.stringContaining("/api/auth/magic-link/callback?token="),
      }),
    );
    expect(result).toEqual({ emailed: true, previewUrl: undefined });
  });

  it("drops an unsafe next target rather than storing it", async () => {
    sendMagicLinkEmail.mockResolvedValue(false);
    await requestMagicLink({
      email: "x@example.com",
      next: "https://evil.example.com/",
      req: fakeReq(),
    });
    expect(dbMock.createMagicLinkToken).toHaveBeenCalledWith(
      expect.objectContaining({ next: null }),
    );
  });

  it("returns the raw link when Resend isn't configured (dev fallback)", async () => {
    sendMagicLinkEmail.mockResolvedValue(false); // sendTransactionalEmail's own not-configured contract
    const result = await requestMagicLink({
      email: "x@example.com",
      next: undefined,
      req: fakeReq(),
    });
    expect(result.emailed).toBe(false);
    expect(result.previewUrl).toContain("/api/auth/magic-link/callback?token=");
  });

  it("does not leak the link when a real send genuinely fails", async () => {
    process.env.RESEND_API_KEY = "re_test";
    sendMagicLinkEmail.mockRejectedValue(new Error("network down"));
    const result = await requestMagicLink({
      email: "x@example.com",
      next: undefined,
      req: fakeReq(),
    });
    expect(result.emailed).toBe(false);
    expect(result.previewUrl).toBeUndefined();
  });
});

describe("GET /api/auth/magic-link/callback", () => {
  it("returns 400 when the token is missing", async () => {
    const res = await request(makeApp()).get("/api/auth/magic-link/callback");
    expect(res.status).toBe(400);
  });

  it("returns 500 when JWT_SECRET is missing", async () => {
    delete process.env.JWT_SECRET;
    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=abc",
    );
    expect(res.status).toBe(500);
  });

  it("returns 400 for an unknown token", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue(undefined);
    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=missing",
    );
    expect(res.status).toBe(400);
    expect(dbMock.upsertUser).not.toHaveBeenCalled();
  });

  it("returns 400 for an already-consumed token", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue({
      id: 1,
      email: "x@example.com",
      token: "t",
      next: null,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: new Date(),
    });
    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=t",
    );
    expect(res.status).toBe(400);
    expect(dbMock.upsertUser).not.toHaveBeenCalled();
  });

  it("returns 400 for an expired token", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue({
      id: 1,
      email: "x@example.com",
      token: "t",
      next: null,
      expiresAt: new Date(Date.now() - 60_000),
      consumedAt: null,
    });
    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=t",
    );
    expect(res.status).toBe(400);
  });

  it("signs the platform admin in, burns the token, and redirects to /admin", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue({
      id: 7,
      email: "Admin@Example.com",
      token: "t",
      next: null,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=t",
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin");
    expect(dbMock.consumeMagicLinkToken).toHaveBeenCalledWith(7);
    expect(dbMock.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "email:Admin@Example.com",
        loginMethod: "magic_link",
        role: "admin",
      }),
    );
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(
      ";",
    );
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
  });

  it("signs a regular user in without forcing a role and redirects to the stashed next", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue({
      id: 3,
      email: "someone@example.com",
      token: "t",
      next: "/claim/mystore",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=t",
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/claim/mystore");
    const arg = dbMock.upsertUser.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.role).toBeUndefined();
  });
});

/**
 * Adoption: a link for an address that already manages a store signs in AS
 * that account instead of minting `email:<addr>`.
 *
 * The regression is quiet without these. Creating the second identity throws
 * nothing and redirects normally — the merchant simply arrives parked on the
 * platform tenant as a customer, with their store invisible. So each test
 * below asserts the identity in the issued session cookie, not just which db
 * call happened.
 */
describe("GET /api/auth/magic-link/callback — existing account adoption", () => {
  const tokenFor = (email: string) => ({
    id: 7,
    email,
    token: "t",
    next: null,
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
  });

  /** The openId the issued session actually carries. */
  async function sessionOpenId(res: { headers: Record<string, unknown> }) {
    const raw = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith(`${COOKIE_NAME}=`),
    );
    const jwt = decodeURIComponent(
      (raw ?? "").slice(COOKIE_NAME.length + 1).split(";")[0],
    );
    const session = await verifySessionJwt(jwt, process.env.JWT_SECRET ?? "");
    return session?.openId;
  }

  it("signs in as the existing Google account rather than a new identity", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue(
      tokenFor("admin@kalakosh.ch"),
    );
    dbMock.getManagingUsersByEmail.mockResolvedValue([
      { id: 12, openId: "google:115176", tenantId: 6, role: "admin" },
    ]);

    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=t",
    );

    expect(res.status).toBe(302);
    expect(await sessionOpenId(res)).toBe("google:115176");
    expect(dbMock.upsertUser).not.toHaveBeenCalled();
    expect(dbMock.touchUserLastSignedIn).toHaveBeenCalledWith(
      12,
      expect.any(Date),
    );
  });

  // name/email/loginMethod on the adopted row belong to the provider that
  // minted it; a visit through the fallback must not relabel it magic_link.
  it("touches only lastSignedIn on the adopted row", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue(tokenFor("a@b.c"));
    dbMock.getManagingUsersByEmail.mockResolvedValue([
      { id: 12, openId: "google:115176", tenantId: 6, role: "admin" },
    ]);
    await request(makeApp()).get("/api/auth/magic-link/callback?token=t");
    expect(dbMock.touchUserLastSignedIn).toHaveBeenCalledTimes(1);
    expect(dbMock.upsertUser).not.toHaveBeenCalled();
  });

  it("adopts a staff account too, not just admins", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue(tokenFor("s@b.c"));
    dbMock.getManagingUsersByEmail.mockResolvedValue([
      { id: 20, openId: "apple:sub-9", tenantId: 6, role: "staff" },
    ]);
    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=t",
    );
    expect(await sessionOpenId(res)).toBe("apple:sub-9");
  });

  // Two stores, no way to know which was meant. Guessing would drop a
  // merchant into the wrong store's admin, so it falls back instead.
  it("does not guess when the address manages more than one store", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue(tokenFor("multi@b.c"));
    dbMock.getManagingUsersByEmail.mockResolvedValue([
      { id: 12, openId: "google:a", tenantId: 6, role: "admin" },
      { id: 30, openId: "google:b", tenantId: 9, role: "admin" },
    ]);

    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=t",
    );

    expect(await sessionOpenId(res)).toBe("email:multi@b.c");
    expect(dbMock.touchUserLastSignedIn).not.toHaveBeenCalled();
    expect(dbMock.upsertUser).toHaveBeenCalledTimes(1);
  });

  // A storefront customer has no managing row: unchanged behaviour, and the
  // half of the user base that must not be disturbed by any of this.
  it("still creates the email identity when the address manages nothing", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue(tokenFor("shopper@b.c"));
    dbMock.getManagingUsersByEmail.mockResolvedValue([]);

    const res = await request(makeApp()).get(
      "/api/auth/magic-link/callback?token=t",
    );

    expect(await sessionOpenId(res)).toBe("email:shopper@b.c");
    expect(dbMock.upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "email:shopper@b.c",
        loginMethod: "magic_link",
      }),
    );
    expect(dbMock.touchUserLastSignedIn).not.toHaveBeenCalled();
  });

  it("looks the address up as sent, leaving case folding to the query", async () => {
    dbMock.getMagicLinkTokenByToken.mockResolvedValue(
      tokenFor("Admin@Kalakosh.CH"),
    );
    await request(makeApp()).get("/api/auth/magic-link/callback?token=t");
    expect(dbMock.getManagingUsersByEmail).toHaveBeenCalledWith(
      "Admin@Kalakosh.CH",
    );
  });
});
