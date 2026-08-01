import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
}));

vi.mock("./whatsapp", () => ({
  verifyWebhook: mocks.verifyWebhook,
  handleWebhookMessage: mocks.handleWebhookMessage,
}));
vi.mock("./slack", () => ({ handleSlackEvent: mocks.handleSlackEvent }));
vi.mock("./discord", () => ({
  startDiscordGateway: mocks.startDiscordGateway,
}));

// WHATSAPP_APP_SECRET is read at module load, so each test that changes it
// must re-import a fresh module instance.
async function buildApp(appSecret?: string) {
  vi.resetModules();
  if (appSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
  else process.env.WHATSAPP_APP_SECRET = appSecret;
  const { registerChannelIntakeRoutes } = await import("./channels");
  const app = express();
  registerChannelIntakeRoutes(app);
  return app;
}

afterEach(() => {
  delete process.env.WHATSAPP_APP_SECRET;
});

describe("channel intake routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes the WhatsApp GET handshake to verifyWebhook", async () => {
    const res = await request(await buildApp()).get(
      "/api/whatsapp/webhook?hub.mode=subscribe",
    );
    expect(res.status).toBe(200);
    expect(res.text).toBe("challenge-echo");
    expect(mocks.verifyWebhook).toHaveBeenCalledOnce();
  });

  it("accepts a WhatsApp POST when no app secret is configured", async () => {
    const res = await request(await buildApp())
      .post("/api/whatsapp/webhook")
      .send({ entry: [] });
    expect(res.status).toBe(200);
    expect(mocks.handleWebhookMessage).toHaveBeenCalledOnce();
  });

  it("refuses a WhatsApp POST with a bad signature when the secret is set", async () => {
    const res = await request(await buildApp("app-secret"))
      .post("/api/whatsapp/webhook")
      .set("X-Hub-Signature-256", "sha256=deadbeef")
      .send({ entry: [] });
    expect(res.status).toBe(403);
    expect(mocks.handleWebhookMessage).not.toHaveBeenCalled();
  });

  it("accepts a WhatsApp POST with a valid signature", async () => {
    const body = JSON.stringify({ entry: [] });
    const sig = `sha256=${crypto
      .createHmac("sha256", "app-secret")
      .update(body)
      .digest("hex")}`;
    const res = await request(await buildApp("app-secret"))
      .post("/api/whatsapp/webhook")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", sig)
      .send(body);
    expect(res.status).toBe(200);
    expect(mocks.handleWebhookMessage).toHaveBeenCalledOnce();
  });

  it("hands Slack events the raw body its signature check needs", async () => {
    const body = JSON.stringify({ type: "event_callback", event: {} });
    const res = await request(await buildApp())
      .post("/api/slack/events")
      .set("Content-Type", "application/json")
      .send(body);
    expect(res.status).toBe(200);
    expect(mocks.handleSlackEvent).toHaveBeenCalledOnce();
    // The exact bytes, not a re-serialisation — signatures are byte-sensitive.
    expect(res.body.rawBody).toBe(body);
  });

  it("starts the Discord gateway from startChannelIntake", async () => {
    vi.resetModules();
    const { startChannelIntake } = await import("./channels");
    startChannelIntake();
    expect(mocks.startDiscordGateway).toHaveBeenCalledOnce();
  });
});
