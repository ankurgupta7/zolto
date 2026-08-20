/**
 * Discord Bot handler — product intake via a tenant's own Discord channel
 *
 * A store owner posts a message (with optional image attachment) to their
 * designated Discord channel. This handler processes the Discord Gateway
 * MESSAGE_CREATE event forwarded via our polling loop, parses the product
 * details with an LLM, downloads any attached image, and creates the product
 * in the database — scoped to the tenant that owns the channel.
 *
 * Discord uses a WebSocket Gateway for real-time events. Since our server is a
 * standard HTTP server, we run a lightweight Discord Gateway client that connects
 * on startup and forwards MESSAGE_CREATE events to our internal handler.
 *
 * Multi-tenancy model — two coexisting shapes, one gateway connection each:
 *   - Platform bot: ONE bot (DISCORD_BOT_TOKEN env) invited into each
 *     tenant's Discord server; tenants only register IDs in their store
 *     settings (tenant.updateSettings):
 *       tenant_settings.discord_channel_id    → which channel to watch
 *       tenant_settings.discord_owner_user_id → who gets "product added" DMs
 *     IDs are not secrets, so no vault/encryption is needed for them.
 *   - Bring-your-own bot: a tenant pastes their own bot token into Channels
 *     admin; it lands in the encrypted vault (provider "discord_bot_token",
 *     server/tenantSecrets.ts) and gets its own gateway connection here.
 * Either way, an incoming message is attributed by channel id
 * (getTenantByDiscordChannelId), and replies/downloads use the token of the
 * gateway that received it.
 *
 * Env vars (platform-level):
 *   DISCORD_BOT_TOKEN    – the platform bot's token (optional if every
 *                          tenant brings their own)
 *   DISCORD_CHANNEL_ID   – LEGACY fallback channel for single-tenant
 *                          self-hosted deployments with no channel mapping
 */

