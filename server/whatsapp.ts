import { BRAND } from "@shared/brand";
import axios from "axios";
import type { Request, Response } from "express";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { createProduct, getTenantByWhatsappNumber } from "./db";
import { storagePut } from "./storage";
import type { TenantBranding } from "./_core/email";
import { channelSecret } from "./channelCredentials";
import { buildIntakeExtractionPrompt, getVerticalContext } from "./verticals";

const WHATSAPP_VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN ?? "kalakosh_verify_token";

/**
 * The WhatsApp business number a webhook payload was delivered for — needed
 * before anything else, because both the signature check (per-tenant app
 * secret) and the intake handler key off the tenant it maps to.
 */
export function businessPhoneOf(body: unknown): string {
  const value = (
    body as {
      entry?: { changes?: { value?: { metadata?: unknown } }[] }[];
    } | null
  )?.entry?.[0]?.changes?.[0]?.value;
  const metadata = (value as { metadata?: { display_phone_number?: unknown } })
    ?.metadata;
  return typeof metadata?.display_phone_number === "string"
    ? metadata.display_phone_number
    : "";
}

// ─── Webhook Verification (GET) ───────────────────────────────────────────────

export function verifyWebhook(req: Request, res: Response) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    console.log("[WhatsApp] Webhook verified");
    res.status(200).send(challenge);
  } else {
    console.warn("[WhatsApp] Webhook verification failed");
    res.sendStatus(403);
  }
}

// ─── Incoming Message Handler (POST) ─────────────────────────────────────────

export async function handleWebhookMessage(req: Request, res: Response) {
  // Acknowledge immediately to avoid WhatsApp retries
  res.sendStatus(200);

  try {
    const body = req.body;
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    const metadata = value?.metadata;

    if (!messages || messages.length === 0) return;

    const message = messages[0];
    const messageType = message.type;

    // ── Look up tenant by WhatsApp business number ─────────────────────────
    const businessPhone = metadata?.display_phone_number ?? "";
    let tenantId: number | undefined;
    let branding: TenantBranding = {
      tenantName: "your store",
      tenantDomain: process.env.PUBLIC_BASE_URL ?? BRAND.url,
    };

    if (businessPhone) {
      const row = await getTenantByWhatsappNumber(businessPhone);
      if (row) {
        tenantId = row.tenant.id;
        branding = {
          tenantName: row.settings?.whiteLabelName ?? row.tenant.name,
          tenantDomain:
            row.tenant.domain ??
            row.settings?.publicDomain ??
            process.env.PUBLIC_BASE_URL ??
            BRAND.url,
          contactEmail: row.settings?.contactEmail ?? undefined,
        };
      }
    }

    if (!tenantId) {
      console.log(
        `[WhatsApp] No tenant mapped to business number ${businessPhone}, skipping`,
      );
      return;
    }

    let imageUrl: string | null = null;
    let textContent = "";

    // Extract text from the message
    if (messageType === "text") {
      textContent = message.text?.body ?? "";
    } else if (messageType === "image") {
      // Image with optional caption
      textContent = message.image?.caption ?? "";
      const mediaId = message.image?.id;
      if (mediaId) {
        imageUrl = await downloadWhatsAppMedia(tenantId, mediaId);
      }
    } else if (messageType === "document") {
      textContent = message.document?.caption ?? "";
      const mediaId = message.document?.id;
      if (mediaId) {
        imageUrl = await downloadWhatsAppMedia(tenantId, mediaId);
      }
    }

    if (!textContent && !imageUrl) {
      console.log("[WhatsApp] No usable content in message, skipping");
      return;
    }

    // Parse product details with tenant-branded LLM prompt
    const parsed = await parseProductFromMessage(
      textContent,
      tenantId,
      branding.tenantName,
    );
    if (!parsed) {
      console.log("[WhatsApp] Could not parse product from message");
      return;
    }

    // Create the product in the database
    await createProduct({
      name: parsed.name,
      description: parsed.description,
      price: String(parsed.price),
      category: parsed.category,
      imageUrl: imageUrl ?? undefined,
      imageKey: imageUrl ? `whatsapp/${Date.now()}` : undefined,
      visible: true,
      source: "whatsapp",
      tenantId,
    });

    // Notify the owner with tenant branding
    await notifyOwner({
      title: `New product added via WhatsApp — ${branding.tenantName}`,
      content: `✨ "${parsed.name}" has been added to the ${branding.tenantName} catalogue at $${parsed.price}.`,
    });

    console.log(
      `[WhatsApp] Product created for ${branding.tenantName}: ${parsed.name} @ $${parsed.price}`,
    );
  } catch (err) {
    console.error("[WhatsApp] Error processing webhook:", err);
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
    // category list (shared with the Discord and Slack intake bots). WhatsApp
    // intake writes German listing copy, hence germanOutput.
    const vc = await getVerticalContext(tenantId, tenantName ?? "your store");
    const { system, jsonSchema } = buildIntakeExtractionPrompt(vc, {
      germanOutput: true,
    });
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
    console.error("[WhatsApp] LLM parsing error:", err);
    return null;
  }
}

// ─── Media Download ───────────────────────────────────────────────────────────

async function downloadWhatsAppMedia(
  tenantId: number,
  mediaId: string,
): Promise<string | null> {
  // The tenant's own access token when they brought their own Meta app,
  // else the platform's WHATSAPP_TOKEN env fallback.
  const token = await channelSecret(tenantId, "whatsapp_token");
  if (!token) {
    console.warn(
      "[WhatsApp] No access token (tenant vault or WHATSAPP_TOKEN env), cannot download media",
    );
    return null;
  }

  try {
    // Step 1: Get the media URL
    const mediaInfoRes = await axios.get(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const mediaUrl = mediaInfoRes.data?.url;
    if (!mediaUrl) return null;

    // Step 2: Download the media bytes
    const mediaRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
      responseType: "arraybuffer",
    });

    const contentType = String(
      mediaRes.headers["content-type"] ?? "image/jpeg",
    );
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const key = `whatsapp/${Date.now()}.${ext}`;

    // Step 3: Upload to S3
    const { url } = await storagePut(
      tenantId,
      key,
      Buffer.from(mediaRes.data),
      contentType,
    );
    return url;
  } catch (err) {
    console.error("[WhatsApp] Media download error:", err);
    return null;
  }
}
