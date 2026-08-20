/**
 * Slack Events API handler for Kalakosh Zurich
 *
 * The store owner posts a message (with optional image) to a designated Slack channel.
 * This handler receives the event, parses the product details with an LLM, downloads
 * any attached image, and creates the product in the database.
 *
 * Credentials are per-tenant first (the encrypted vault, providers
 * "slack_bot_token" / "slack_signing_secret" — a merchant installing their own
 * Slack app in their own workspace), falling back to the platform env vars:
 *   SLACK_BOT_TOKEN   – Bot OAuth token (xoxb-...)
 *   SLACK_SIGNING_SECRET – Used to verify request signatures
 */

import { BRAND } from "@shared/brand";
import axios from "axios";
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import {
  createProduct,
  getTenantBySlackChannelId,
  getTenantSettings,
} from "./db";
import { storagePut } from "./storage";
import type { TenantBranding } from "./_core/email";
import { channelSecret } from "./channelCredentials";
import {
  buildIntakeExtractionPrompt,
  fallbackProduct,
  getVerticalContext,
} from "./verticals";

// ─── Signature Verification ───────────────────────────────────────────────────

function verifySlackSignature(
  req: Request,
  signingSecret: string | null,
): boolean {
  if (!signingSecret) {
    console.warn(
      "[Slack] No signing secret (tenant vault or SLACK_SIGNING_SECRET env) — skipping signature verification",
    );
    return true;
  }

  const timestamp = req.headers["x-slack-request-timestamp"] as string;
  const slackSignature = req.headers["x-slack-signature"] as string;

  if (!timestamp || !slackSignature) return false;

  // Prevent replay attacks: reject requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  // Use raw body buffer stored by the rawBody middleware, falling back to JSON.stringify
  const rawBody: string =
    (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  const sigBaseString = `v0:${timestamp}:${rawBody}`;
  const hmac = crypto
    .createHmac("sha256", signingSecret)
    .update(sigBaseString)
    .digest("hex");
  const computedSig = `v0=${hmac}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computedSig, "utf8"),
      Buffer.from(slackSignature, "utf8"),
    );
  } catch {
    return false;
  }
}

// ─── Main Event Handler ───────────────────────────────────────────────────────

export async function handleSlackEvent(req: Request, res: Response) {
  const body = req.body;

  // 1. URL verification challenge (one-time setup)
  if (body.type === "url_verification") {
    return res.json({ challenge: body.challenge });
  }

  // 2. Verify signature. The channel id is read from the (unverified) payload
  // only to pick WHICH signing secret applies — the tenant's own (vault) when
  // they installed their own Slack app, else the platform env secret. The
  // HMAC over the raw bytes is still what decides.
  const preEvent = body.event as { channel?: string } | undefined;
  const preTenant = preEvent?.channel
    ? await getTenantBySlackChannelId(preEvent.channel)
    : undefined;
  const signingSecret = await channelSecret(
    preTenant?.id,
    "slack_signing_secret",
  );
  if (!verifySlackSignature(req, signingSecret)) {
    console.warn("[Slack] Invalid signature");
    return res.sendStatus(403);
  }

  // Acknowledge immediately — Slack requires a 200 within 3 seconds
  res.sendStatus(200);

  try {
    const event = body.event;
    if (!event) return;

    // Only process regular user messages (not bot messages, not edits)
    if (event.type !== "message") return;
    if (event.subtype && event.subtype !== "file_share") return;
    if (event.bot_id) return; // ignore bot messages

    const channelId: string = event.channel ?? "";
    const text: string = event.text ?? "";
    const files: SlackFile[] = event.files ?? [];

    // ── Tenant already resolved for the signature check above ───────────────
    const tenant = preTenant;
    if (!tenant) {
      console.log(`[Slack] No tenant mapped to channel ${channelId}, skipping`);
      return;
    }

    const settings = await getTenantSettings(tenant.id);
    const branding: TenantBranding = {
      tenantName: settings?.whiteLabelName ?? tenant.name,
      tenantDomain:
        tenant.domain ??
        settings?.publicDomain ??
        process.env.PUBLIC_BASE_URL ??
        BRAND.url,
      contactEmail: settings?.contactEmail ?? undefined,
    };

    // Need at least some text to parse product info
    if (!text.trim() && files.length === 0) return;

    // Download the first image attachment if present
    let imageUrl: string | null = null;
    if (files.length > 0) {
      const imageFile = files.find(
        (f) =>
          f.mimetype?.startsWith("image/") ||
          f.filetype === "jpg" ||
          f.filetype === "png",
      );
      if (imageFile) {
        imageUrl = await downloadSlackFile(tenant.id, imageFile);
      }
    }

    // Parse product details using tenant-branded prompt. An image-only
    // message still creates a placeholder listing named after the vertical's
    // fallback item (previously the hard-coded "New jewelry item").
    const placeholder = text.trim()
      ? text
      : `New ${fallbackProduct(await getVerticalContext(tenant.id)).nameEn}`;
    const parsed = await parseProductFromMessage(
      placeholder,
      tenant.id,
      branding.tenantName,
    );
    if (!parsed) {
      console.log("[Slack] Could not parse product from message, skipping");
      return;
    }

    // Create the product
    await createProduct({
      name: parsed.name,
      description: parsed.description,
      price: String(parsed.price),
      category: parsed.category,
      imageUrl: imageUrl ?? undefined,
      imageKey: imageUrl ? `slack/${Date.now()}` : undefined,
      visible: true,
      source: "whatsapp",
      tenantId: tenant.id,
    });

    // Notify the owner with tenant branding
    await notifyOwner({
      title: `New product added via Slack — ${branding.tenantName}`,
      content: `✨ "${parsed.name}" has been added to the ${branding.tenantName} catalogue at CHF ${parsed.price}.`,
    });

    console.log(
      `[Slack] Product created for ${branding.tenantName}: ${parsed.name} @ CHF ${parsed.price}`,
    );
  } catch (err) {
    console.error("[Slack] Error processing event:", err);
  }
}

// ─── LLM Parser ──────────────────────────────────────────────────────────────

export async function parseProductFromMessage(
  text: string,
  tenantId: number,
  tenantName?: string,
): Promise<{
  name: string;
  description: string;
  price: number;
  category: string;
} | null> {
  if (!text.trim()) return null;

  try {
    // The prompt is assembled from the tenant's vertical + their actual
    // category list (shared with the Discord and WhatsApp intake bots).
    const vc = await getVerticalContext(tenantId, tenantName ?? "your store");
    const { system, jsonSchema } = buildIntakeExtractionPrompt(vc);
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: `Extract product info from this message:\n\n${text}`,
        },
      ],
      // Reasoning models default to reasoning ON and Groq strips those
      // tokens from `content`, leaving structured output empty — this is a
      // direct extraction task, so turn it off (see InvokeParams in llm.ts).
      reasoning_effort: "none",
      response_format: {
        type: "json_schema",
        json_schema: jsonSchema,
      },
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) return null;
    const content =
      typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
    const parsed = JSON.parse(content);

    return {
      name: parsed.name,
      description: parsed.description,
      price: Number(parsed.price),
      category: parsed.category,
    };
  } catch (err) {
    console.error("[Slack] LLM parsing error:", err);
    return null;
  }
}

// ─── File Download ────────────────────────────────────────────────────────────

interface SlackFile {
  id: string;
  url_private: string;
  mimetype?: string;
  filetype?: string;
  name?: string;
}

async function downloadSlackFile(
  tenantId: number,
  file: SlackFile,
): Promise<string | null> {
  // The tenant's own bot token when they installed their own Slack app,
  // else the platform SLACK_BOT_TOKEN env fallback.
  const token = await channelSecret(tenantId, "slack_bot_token");
  if (!token) {
    console.warn(
      "[Slack] No bot token (tenant vault or SLACK_BOT_TOKEN env), cannot download file",
    );
    return null;
  }

  try {
    const response = await axios.get(file.url_private, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
    });

    const contentType = file.mimetype ?? "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const key = `slack/${Date.now()}.${ext}`;

    const { url } = await storagePut(
      tenantId,
      key,
      Buffer.from(response.data),
      contentType,
    );
    return url;
  } catch (err) {
    console.error("[Slack] File download error:", err);
    return null;
  }
}
