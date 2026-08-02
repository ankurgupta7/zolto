import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const getTenantSecret = vi.hoisted(() => vi.fn());
vi.mock("./tenantSecrets", () => ({
  getTenantSecret: (...a: unknown[]) => getTenantSecret(...a),
}));

import {
  channelSecret,
  CHANNEL_SECRET_PROVIDERS,
  CHANNEL_SECRET_LABELS,
} from "./channelCredentials";

beforeEach(() => {
  vi.clearAllMocks();
  getTenantSecret.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.WHATSAPP_TOKEN;
});

describe("channelSecret", () => {
  it("prefers the tenant's own vault entry over the platform env var", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-platform";
    getTenantSecret.mockResolvedValue("xoxb-tenant");
    expect(await channelSecret(7, "slack_bot_token")).toBe("xoxb-tenant");
    expect(getTenantSecret).toHaveBeenCalledWith(7, "slack_bot_token");
  });

  it("falls back to the env var when the tenant has no vault entry", async () => {
    process.env.SLACK_BOT_TOKEN = "xoxb-platform";
    expect(await channelSecret(7, "slack_bot_token")).toBe("xoxb-platform");
  });

  it("falls back to env when there is no tenant at all (unmapped webhook)", async () => {
    process.env.WHATSAPP_TOKEN = "platform-token";
    expect(await channelSecret(undefined, "whatsapp_token")).toBe(
      "platform-token",
    );
    expect(getTenantSecret).not.toHaveBeenCalled();
  });

  it("degrades to the env fallback when the vault errors (no key, no DB)", async () => {
    process.env.WHATSAPP_TOKEN = "platform-token";
    getTenantSecret.mockRejectedValue(
      new Error("TENANT_SECRETS_KEY is not set"),
    );
    expect(await channelSecret(7, "whatsapp_token")).toBe("platform-token");
  });

  it("returns null when neither vault nor env has the credential", async () => {
    expect(await channelSecret(7, "whatsapp_token")).toBeNull();
  });

  it("labels every provider for the admin UI", () => {
    for (const p of CHANNEL_SECRET_PROVIDERS) {
      expect(CHANNEL_SECRET_LABELS[p]).toBeTruthy();
    }
  });
});
