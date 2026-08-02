import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import type { Request, Response } from "express";

const mocks = vi.hoisted(() => ({
  verifyWebhook: vi.fn((_req: Request, res: Response) => {
    res.status(200).send("challenge-echo");
  }),
  handleWebhookMessage: vi.fn(async (_req: Request, res: Response) => {
    res.sendStatus(200);
  }),
  handleSlackEvent: vi.fn(async (req: Request, res: Response) => {
    // Echo whether the raw body made it through, so the test can assert the
    // route preserved the bytes Slack's signature check needs.
    res.json({ rawBody: (req as Request & { rawBody?: string }).rawBody });
  }),
  startDiscordGateway: vi.fn(async () => {}),
  channelSecret: vi.fn(),
  getTenantByWhatsappNumber: vi.fn(),
}));

vi.mock("./whatsapp", async (importOriginal) => {
  const real = await importOriginal<typeof import("./whatsapp")>();
  return {
    // businessPhoneOf is the REAL pure helper — the routing test below relies
    // on it actually extracting the phone from a Meta-shaped payload.
    businessPhoneOf: real.businessPhoneOf,
    verifyWebhook: mocks.verifyWebhook,
    handleWebhookMessage: mocks.handleWebhookMessage,
  };
});
vi.mock("./slack", () => ({ handleSlackEvent: mocks.handleSlackEvent }));
vi.mock("./discord", () => ({
  startDiscordGateway: mocks.startDiscordGateway,
}));
vi.mock("./channelCredentials", () => ({
  channelSecret: mocks.channelSecret,
}));
vi.mock("./db", () => ({
  getTenantByWhatsappNumber: mocks.getTenantByWhatsappNumber,
}));

import { registerChannelIntakeRoutes, startChannelIntake } from "./channels";

function buildApp() {
  const app = express();
  registerChannelIntakeRoutes(app);
  return app;
}

/** A Meta-shaped webhook body addressed to a given business number. */
function whatsappBody(phone = "+41790000000") {
  return {
    entry: [
      { changes: [{ value: { metadata: { display_phone_number: phone } } }] },
    ],
  };
}

function metaSignature(body: string, secret: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("channel intake routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTenantByWhatsappNumber.mockResolvedValue(undefined);
    mocks.channelSecret.mockResolvedValue(null);
  });

  it("routes the WhatsApp GET handshake to verifyWebhook", async () => {
    const res = await request(buildApp()).get(
      "/api/whatsapp/webhook?hub.mode=subscribe",
    );
    expect(res.status).toBe(200);
    expect(res.text).toBe("challenge-echo");
    expect(mocks.verifyWebhook).toHaveBeenCalledOnce();
  });

  it("accepts a WhatsApp POST when no app secret is configured anywhere", async () => {
    const res = await request(buildApp())
      .post("/api/whatsapp/webhook")
      .send(whatsappBody());
    expect(res.status).toBe(200);
    expect(mocks.handleWebhookMessage).toHaveBeenCalledOnce();
  });

  it("verifies against the TENANT'S app secret, resolved by business number", async () => {
    mocks.getTenantByWhatsappNumber.mockResolvedValue({
      tenant: { id: 7 },
      settings: null,
    });
    mocks.channelSecret.mockResolvedValue("tenant-secret");
    const body = JSON.stringify(whatsappBody("+41791112233"));

    const res = await request(buildApp())
      .post("/api/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", metaSignature(body, "tenant-secret"))
      .send(body);

    expect(res.status).toBe(200);
    expect(mocks.getTenantByWhatsappNumber).toHaveBeenCalledWith(
      "+41791112233",
    );
    expect(mocks.channelSecret).toHaveBeenCalledWith(7, "whatsapp_app_secret");
    expect(mocks.handleWebhookMessage).toHaveBeenCalledOnce();
  });

  it("refuses a WhatsApp POST whose signature doesn't match the secret", async () => {
    mocks.channelSecret.mockResolvedValue("real-secret");
    const body = JSON.stringify(whatsappBody());

    const res = await request(buildApp())
      .post("/api/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", metaSignature(body, "attacker-secret"))
      .send(body);

    expect(res.status).toBe(403);
    expect(mocks.handleWebhookMessage).not.toHaveBeenCalled();
  });

  it("refuses a signed-looking POST with no signature header at all", async () => {
    mocks.channelSecret.mockResolvedValue("real-secret");
    const res = await request(buildApp())
      .post("/api/whatsapp/webhook")
      .send(whatsappBody());
    expect(res.status).toBe(403);
    expect(mocks.handleWebhookMessage).not.toHaveBeenCalled();
  });

  it("hands Slack events the raw body its signature check needs", async () => {
    const body = JSON.stringify({ type: "event_callback", event: {} });
    const res = await request(buildApp())
      .post("/api/slack/events")
      .set("Content-Type", "application/json")
      .send(body);
    expect(res.status).toBe(200);
    expect(mocks.handleSlackEvent).toHaveBeenCalledOnce();
    // The exact bytes, not a re-serialisation — signatures are byte-sensitive.
    expect(res.body.rawBody).toBe(body);
  });

  it("starts the Discord gateway from startChannelIntake", () => {
    startChannelIntake();
    expect(mocks.startDiscordGateway).toHaveBeenCalledOnce();
  });
});