import WebSocket from "ws";
import axios from "axios";
import { invokeLLM } from "./_core/llm";
import { notifyOwner } from "./_core/notification";
import {
  createProduct,
  getProductByDiscordMessageId,
  getTenantByDiscordChannelId,
  getTenantSettings,
} from "./db";
import { storagePut } from "./storage";
import { DEFAULT_TENANT_ID } from "./_core/tenant";
import type { TenantBranding } from "./_core/email";
import { getTenantSecret, listTenantIdsWithSecret } from "./tenantSecrets";
import {
  buildIntakeExtractionPrompt,
  fallbackProduct,
  getVerticalContext,
} from "./verticals";

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID ?? "";
const DISCORD_API = "https://discord.com/api/v10";

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
    const model = process.env.LLM_MODEL;
    // The prompt is assembled from the tenant's vertical + their actual
    // category list (shared with the Slack and WhatsApp intake bots).
    const vc = await getVerticalContext(tenantId, tenantName ?? "your store");
    const { system, jsonSchema } = buildIntakeExtractionPrompt(vc);
    const response = await invokeLLM({
      ...(model ? { model } : {}),
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
  tenantId: number,
  attachment: DiscordAttachment,
  botToken: string,
): Promise<string | null> {
  try {
    const response = await axios.get(attachment.url, {
      responseType: "arraybuffer",
      headers: { Authorization: `Bot ${botToken}` },
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
      tenantId,
      key,
      Buffer.from(response.data),
      contentType,
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
  message: DiscordMessage,
  // The token of the gateway that received the event — attachment downloads
  // and the confirmation reply must go through the same bot, since a tenant's
  // own bot and the platform bot see different servers.
  botToken: string = DISCORD_BOT_TOKEN,
): Promise<void> {
  // Ignore bot messages
  if (message.author.bot) return;

  // ── Look up tenant by Discord channel ID ─────────────────────────────────
  const tenant = await getTenantByDiscordChannelId(message.channel_id);
  if (!tenant) {
    // If no tenant mapped to this channel, fall back to legacy single-channel mode
    if (DISCORD_CHANNEL_ID && message.channel_id !== DISCORD_CHANNEL_ID) return;
    if (!DISCORD_CHANNEL_ID) {
      console.log(
        `[Discord] No tenant mapped to channel ${message.channel_id}, skipping`,
      );
      return;
    }
  }

  const tenantName = tenant?.name ?? "your store";
  const settings = tenant ? await getTenantSettings(tenant.id) : null;
  const branding: TenantBranding = {
    tenantName: settings?.whiteLabelName ?? tenantName,
    tenantDomain:
      tenant?.domain ??
      settings?.publicDomain ??
      process.env.PUBLIC_BASE_URL ??
      "https://zolto.ch",
    contactEmail: settings?.contactEmail ?? undefined,
  };

  // ── Deduplication: skip if this Discord message was already processed ──────
  const discordTenantId = tenant?.id ?? DEFAULT_TENANT_ID;
  const existing = await getProductByDiscordMessageId(
    discordTenantId,
    message.id,
  );
  if (existing) {
    console.log(`[Discord] Message ${message.id} already processed, skipping`);
    return;
  }

  const text = message.content ?? "";
  const attachments = message.attachments ?? [];

  if (!text.trim() && attachments.length === 0) return;

  // Download the first image attachment if present
  let imageUrl: string | null = null;
  const imageAttachment = attachments.find((a) =>
    (a.content_type ?? "").startsWith("image/"),
  );
  if (imageAttachment) {
    // Storage is charged against a tenant's plan allowance, so an attachment
    // we cannot attribute is not stored at all. This only arises in the legacy
    // single-channel fallback above, where no tenant maps to the channel; the
    // text of the message is still parsed.
    if (tenant) {
      imageUrl = await downloadDiscordAttachment(
        tenant.id,
        imageAttachment,
        botToken,
      );
    } else {
      console.warn(
        `[Discord] Attachment on unmapped channel ${message.channel_id} not stored — ` +
          "no tenant to charge the storage against.",
      );
    }
  }

  // Parse product details using tenant-branded prompt. An image-only message
  // still creates a placeholder listing named after the vertical's fallback
  // item (previously the hard-coded "New jewelry item").
  const placeholder = text.trim()
    ? text
    : `New ${fallbackProduct(await getVerticalContext(discordTenantId)).nameEn}`;
  const parsed = await parseProductFromMessage(
    placeholder,
    discordTenantId,
    branding.tenantName,
  );
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
    tenantId: tenant?.id ?? DEFAULT_TENANT_ID,
  });

  // Notify the tenant's owner (their own Discord user ID if configured, else
  // the platform-owner env fallback) with tenant branding.
  await notifyOwner(
    {
      title: `New product added via Discord — ${branding.tenantName}`,
      content: `✨ "${parsed.name}" has been added to the ${branding.tenantName} catalogue at CHF ${parsed.price}.`,
    },
    { discordUserId: settings?.discordOwnerUserId ?? null },
  );

  // Send a confirmation reply to the Discord channel
  if (botToken && message.channel_id) {
    try {
      await axios.post(
        `${DISCORD_API}/channels/${message.channel_id}/messages`,
        {
          content: `✅ **${parsed.name}** (${parsed.category}) — CHF ${parsed.price} has been added to the ${branding.tenantName} catalogue!`,
          message_reference: { message_id: message.id },
        },
        { headers: { Authorization: `Bot ${botToken}` } },
      );
    } catch (err) {
      console.warn("[Discord] Could not send confirmation reply:", err);
    }
  }

  console.log(
    `[Discord] Product created for ${branding.tenantName}: ${parsed.name} @ CHF ${parsed.price}`,
  );
}

// ─── Gateway Client ───────────────────────────────────────────────────────────
// Discord uses WebSocket Gateway for real-time events. One connection per bot
// token: the platform bot (env) plus every tenant-supplied token in the vault.

interface GatewayConn {
  token: string;
  ws: WebSocket | null;
  heartbeatInterval: ReturnType<typeof setInterval> | null;
  reconnectTimeout: ReturnType<typeof setTimeout> | null;
  lastSequence: number | null;
  stopped: boolean;
}

const gateways = new Map<string, GatewayConn>();

/**
 * Start every gateway we know about: the platform bot from env plus each
 * tenant-supplied token from the vault. Idempotent per token; safe to call
 * with nothing configured.
 */
export async function startDiscordGateway(): Promise<void> {
  const tokens = new Set<string>();
  if (DISCORD_BOT_TOKEN) tokens.add(DISCORD_BOT_TOKEN);

  try {
    for (const tenantId of await listTenantIdsWithSecret("discord_bot_token")) {
      const token = await getTenantSecret(tenantId, "discord_bot_token");
      if (token) tokens.add(token);
    }
  } catch (err) {
    // Vault unavailable (no DB / no master key) must not stop the platform
    // bot from connecting.
    console.warn(
      "[Discord] Could not load tenant bot tokens from the vault:",
      err instanceof Error ? err.message : err,
    );
  }

  if (tokens.size === 0) {
    console.log(
      "[Discord] No bot tokens configured (env or vault) — gateway not started",
    );
    return;
  }
  for (const token of Array.from(tokens)) {
    void startGatewayForToken(token);
  }
}

/** Connect one bot token. Idempotent: an already-running token is left alone. */
export async function startGatewayForToken(token: string): Promise<void> {
  if (!token || gateways.has(token)) return;
  const conn: GatewayConn = {
    token,
    ws: null,
    heartbeatInterval: null,
    reconnectTimeout: null,
    lastSequence: null,
    stopped: false,
  };
  gateways.set(token, conn);

  try {
    // Get the gateway URL (also validates the token before we hold a slot).
    const { data } = await axios.get(`${DISCORD_API}/gateway/bot`, {
      headers: { Authorization: `Bot ${token}` },
    });
    connectGateway(conn, `${data.url}?v=10&encoding=json`);
  } catch (err) {
    console.error("[Discord] Failed to get gateway URL:", err);
    gateways.delete(token);
    // Retry after 30s
    setTimeout(() => void startGatewayForToken(token), 30_000);
  }
}

function connectGateway(conn: GatewayConn, url: string): void {
  if (conn.stopped) return;
  const ws = new WebSocket(url);
  conn.ws = ws;

  ws.on("open", () => {
    console.log(`[Discord] Gateway connected (…${conn.token.slice(-4)})`);
  });

  ws.on("message", (data: import("ws").RawData) => {
    try {
      const payload = JSON.parse(data.toString());
      handleGatewayPayload(conn, payload, url);
    } catch (err) {
      console.error("[Discord] Failed to parse gateway message:", err);
    }
  });

  ws.on("close", (code) => {
    console.log(
      `[Discord] Gateway closed (code ${code}), reconnecting in 5s...`,
    );
    stopHeartbeat(conn);
    conn.ws = null;
    if (!conn.stopped) {
      conn.reconnectTimeout = setTimeout(
        () => connectGateway(conn, url),
        5_000,
      );
    }
  });

  ws.on("error", (err) => {
    console.error("[Discord] Gateway error:", err);
  });
}

function handleGatewayPayload(
  conn: GatewayConn,
  payload: {
    op: number;
    d?: unknown;
    s?: number;
    t?: string;
  },
  gatewayUrl: string,
): void {
  if (payload.s !== undefined && payload.s !== null) {
    conn.lastSequence = payload.s;
  }

  switch (payload.op) {
    // Hello — start heartbeating and identify
    case 10: {
      const hello = payload.d as { heartbeat_interval: number };
      startHeartbeat(conn, hello.heartbeat_interval);
      identify(conn);
      break;
    }
    // Heartbeat ACK — nothing needed
    case 11:
      break;
    // Reconnect
    case 7:
      stopHeartbeat(conn);
      connectGateway(conn, gatewayUrl);
      break;
    // Invalid session
    case 9:
      setTimeout(() => identify(conn), 2_000);
      break;
    // Dispatch
    case 0:
      if (payload.t === "MESSAGE_CREATE") {
        handleDiscordMessage(payload.d as DiscordMessage, conn.token).catch(
          (err) => console.error("[Discord] Message handler error:", err),
        );
      }
      break;
  }
}

function identify(conn: GatewayConn): void {
  if (!conn.ws) return;
  conn.ws.send(
    JSON.stringify({
      op: 2,
      d: {
        token: conn.token,
        intents: (1 << 9) | (1 << 15), // GUILD_MESSAGES + MESSAGE_CONTENT
        properties: { os: "linux", browser: "zolto", device: "zolto" },
      },
    }),
  );
}

function startHeartbeat(conn: GatewayConn, interval: number): void {
  stopHeartbeat(conn);
  conn.heartbeatInterval = setInterval(() => {
    if (conn.ws?.readyState === 1) {
      conn.ws.send(JSON.stringify({ op: 1, d: conn.lastSequence }));
    }
  }, interval);
}

/**
 * Clear the connection's timers only. Detaching conn.ws is the caller's
 * decision: on Hello this runs to reset the heartbeat while the SAME socket
 * lives on (identify still needs it) — nulling ws here silently broke that.
 */
function stopHeartbeat(conn: GatewayConn): void {
  if (conn.heartbeatInterval) {
    clearInterval(conn.heartbeatInterval);
    conn.heartbeatInterval = null;
  }
  if (conn.reconnectTimeout) {
    clearTimeout(conn.reconnectTimeout);
    conn.reconnectTimeout = null;
  }
}

export function stopDiscordGateway(): void {
  for (const conn of Array.from(gateways.values())) {
    conn.stopped = true;
    stopHeartbeat(conn);
    conn.ws?.close();
    conn.ws = null;
  }
  gateways.clear();
}
