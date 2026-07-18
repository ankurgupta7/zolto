import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

const setTenantStripeConnectAccount = vi.fn();
vi.mock("./db", () => ({
  setTenantStripeConnectAccount: (...args: unknown[]) =>
    setTenantStripeConnectAccount(...args),
}));

const oauthToken = vi.fn();
const getStripe = vi.fn();
vi.mock("./stripe", () => ({
  getStripe: (...args: unknown[]) => getStripe(...args),
}));

import {
  buildConnectAuthorizeUrl,
  registerStripeConnectRoutes,
} from "./stripeConnect";

const ENV_KEYS = [
  "STRIPE_CONNECT_CLIENT_ID",
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
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
  getStripe.mockReturnValue({ oauth: { token: oauthToken } });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
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

  it("builds a Stripe Connect authorize URL with a signed state", async () => {
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
