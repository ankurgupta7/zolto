import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

const setTenantStripeConnectAccount = vi.fn();
const getTenantById = vi.fn();
vi.mock("./db", () => ({
  setTenantStripeConnectAccount: (...args: unknown[]) =>
    setTenantStripeConnectAccount(...args),
  getTenantById: (...args: unknown[]) => getTenantById(...args),
}));

const oauthToken = vi.fn();
const getStripe = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: (...args: unknown[]) => getStripe(...args),
}));

import {
  buildConnectAuthorizeUrl,
  connectConfigStatus,
  logConnectConfigStatus,
  registerStripeConnectRoutes,
} from "./stripeConnect";

const ENV_KEYS = [
  "STRIPE_CONNECT_CLIENT_ID",
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "PUBLIC_BASE_URL",
  "SITE_DOMAIN",
] as const;
const originalEnv: Record<string, string | undefined> = {};

function fakeReq(): never {
  return { protocol: "https", headers: { host: "zolto.example" } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
  process.env.STRIPE_CONNECT_CLIENT_ID = "ca_test_client";
  process.env.JWT_SECRET = "a-test-jwt-secret-that-is-long-enough";
  process.env.STRIPE_SECRET_KEY = "sk_test_123";
  // Unset by default so the request-derived fallback is what's under test
  // unless a specific test opts into PUBLIC_BASE_URL / SITE_DOMAIN.
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.SITE_DOMAIN;
  getStripe.mockReturnValue({ oauth: { token: oauthToken } });
  getTenantById.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

/**
 * A merchant hitting "Connect Stripe" and being told to contact support is the
 * ONLY symptom of an unconfigured platform, and until it's fixed no tenant can
 * accept online payments at all. So the missing var has to reach the logs.
 */
describe("connectConfigStatus", () => {
  it("names each missing variable", () => {
    delete process.env.STRIPE_CONNECT_CLIENT_ID;
    delete process.env.JWT_SECRET;
    expect(connectConfigStatus()).toEqual({
      configured: false,
      missing: ["STRIPE_CONNECT_CLIENT_ID", "JWT_SECRET"],
    });

    process.env.STRIPE_CONNECT_CLIENT_ID = "ca_test";
    expect(connectConfigStatus()).toEqual({
      configured: false,
      missing: ["JWT_SECRET"],
    });

    process.env.JWT_SECRET = "s3cret";
    expect(connectConfigStatus()).toEqual({ configured: true, missing: [] });
  });

  it("warns at boot when unconfigured, and stays quiet when it is", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.STRIPE_CONNECT_CLIENT_ID;
    logConnectConfigStatus();
    expect(spy).toHaveBeenCalled();
    // The warning must say what breaks, not just that something is unset.
    const text = String(spy.mock.calls[0][0]);
    expect(text).toContain("STRIPE_CONNECT_CLIENT_ID");
    expect(text).toMatch(/online and agent sales are\s+disabled/i);
    // …and must not claim in-person is affected, because it isn't.
    expect(text).toMatch(/in-person POS is unaffected/i);

    spy.mockClear();
    process.env.STRIPE_CONNECT_CLIENT_ID = "ca_test";
    process.env.JWT_SECRET = "s3cret";
    logConnectConfigStatus();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("buildConnectAuthorizeUrl", () => {
  it("returns null when STRIPE_CONNECT_CLIENT_ID is unset", async () => {
    delete process.env.STRIPE_CONNECT_CLIENT_ID;
    expect(await buildConnectAuthorizeUrl(42, fakeReq())).toBeNull();
  });

  it("returns null when JWT_SECRET is unset", async () => {
    delete process.env.JWT_SECRET;
    expect(await buildConnectAuthorizeUrl(42, fakeReq())).toBeNull();
  });

  it("logs which variable is missing, naming the tenant that hit it", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    delete process.env.STRIPE_CONNECT_CLIENT_ID;
    await buildConnectAuthorizeUrl(42, fakeReq());
    const text = String(spy.mock.calls[0]?.[0] ?? "");
    expect(text).toContain("Tenant 42");
    expect(text).toContain("STRIPE_CONNECT_CLIENT_ID");
    spy.mockRestore();
  });

  it("falls back to the request's own host when PUBLIC_BASE_URL is unset", async () => {
    const url = await buildConnectAuthorizeUrl(42, fakeReq());
    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://connect.stripe.com/oauth/authorize",
    );
    expect(parsed.searchParams.get("client_id")).toBe("ca_test_client");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("scope")).toBe("read_write");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://zolto.example/api/stripe/connect/callback",
    );
    expect(parsed.searchParams.get("state")).toEqual(expect.any(String));
  });

  // REGRESSION: same class of bug as Google OAuth's redirect_uri_mismatch on
  // tenant subdomains (server/_core/oauth.ts). Stripe requires an exact,
  // pre-registered redirect_uri, so it must always be the ONE canonical
  // origin, never whichever tenant subdomain the admin clicked "Connect
  // Stripe" from — otherwise only one tenant's subdomain would ever match
  // what's registered in the Stripe Dashboard.
  it("uses PUBLIC_BASE_URL's origin regardless of the request's own host", async () => {
    process.env.PUBLIC_BASE_URL = "https://zolto.ch";
    const url = await buildConnectAuthorizeUrl(42, fakeReq());
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://zolto.ch/api/stripe/connect/callback",
    );
  });

  it("ignores a malformed PUBLIC_BASE_URL and falls back to the request's host", async () => {
    process.env.PUBLIC_BASE_URL = "not a url";
    const url = await buildConnectAuthorizeUrl(42, fakeReq());
    const parsed = new URL(url!);
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://zolto.example/api/stripe/connect/callback",
    );
  });
});

