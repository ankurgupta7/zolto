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
  },
  sendMagicLinkEmail: vi.fn(),
}));
vi.mock("../db", () => dbMock);
vi.mock("./email", () => ({ sendMagicLinkEmail }));

import { registerMagicLinkRoutes, requestMagicLink } from "./magicLink";

const ENV_KEYS = ["JWT_SECRET", "ADMIN_EMAIL", "PUBLIC_BASE_URL", "RESEND_API_KEY"] as const;
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
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(";");
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
