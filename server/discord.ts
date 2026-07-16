/**
 * Discord Bot handler for Kalakosh Zurich
 *
 * The store owner posts a message (with optional image attachment) to a designated
 * Discord channel. This handler processes the Discord Gateway MESSAGE_CREATE event
 * forwarded via our polling loop, parses the product details with an LLM, downloads
 * any attached image, and creates the product in the database.
 *
 * Discord uses a WebSocket Gateway for real-time events. Since our server is a
 * standard HTTP server, we run a lightweight Discord Gateway client that connects
 * on startup and forwards MESSAGE_CREATE events to our internal handler.
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN    – Bot token from the Discord Developer Portal
 *   DISCORD_CHANNEL_ID   – The channel ID to listen for product messages
 */

import WebSocket from "ws";
import axios from "axios";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@shared/const";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import { createProduct, getProductByDiscordMessageId, getTenantByDiscordChannelId, getTenantSettings } from "./db";
import { storagePut } from "./storage";
import type { TenantBranding } from "./_core/email";

// These AI extractors describe a single photographed/described piece, so "Sets"
// is folded into "Other" (see the prompt) and deliberately omitted from the
// choices offered to the model. Derived from the canonical list so the rest of
// the categories can never drift.
const AI_CATEGORIES = PRODUCT_CATEGORIES.filter(c => c !== "Sets");

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID ?? "";
const DISCORD_API = "https://discord.com/api/v10";

// ─── LLM Parser ──────────────────────────────────────────────────────────────

