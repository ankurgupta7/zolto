import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { COOKIE_NAME } from "../../shared/const";

const upsertUser = vi.fn();
vi.mock("../db", () => ({
  upsertUser: (...args: unknown[]) => upsertUser(...args),
}));

import { registerOAuthRoutes } from "./oauth";

const ENV_KEYS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "ADMIN_EMAIL",
  "JWT_SECRET",
  "PUBLIC_BASE_URL",
  "SITE_DOMAIN",
] as const;
const originalEnv: Record<string, string | undefined> = {};

function makeApp() {
  const app = express();
  registerOAuthRoutes(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.GOOGLE_CLIENT_ID = "client-id";
  process.env.GOOGLE_CLIENT_SECRET = "client-secret";
  process.env.ADMIN_EMAIL = "admin@example.com";
  process.env.JWT_SECRET = "a-test-jwt-secret-that-is-long-enough";
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.SITE_DOMAIN;
  upsertUser.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("GET /api/oauth/login", () => {
  it("redirects to the Google consent screen with the expected params", async () => {
    const res = await request(makeApp())
      .get("/api/oauth/login")
      .set("Host", "shop.example");
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.location);
    expect(loc.hostname).toBe("accounts.google.com");
    expect(loc.searchParams.get("client_id")).toBe("client-id");
    expect(loc.searchParams.get("response_type")).toBe("code");
    expect(loc.searchParams.get("scope")).toBe("openid email profile");
    expect(loc.searchParams.get("redirect_uri")).toContain(
      "/api/oauth/callback",
    );
  });

  it("honours X-Forwarded-Proto and X-Forwarded-Host for the redirect URI when PUBLIC_BASE_URL is unset", async () => {
    const res = await request(makeApp())
      .get("/api/oauth/login")
      .set("X-Forwarded-Proto", "https")
      .set("X-Forwarded-Host", "custom.zolto.ch");
    const loc = new URL(res.headers.location);
    expect(loc.searchParams.get("redirect_uri")).toBe(
      "https://custom.zolto.ch/api/oauth/callback",
    );
  });

  it("uses the canonical PUBLIC_BASE_URL origin for the redirect URI, ignoring a tenant subdomain's own host", async () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.ch";
    const res = await request(makeApp())
      .get("/api/oauth/login")
      .set("X-Forwarded-Proto", "https")
      .set("X-Forwarded-Host", "blah.zolto.ch");
    const loc = new URL(res.headers.location);
    // Google only ever sees one registered redirect_uri, regardless of which
    // tenant subdomain the merchant started the login from.
    expect(loc.searchParams.get("redirect_uri")).toBe(
      "https://zolto.ch/api/oauth/callback",
    );
  });

  it("stashes a cross-subdomain next target as an absolute URL, cookie scoped to the shared root domain", async () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.ch";
    const res = await request(makeApp())
      .get(
        "/api/oauth/login?next=" +
          encodeURIComponent("https://blah.zolto.ch/admin"),
      )
      .set("X-Forwarded-Proto", "https")
      .set("X-Forwarded-Host", "blah.zolto.ch");
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(
      ";",
    );
    expect(decodeURIComponent(setCookie)).toContain(
      "oauth_next=https://blah.zolto.ch/admin",
    );
    // Widened to the shared root domain so it's readable once Google
    // redirects the browser back to the canonical zolto.ch host.
    expect(setCookie.toLowerCase()).toContain("domain=.zolto.ch");
  });

  it("rejects a next target on an unrelated host even with PUBLIC_BASE_URL set", async () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.ch";
    const res = await request(makeApp()).get(
      "/api/oauth/login?next=" + encodeURIComponent("https://evil.example.com/"),
    );
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(
      ";",
    );
    expect(setCookie).toContain("oauth_next=;");
  });

  it("stashes a safe next path in a short-lived cookie", async () => {
    const res = await request(makeApp()).get("/api/oauth/login?next=/claim/x");
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(
      ";",
    );
    expect(setCookie).toContain("oauth_next=");
    expect(decodeURIComponent(setCookie)).toContain("/claim/x");
  });

  it("clears the next cookie when the requested next path is unsafe", async () => {
    const res = await request(makeApp()).get(
      "/api/oauth/login?next=//evil.com",
    );
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(
      ";",
    );
    expect(setCookie).toContain("oauth_next=;");
  });

  it("returns 500 when GOOGLE_CLIENT_ID is missing", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await request(makeApp()).get("/api/oauth/login");
    expect(res.status).toBe(500);
    expect(res.text).toContain("not configured");
  });
});

