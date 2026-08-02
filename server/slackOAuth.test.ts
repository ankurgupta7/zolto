import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

const { ENV } = vi.hoisted(() => ({
  ENV: { cookieSecret: "test-cookie-secret" },
}));
const setTenantSecret = vi.hoisted(() => vi.fn());

vi.mock("./_core/env", () => ({ ENV }));
vi.mock("./tenantSecrets", () => ({
  setTenantSecret: (...a: unknown[]) => setTenantSecret(...a),
}));

import {
  buildSlackOAuthState,
  verifySlackOAuthState,
  buildSlackAuthorizeUrl,
  buildDiscordInviteUrl,
  registerSlackOAuthRoutes,
} from "./slackOAuth";

function buildApp() {
  const app = express();
  registerSlackOAuthRoutes(app);
  return app;
}

function slackFetch(json: unknown) {
  const spy = vi.fn(async () => ({ json: async () => json }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

beforeEach(() => {
  vi.clearAllMocks();
  ENV.cookieSecret = "test-cookie-secret";
  process.env.SLACK_CLIENT_ID = "client-id";
  process.env.SLACK_CLIENT_SECRET = "client-secret";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SLACK_CLIENT_ID;
  delete process.env.SLACK_CLIENT_SECRET;
  delete process.env.DISCORD_CLIENT_ID;
});

describe("OAuth state", () => {
  it("round-trips the tenant id", () => {
    const state = buildSlackOAuthState(42);
    expect(verifySlackOAuthState(state)).toBe(42);
  });

  it("expires after its TTL", () => {
    const state = buildSlackOAuthState(42, Date.now() - 16 * 60 * 1000);
    expect(verifySlackOAuthState(state)).toBeNull();
  });

  it("rejects a re-aimed tenant id (signature mismatch)", () => {
    const state = buildSlackOAuthState(42);
    const [, exp, sig] = state.split(".");
    expect(verifySlackOAuthState(`7.${exp}.${sig}`)).toBeNull();
  });

  it("rejects garbage", () => {
    expect(verifySlackOAuthState("nope")).toBeNull();
    expect(verifySlackOAuthState("1.2")).toBeNull();
  });
});

describe("buildSlackAuthorizeUrl / buildDiscordInviteUrl", () => {
  it("builds a per-tenant authorize URL with signed state", () => {
    const url = new URL(buildSlackAuthorizeUrl(42)!);
    expect(url.origin + url.pathname).toBe(
      "https://slack.com/oauth/v2/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(verifySlackOAuthState(url.searchParams.get("state")!)).toBe(42);
    expect(url.searchParams.get("redirect_uri")).toContain(
      "/api/slack/oauth/callback",
    );
  });

  it("is null when the platform has no Slack app", () => {
    delete process.env.SLACK_CLIENT_ID;
    expect(buildSlackAuthorizeUrl(42)).toBeNull();
  });

  it("builds the Discord bot invite only when a client id exists", () => {
    expect(buildDiscordInviteUrl()).toBeNull();
    process.env.DISCORD_CLIENT_ID = "disc-id";
    const url = new URL(buildDiscordInviteUrl()!);
    expect(url.searchParams.get("scope")).toBe("bot");
    expect(url.searchParams.get("client_id")).toBe("disc-id");
  });
});

describe("GET /api/slack/oauth/callback", () => {
  it("exchanges the code and stores the bot token in the vault", async () => {
    const fetchSpy = slackFetch({ ok: true, access_token: "xoxb-workspace" });

    const res = await request(buildApp()).get(
      `/api/slack/oauth/callback?code=c123&state=${buildSlackOAuthState(42)}`,
    );

    expect(res.status).toBe(302);
    expect(res.headers.location).toBe("/admin/channels?slack=connected");
    expect(setTenantSecret).toHaveBeenCalledWith(
      42,
      "slack_bot_token",
      "xoxb-workspace",
    );
    const body = String(
      (fetchSpy.mock.calls[0][1] as { body: URLSearchParams }).body,
    );
    expect(body).toContain("code=c123");
  });

  it("refuses a forged or expired state without calling Slack", async () => {
    const fetchSpy = slackFetch({ ok: true, access_token: "xoxb-x" });
    const res = await request(buildApp()).get(
      "/api/slack/oauth/callback?code=c123&state=42.123.deadbeef",
    );
    expect(res.headers.location).toBe("/admin/channels?slack=error");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setTenantSecret).not.toHaveBeenCalled();
  });

  it("reports an error when Slack refuses the exchange", async () => {
    slackFetch({ ok: false, error: "invalid_code" });
    const res = await request(buildApp()).get(
      `/api/slack/oauth/callback?code=bad&state=${buildSlackOAuthState(42)}`,
    );
    expect(res.headers.location).toBe("/admin/channels?slack=error");
    expect(setTenantSecret).not.toHaveBeenCalled();
  });

  it("handles the user cancelling on Slack's screen", async () => {
    const res = await request(buildApp()).get(
      "/api/slack/oauth/callback?error=access_denied",
    );
    expect(res.headers.location).toBe("/admin/channels?slack=error");
    expect(setTenantSecret).not.toHaveBeenCalled();
  });
});