export async function parseProductFromMessage(
  text: string,
  tenantName?: string
): Promise<{
  name: string;
  description: string;
  price: number;
  category: Exclude<ProductCategory, "Sets">;
} | null> {
  if (!text.trim()) return null;

  try {
    const model = process.env.LLM_MODEL;
    const storeName = tenantName ?? "your store";
    const response = await invokeLLM({
      ...(model ? { model } : {}),
      messages: [
        {
          role: "system",
          content: `You are a product data extractor for ${storeName}.
Extract product information from the owner's Discord message and return a JSON object.

Available categories: ${AI_CATEGORIES.map(c => `"${c}"`).join(", ")}

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
    console.error("[Discord] LLM parsing error:", err);
    return null;
  }
}

// ─── Image Download ───────────────────────────────────────────────────────────

interface DiscordAttachment {
  id: string;
  url: string;
  filename: string;
  content_type?: string;
  size: number;
}

async function downloadDiscordAttachment(
  attachment: DiscordAttachment
): Promise<string | null> {
  try {
    const response = await axios.get(attachment.url, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    });

    const contentType = attachment.content_type ?? "image/jpeg";
    const ext = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : contentType.includes("gif")
          ? "gif"
          : "jpg";
    const key = `discord/${Date.now()}.${ext}`;

    const { url } = await storagePut(
      key,
      Buffer.from(response.data),
      contentType
    );
    return url;
  } catch (err) {
    console.error("[Discord] Image download error:", err);
    return null;
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────

export interface DiscordMessage {
  id: string;
  channel_id: string;
  author: { id: string; bot?: boolean };
  content: string;
  attachments: DiscordAttachment[];
}

export async function handleDiscordMessage(
  message: DiscordMessage
): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;

  // ── Look up tenant by Discord channel ID ─────────────────────────────────
  const tenant = await getTenantByDiscordChannelId(message.channel_id);
  if (!tenant) {
    // If no tenant mapped to this channel, fall back to legacy single-channel mode
    if (DISCORD_CHANNEL_ID && message.channel_id !== DISCORD_CHANNEL_ID) return;
    if (!DISCORD_CHANNEL_ID) {
      console.log(`[Discord] No tenant mapped to channel ${message.channel_id}, skipping`);
      return;
    }
  }

  const tenantName = tenant?.name ?? "your store";
  const settings = tenant ? await getTenantSettings(tenant.id) : null;
  const branding: TenantBranding = {
    tenantName: settings?.whiteLabelName ?? tenantName,
    tenantDomain: tenant?.domain ?? settings?.publicDomain ?? process.env.PUBLIC_BASE_URL ?? "https://zolto.ch",
    contactEmail: settings?.contactEmail ?? undefined,
  };

  // ── Deduplication: skip if this Discord message was already processed ──────
  const existing = await getProductByDiscordMessageId(message.id);
  if (existing) {
    console.log(`[Discord] Message ${message.id} already processed, skipping`);
    return;
  }

  const text = message.content ?? "";
  const attachments = message.attachments ?? [];

  if (!text.trim() && attachments.length === 0) return;

  // Download the first image attachment if present
  let imageUrl: string | null = null;
  const imageAttachment = attachments.find(a =>
    (a.content_type ?? "").startsWith("image/")
  );
  if (imageAttachment) {
    imageUrl = await downloadDiscordAttachment(imageAttachment);
  }

  // Parse product details using tenant-branded prompt
  const parsed = await parseProductFromMessage(text || "New jewelry item", branding.tenantName);
  if (!parsed) {
    console.log("[Discord] Could not parse product from message, skipping");
    return;
  }

  // Create the product in the database
  await createProduct({
    name: parsed.name,
    description: parsed.description,
    price: String(parsed.price),
    category: parsed.category,
    imageUrl: imageUrl ?? undefined,
    imageKey: imageUrl ? `discord/${Date.now()}` : undefined,
    visible: true,
    source: "whatsapp",
    discordMessageId: message.id,
    tenantId: tenant?.id,
  });

  // Notify the owner with tenant branding
  await notifyOwner({
    title: `New product added via Discord — ${branding.tenantName}`,
    content: `✨ "${parsed.name}" has been added to the ${branding.tenantName} catalogue at CHF ${parsed.price}.`,
  });

  // Send a confirmation reply to the Discord channel
  if (DISCORD_BOT_TOKEN && message.channel_id) {
    try {
      await axios.post(
        `${DISCORD_API}/channels/${message.channel_id}/messages`,
        {
          content: `✅ **${parsed.name}** (${parsed.category}) — CHF ${parsed.price} has been added to the ${branding.tenantName} catalogue!`,
          message_reference: { message_id: message.id },
        },
        { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } }
      );
    } catch (err) {
      console.warn("[Discord] Could not send confirmation reply:", err);
    }
  }

  console.log(
    `[Discord] Product created for ${branding.tenantName}: ${parsed.name} @ CHF ${parsed.price}`
  );
}

// ─── Gateway Client ───────────────────────────────────────────────────────────
// Discord uses WebSocket Gateway for real-time events. We connect on server start.

let gatewayWs: WebSocket | null = null;
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSequence: number | null = null;

export async function startDiscordGateway(): Promise<void> {
  if (!DISCORD_BOT_TOKEN) {
    console.log("[Discord] No DISCORD_BOT_TOKEN set — gateway not started");
    return;
  }

  try {
    // Get the gateway URL
    const { data } = await axios.get(`${DISCORD_API}/gateway/bot`, {
      headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` },
    });
    const gatewayUrl = `${data.url}?v=10&encoding=json`;

    connectGateway(gatewayUrl);
  } catch (err) {
    console.error("[Discord] Failed to get gateway URL:", err);
    // Retry after 30s
    reconnectTimeout = setTimeout(() => startDiscordGateway(), 30_000);
  }
}

function connectGateway(url: string): void {
  gatewayWs = new WebSocket(url);
    gatewayWs.on("open", () => {
      console.log("[Discord] Gateway connected");
    });

    gatewayWs.on("message", (data: import("ws").RawData) => {
      try {
        const payload = JSON.parse(data.toString());
        handleGatewayPayload(payload, url);
      } catch (err) {
        console.error("[Discord] Failed to parse gateway message:", err);
      }
    });

    gatewayWs.on("close", code => {
      console.log(
        `[Discord] Gateway closed (code ${code}), reconnecting in 5s...`
      );
      cleanup();
      reconnectTimeout = setTimeout(() => connectGateway(url), 5_000);
    });

    gatewayWs.on("error", err => {
      console.error("[Discord] Gateway error:", err);
    });
}

function handleGatewayPayload(
  payload: {
    op: number;
    d?: unknown;
    s?: number;
    t?: string;
  },
  gatewayUrl: string
): void {
  if (payload.s !== undefined && payload.s !== null) {
    lastSequence = payload.s;
  }

  switch (payload.op) {
    // Hello — start heartbeating and identify
    case 10: {
      const hello = payload.d as { heartbeat_interval: number };
      startHeartbeat(hello.heartbeat_interval);
      identify();
      break;
    }
    // Heartbeat ACK — nothing needed
    case 11:
      break;
    // Reconnect
    case 7:
      cleanup();
      connectGateway(gatewayUrl);
      break;
    // Invalid session
    case 9:
      setTimeout(() => identify(), 2_000);
      break;
    // Dispatch
    case 0:
      if (payload.t === "MESSAGE_CREATE") {
        handleDiscordMessage(payload.d as DiscordMessage).catch(err =>
          console.error("[Discord] Message handler error:", err)
        );
      }
      break;
  }
}

function identify(): void {
  if (!gatewayWs) return;
  gatewayWs.send(
    JSON.stringify({
      op: 2,
      d: {
        token: DISCORD_BOT_TOKEN,
        intents: (1 << 9) | (1 << 15), // GUILD_MESSAGES + MESSAGE_CONTENT
        properties: { os: "linux", browser: "zolto", device: "zolto" },
      },
    })
  );
}

function startHeartbeat(interval: number): void {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(() => {
    if (gatewayWs?.readyState === 1) {
      gatewayWs.send(JSON.stringify({ op: 1, d: lastSequence }));
    }
  }, interval);
}

function cleanup(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  gatewayWs = null;
}

export function stopDiscordGateway(): void {
  cleanup();
  gatewayWs?.close();
}