describe("GET /api/oauth/callback", () => {
  function mockGoogle({
    email,
    name = "Jane",
    sub = "sub-123",
    tokenOk = true,
    userOk = true,
  }: {
    email: string;
    name?: string;
    sub?: string;
    tokenOk?: boolean;
    userOk?: boolean;
  }) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("oauth2.googleapis.com/token")) {
          return {
            ok: tokenOk,
            status: tokenOk ? 200 : 400,
            statusText: "Bad Request",
            json: async () => ({ access_token: "at", id_token: "it" }),
            text: async () => "token error detail",
          };
        }
        return {
          ok: userOk,
          status: userOk ? 200 : 401,
          statusText: "Unauthorized",
          json: async () => ({ sub, email, name, email_verified: true }),
          text: async () => "userinfo error detail",
        };
      }),
    );
  }

  it("returns 400 when Google reports an error param", async () => {
    const res = await request(makeApp()).get(
      "/api/oauth/callback?error=access_denied",
    );
    expect(res.status).toBe(400);
    expect(res.text).toContain("access_denied");
  });

  it("returns 400 when the authorization code is missing", async () => {
    const res = await request(makeApp()).get("/api/oauth/callback");
    expect(res.status).toBe(400);
    expect(res.text).toContain("Missing authorization code");
  });

  it("returns 500 when the server OAuth config is incomplete", async () => {
    delete process.env.JWT_SECRET;
    const res = await request(makeApp()).get("/api/oauth/callback?code=abc");
    expect(res.status).toBe(500);
    expect(res.text).toContain("configuration is incomplete");
  });

  it("signs in the platform admin with the admin role and lands on /admin", async () => {
    mockGoogle({ email: "Admin@Example.com" });
    const res = await request(makeApp()).get("/api/oauth/callback?code=abc");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin");
    expect(upsertUser).toHaveBeenCalledWith(
      expect.objectContaining({
        openId: "google:sub-123",
        email: "Admin@Example.com",
        loginMethod: "google",
        role: "admin",
      }),
    );
    const setCookie = (res.headers["set-cookie"] as unknown as string[]).join(
      ";",
    );
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
  });

  it("signs in a regular user without forcing a role and lands on /", async () => {
    mockGoogle({ email: "someone@example.com" });
    const res = await request(makeApp()).get("/api/oauth/callback?code=abc");
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/");
    const arg = upsertUser.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.role).toBeUndefined();
  });

  it("redirects to a stashed safe next path when present", async () => {
    mockGoogle({ email: "someone@example.com" });
    const res = await request(makeApp())
      .get("/api/oauth/callback?code=abc")
      .set("Cookie", "oauth_next=/claim/mystore");
    expect(res.headers.location).toBe("/claim/mystore");
  });

  it("ignores an unsafe stashed next path and falls back", async () => {
    mockGoogle({ email: "someone@example.com" });
    const res = await request(makeApp())
      .get("/api/oauth/callback?code=abc")
      .set("Cookie", "oauth_next=https://evil.com");
    expect(res.headers.location).toBe("/");
  });

  it("redirects a tenant admin back to their own subdomain after the canonical-host callback", async () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.ch";
    mockGoogle({ email: "someone@example.com" });
    const res = await request(makeApp())
      .get("/api/oauth/callback?code=abc")
      .set("Cookie", "oauth_next=https://blah.zolto.ch/admin");
    expect(res.headers.location).toBe("https://blah.zolto.ch/admin");
  });

  it("still rejects a stashed next target on an unrelated host when PUBLIC_BASE_URL is set", async () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.ch";
    mockGoogle({ email: "someone@example.com" });
    const res = await request(makeApp())
      .get("/api/oauth/callback?code=abc")
      .set("Cookie", "oauth_next=https://evil.example.com/");
    expect(res.headers.location).toBe("/");
  });

  it("returns 500 when the token exchange fails", async () => {
    mockGoogle({ email: "x@example.com", tokenOk: false });
    const res = await request(makeApp()).get("/api/oauth/callback?code=abc");
    expect(res.status).toBe(500);
    expect(res.text).toContain("Authentication failed");
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it("returns 500 when the userinfo request fails", async () => {
    mockGoogle({ email: "x@example.com", userOk: false });
    const res = await request(makeApp()).get("/api/oauth/callback?code=abc");
    expect(res.status).toBe(500);
    expect(upsertUser).not.toHaveBeenCalled();
  });
});