describe("registerStripeConnectRoutes callback", () => {
  function buildApp() {
    const app = express();
    registerStripeConnectRoutes(app);
    return app;
  }

  async function getSignedState(tenantId = 42): Promise<string> {
    const url = await buildConnectAuthorizeUrl(tenantId, fakeReq());
    return new URL(url!).searchParams.get("state")!;
  }

  it("redirects with an error when Stripe reports one", async () => {
    const app = buildApp();
    const res = await request(app).get(
      "/api/stripe/connect/callback?error=access_denied",
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("stripeConnect=error");
  });

  // REGRESSION: this callback always runs on the platform's canonical host
  // (see getRedirectUri), so a relative "/admin" redirect resolves on the
  // platform apex — which has no tenant admin route — instead of the
  // tenant's own subdomain. Same class of bug as the redirect_uri fix above,
  // one step later in the same flow.
  describe("redirecting back to the tenant's own subdomain", () => {
    beforeEach(() => {
      process.env.PUBLIC_BASE_URL = "https://zolto.ch";
      getTenantById.mockResolvedValue({ id: 42, slug: "blah" });
    });

    it("sends a successful connection to https://<slug>.<root>/admin, not the platform apex", async () => {
      const state = await getSignedState(42);
      oauthToken.mockResolvedValue({ stripe_user_id: "acct_new_123" });
      const app = buildApp();

      const res = await request(app).get(
        `/api/stripe/connect/callback?code=ac_test&state=${encodeURIComponent(state)}`,
      );

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        "https://blah.zolto.ch/admin?stripeConnect=success",
      );
    });

    it("sends a failed OAuth exchange back to the tenant's own subdomain too", async () => {
      const state = await getSignedState(42);
      oauthToken.mockRejectedValue(new Error("invalid_grant"));
      const app = buildApp();

      const res = await request(app).get(
        `/api/stripe/connect/callback?code=ac_test&state=${encodeURIComponent(state)}`,
      );

      expect(res.headers.location).toBe(
        "https://blah.zolto.ch/admin?stripeConnect=error",
      );
    });

    it("sends a Stripe-reported error (e.g. the merchant clicked deny) back to the tenant's subdomain when state is present", async () => {
      const state = await getSignedState(42);
      const app = buildApp();

      const res = await request(app).get(
        `/api/stripe/connect/callback?error=access_denied&state=${encodeURIComponent(state)}`,
      );

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe(
        "https://blah.zolto.ch/admin?stripeConnect=error&reason=access_denied",
      );
    });

    it("falls back to the relative path when the tenant can't be resolved from state", async () => {
      const app = buildApp();
      const res = await request(app).get(
        "/api/stripe/connect/callback?error=access_denied",
      );
      expect(res.headers.location).toBe(
        "/admin?stripeConnect=error&reason=access_denied",
      );
    });

    it("falls back to the relative path when PUBLIC_BASE_URL/SITE_DOMAIN are unset", async () => {
      delete process.env.PUBLIC_BASE_URL;
      const state = await getSignedState(42);
      oauthToken.mockResolvedValue({ stripe_user_id: "acct_new_123" });
      const app = buildApp();

      const res = await request(app).get(
        `/api/stripe/connect/callback?code=ac_test&state=${encodeURIComponent(state)}`,
      );

      expect(res.headers.location).toBe("/admin?stripeConnect=success");
    });
  });

  it("400s when code or state is missing", async () => {
    const app = buildApp();
    const res = await request(app).get("/api/stripe/connect/callback");
    expect(res.status).toBe(400);
  });

  it("400s when the state is invalid or tampered", async () => {
    const app = buildApp();
    const res = await request(app).get(
      "/api/stripe/connect/callback?code=ac_test&state=garbage",
    );
    expect(res.status).toBe(400);
    expect(oauthToken).not.toHaveBeenCalled();
  });

  it("exchanges the code, saves the connected account, and redirects to success", async () => {
    const state = await getSignedState(42);
    oauthToken.mockResolvedValue({ stripe_user_id: "acct_new_123" });
    const app = buildApp();

    const res = await request(app).get(
      `/api/stripe/connect/callback?code=ac_test&state=${encodeURIComponent(state)}`,
    );

    expect(oauthToken).toHaveBeenCalledWith({
      grant_type: "authorization_code",
      code: "ac_test",
    });
    expect(setTenantStripeConnectAccount).toHaveBeenCalledWith(
      42,
      "acct_new_123",
    );
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("stripeConnect=success");
  });

  it("redirects to an error state when the OAuth exchange fails", async () => {
    const state = await getSignedState(42);
    oauthToken.mockRejectedValue(new Error("invalid_grant"));
    const app = buildApp();

    const res = await request(app).get(
      `/api/stripe/connect/callback?code=ac_test&state=${encodeURIComponent(state)}`,
    );

    expect(setTenantStripeConnectAccount).not.toHaveBeenCalled();
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("stripeConnect=error");
  });

  it("500s when the platform Stripe key isn't configured", async () => {
    const state = await getSignedState(42);
    getStripe.mockReturnValue(null);
    const app = buildApp();

    const res = await request(app).get(
      `/api/stripe/connect/callback?code=ac_test&state=${encodeURIComponent(state)}`,
    );
    expect(res.status).toBe(500);
    expect(oauthToken).not.toHaveBeenCalled();
  });
});
