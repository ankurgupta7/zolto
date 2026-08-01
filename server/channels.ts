/**
 * Channel intake wiring — mounts the WhatsApp and Slack webhooks and starts
 * the Discord gateway, so "list products from WhatsApp, Slack, or Discord"
 * (FEATURES.multichannel-intake) is an HTTP surface a request can actually
 * reach. The handlers themselves live in whatsapp.ts / slack.ts / discord.ts;
 * this module only exposes them, mirroring how the Stripe and POS webhooks
 * are registered.
 *
 * Both webhooks verify signatures over the RAW request body, so these routes
 * carry their own JSON parser (which stashes the raw bytes) and must be
 * registered BEFORE the app-wide `express.json()` — once a body has been
 * parsed upstream, route-level parsers are skipped and the raw bytes are gone.
 */

import crypto from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import { verifyWebhook, handleWebhookMessage } from "./whatsapp";
import { handleSlackEvent } from "./slack";
import { startDiscordGateway } from "./discord";

/** Route-level JSON parser that also keeps the raw bytes for signature checks. */
const jsonWithRawBody = express.json({
  limit: "5mb",
  verify: (req, _res, buf) => {
    (req as Request & { rawBody?: string }).rawBody = buf.toString("utf8");
  },
});

const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET ?? "";

/**
 * Meta signs webhook deliveries with `X-Hub-Signature-256: sha256=<hmac>` over
 * the raw body, keyed by the app secret. Without the secret configured we log
 * and accept — the same posture slack.ts takes for a missing signing secret —
 * because the handler still refuses to act unless the payload maps to a
 * tenant's registered business number.
 */
export function verifyWhatsAppSignature(req: Request): boolean {
  if (!WHATSAPP_APP_SECRET) {
    console.warn(
      "[WhatsApp] No WHATSAPP_APP_SECRET set — skipping signature verification",
    );
    return true;
  }
  const signature = req.headers["x-hub-signature-256"];
  const rawBody = (req as Request & { rawBody?: string }).rawBody;
  if (typeof signature !== "string" || !rawBody) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest("hex")}`;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    return false;
  }
}

export function registerChannelIntakeRoutes(app: Express): void {
  // WhatsApp Cloud API: GET is Meta's one-time subscription handshake,
  // POST carries incoming messages.
  app.get("/api/whatsapp/webhook", verifyWebhook);
  app.post(
    "/api/whatsapp/webhook",
    jsonWithRawBody,
    (req: Request, res: Response) => {
      if (!verifyWhatsAppSignature(req)) {
        console.warn("[WhatsApp] Invalid webhook signature");
        res.sendStatus(403);
        return;
      }
      void handleWebhookMessage(req, res);
    },
  );

  // Slack Events API — handleSlackEvent does its own signature check against
  // req.rawBody and answers the url_verification challenge.
  app.post("/api/slack/events", jsonWithRawBody, (req, res) => {
    void handleSlackEvent(req, res);
  });
}

/**
 * Start the Discord gateway (a persistent websocket, not an HTTP route).
 * Called from the server bootstrap — NOT from createApp() — so in-process
 * app tests never open a live socket. No-ops without DISCORD_BOT_TOKEN.
 */
export function startChannelIntake(): void {
  void startDiscordGateway();
}
