import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  getTenantBySlackChannelId: vi.fn(),
  getTenantSettings: vi.fn(),
  createProduct: vi.fn(),
  channelSecret: vi.fn(),
  invokeLLM: vi.fn(),
}));

vi.mock("./db", () => ({
  getTenantBySlackChannelId: mocks.getTenantBySlackChannelId,
  getTenantSettings: mocks.getTenantSettings,
  createProduct: mocks.createProduct,
}));
vi.mock("./channelCredentials", () => ({
  channelSecret: mocks.channelSecret,
}));
vi.mock("./_core/llm", () => ({ invokeLLM: mocks.invokeLLM }));
vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));
vi.mock("./storage", () => ({ storagePut: vi.fn() }));

import { handleSlackEvent } from "./slack";

function fakeRes() {
  return {
    statusCode: 0,
    jsonBody: undefined as unknown,
    json(v: unknown) {
      this.jsonBody = v;
      return this;
    },
    sendStatus(code: number) {
      this.statusCode = code;
      return this;
    },
  };
}

/** A signed Slack request over `body`, using `secret` (v0 scheme). */
function signedReq(body: Record<string, unknown>, secret?: string) {
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {};
  if (secret) {
    headers["x-slack-request-timestamp"] = timestamp;
    headers["x-slack-signature"] = `v0=${crypto
      .createHmac("sha256", secret)
      .update(`v0:${timestamp}:${rawBody}`)
      .digest("hex")}`;
  }
  return { body, headers, rawBody } as unknown as Request;
}

const messageEvent = {
  type: "event_callback",
  event: { type: "message", channel: "C123", text: "Ring CHF 50" },
};

describe("handleSlackEvent signature handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTenantBySlackChannelId.mockResolvedValue(undefined);
    mocks.getTenantSettings.mockResolvedValue(undefined);
    mocks.channelSecret.mockResolvedValue(null);
    mocks.invokeLLM.mockResolvedValue({ choices: [] });
  });

  it("answers the url_verification challenge before any signature check", async () => {
    const res = fakeRes();
    await handleSlackEvent(
      signedReq({ type: "url_verification", challenge: "chal-1" }),
      res as unknown as Response,
    );
    expect(res.jsonBody).toEqual({ challenge: "chal-1" });
    expect(mocks.channelSecret).not.toHaveBeenCalled();
  });

  it("verifies with the TENANT'S signing secret, resolved from the channel", async () => {
    mocks.getTenantBySlackChannelId.mockResolvedValue({ id: 7, name: "Kala" });
    mocks.channelSecret.mockResolvedValue("tenant-signing-secret");

    const res = fakeRes();
    await handleSlackEvent(
      signedReq(messageEvent, "tenant-signing-secret"),
      res as unknown as Response,
    );

    expect(mocks.getTenantBySlackChannelId).toHaveBeenCalledWith("C123");
    expect(mocks.channelSecret).toHaveBeenCalledWith(7, "slack_signing_secret");
    expect(res.statusCode).toBe(200);
  });

  it("refuses a signature made with the wrong secret", async () => {
    mocks.getTenantBySlackChannelId.mockResolvedValue({ id: 7, name: "Kala" });
    mocks.channelSecret.mockResolvedValue("tenant-signing-secret");

    const res = fakeRes();
    await handleSlackEvent(
      signedReq(messageEvent, "attacker-secret"),
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(403);
  });

  it("accepts (with a warning) when no signing secret exists anywhere", async () => {
    const res = fakeRes();
    await handleSlackEvent(signedReq(messageEvent), res as unknown as Response);
    expect(res.statusCode).toBe(200);
  });
});
