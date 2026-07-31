import axios from "axios";
import type { Request, Response } from "express";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@shared/const";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { createProduct } from "./db";
import { storagePut } from "./storage";
import type { TenantBranding } from "./_core/email";
import { tenants, tenantSettings } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { getDb } from "./db";

// These AI extractors describe a single photographed/described piece, so "Sets"
// is folded into "Other" (see the prompt) and deliberately omitted from the
// choices offered to the model. Derived from the canonical list so the rest of
// the categories can never drift.
const AI_CATEGORIES = PRODUCT_CATEGORIES.filter((c) => c !== "Sets");

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN ?? "";
const WHATSAPP_VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN ?? "kalakosh_verify_token";

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
      tenantDomain: process.env.PUBLIC_BASE_URL ?? "https://zolto.ch",
    };

    if (businessPhone) {
      const db = await getDb();
      if (db) {
        const result = await db
          .select({ tenant: tenants, settings: tenantSettings })
          .from(tenants)
          .leftJoin(tenantSettings, eq(tenants.id, tenantSettings.tenantId))
          .where(eq(tenantSettings.whatsappNumber, businessPhone))
          .limit(1);
        if (result.length > 0) {
          const row = result[0];
          tenantId = row.tenant.id;
          branding = {
            tenantName: row.settings?.whiteLabelName ?? row.tenant.name,
            tenantDomain:
              row.tenant.domain ??
              row.settings?.publicDomain ??
              process.env.PUBLIC_BASE_URL ??
              "https://zolto.ch",
            contactEmail: row.settings?.contactEmail ?? undefined,
          };
        }
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
        imageUrl = await downloadWhatsAppMedia(mediaId, tenantId);
      }
    } else if (messageType === "document") {
      textContent = message.document?.caption ?? "";
      const mediaId = message.document?.id;
      if (mediaId) {
        imageUrl = await downloadWhatsAppMedia(mediaId, tenantId);
      }
    }

    if (!textContent && !imageUrl) {
      console.log("[WhatsApp] No usable content in message, skipping");
      return;
    }

    // Parse product details with tenant-branded LLM prompt
    const parsed = await parseProductFromMessage(
      textContent,
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
  tenantName?: string,
): Promise<{
  name: string;
  description: string;
  price: number;
  category: Exclude<ProductCategory, "Sets">;
} | null> {
  if (!text.trim()) return null;

  try {
    const storeName = tenantName ?? "your store";
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content: `You are a product data extractor for ${storeName}.
Extract product information from the owner's message and return a JSON object.
Write the product name and description in German (Swiss German spelling: use ss instead of ß).

Categories available: ${AI_CATEGORIES.map((c) => `"${c}"`).join(", ")}

Rules:
- name: short product name (2-6 words, elegant)
- description: full product description as provided, cleaned up
- price: numeric value only (no currency symbols)
- category: must be exactly one of the body-part-based categories above; infer from context if not explicit
  * Necklaces → necklaces, pendants, chokers
  * Earrings → studs, drops, hoops, chandeliers
  * Rings → finger rings
  * Bracelets → chain bracelets, cuffs
  * Bangles → rigid bangles
  * Anklets → ankle chains, payal
  * Brooches → pins, brooches
  * Hair Accessories → hair pins, tikka
  * Other → sets or pieces not fitting the above

Return ONLY valid JSON, no markdown, no explanation.`,
        },
        {
          role: "user",
          content: `Extract product info from this message:\n\n${text}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "product_info",
          strict: true,
          schema: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Short elegant product name",
              },
              description: {
                type: "string",
                description: "Full product description",
              },
              price: { type: "number", description: "Numeric price value" },
              category: {
                type: "string",
                enum: AI_CATEGORIES,
                description: "Product category",
              },
            },
            required: ["name", "description", "price", "category"],
            additionalProperties: false,
          },
        },
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
  mediaId: string,
  tenantId?: number,
): Promise<string | null> {
  if (!WHATSAPP_TOKEN) {
    console.warn("[WhatsApp] No WHATSAPP_TOKEN set, cannot download media");
    return null;
  }

  try {
    // Step 1: Get the media URL
    const mediaInfoRes = await axios.get(
      `https://graph.facebook.com/v18.0/${mediaId}`,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } },
    );
    const mediaUrl = mediaInfoRes.data?.url;
    if (!mediaUrl) return null;

    // Step 2: Download the media bytes
    const mediaRes = await axios.get(mediaUrl, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
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
      key,
      Buffer.from(mediaRes.data),
      contentType,
      tenantId,
    );
    return url;
  } catch (err) {
    console.error("[WhatsApp] Media download error:", err);
    return null;
  }
}
