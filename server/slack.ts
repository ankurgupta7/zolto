/**
 * Slack Events API handler for Kalakosh Zurich
 *
 * The store owner posts a message (with optional image) to a designated Slack channel.
 * This handler receives the event, parses the product details with an LLM, downloads
 * any attached image, and creates the product in the database.
 *
 * Required env vars:
 *   SLACK_BOT_TOKEN   – Bot OAuth token (xoxb-...)
 *   SLACK_SIGNING_SECRET – Used to verify request signatures
 */

import axios from "axios";
import crypto from "node:crypto";
import type { Request, Response } from "express";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@shared/const";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import {
  createProduct,
  getTenantBySlackChannelId,
  getTenantSettings,
} from "./db";
import { storagePut } from "./storage";
import type { TenantBranding } from "./_core/email";

// These AI extractors describe a single photographed/described piece, so "Sets"
// is folded into "Other" (see the prompt) and deliberately omitted from the
// choices offered to the model. Derived from the canonical list so the rest of
// the categories can never drift.
const AI_CATEGORIES = PRODUCT_CATEGORIES.filter((c) => c !== "Sets");

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? "";
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET ?? "";

// ─── Signature Verification ───────────────────────────────────────────────────

function verifySlackSignature(req: Request): boolean {
  if (!SLACK_SIGNING_SECRET) {
    console.warn(
      "[Slack] No SLACK_SIGNING_SECRET set — skipping signature verification",
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
    .createHmac("sha256", SLACK_SIGNING_SECRET)
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

  // 2. Verify signature
  if (!verifySlackSignature(req)) {
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

    // ── Look up tenant by Slack channel ID ──────────────────────────────────
    const tenant = await getTenantBySlackChannelId(channelId);
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
        "https://zolto.ch",
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

    // Parse product details using tenant-branded prompt
    const parsed = await parseProductFromMessage(
      text || "New jewelry item",
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
Extract product information from the owner's Slack message and return a JSON object.

Available categories: ${AI_CATEGORIES.map((c) => `"${c}"`).join(", ")}

Rules:
- name: short elegant product name (2–6 words)
- description: full product description as provided, cleaned up for display
- price: numeric value only (no currency symbols; assume CHF if unspecified)
- category: must be exactly one of the body-part-based categories; infer from context if not explicit
  * Necklaces → necklaces, pendants, chokers, lariats
  * Earrings → studs, drop earrings, hoops, chandeliers
  * Rings → finger rings of any style
  * Bracelets → chain bracelets, cuffs, charm bracelets
  * Bangles → rigid circular bangles worn on the wrist
  * Anklets → ankle chains, payal
  * Brooches → pins, brooches, lapel jewellery
  * Hair Accessories → hair pins, maang tikka, tiaras
  * Other → body chains, sets, or anything that does not fit the above

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
              price: {
                type: "number",
                description: "Numeric price value in CHF",
              },
              category: {
                type: "string",
                enum: AI_CATEGORIES,
                description: "Body-part-based product category",
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
  if (!SLACK_BOT_TOKEN) {
    console.warn("[Slack] No SLACK_BOT_TOKEN set, cannot download file");
    return null;
  }

  try {
    const response = await axios.get(file.url_private, {
      headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` },
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
