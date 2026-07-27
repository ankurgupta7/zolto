/**
 * Notification helper — "new order"-style owner DMs via Discord.
 *
 * The bot token is a PLATFORM credential (DISCORD_BOT_TOKEN env) — there is one
 * Zolto bot, invited into each tenant's Discord server. Per-tenant routing is by
 * ID, not by token: each tenant's owner sets their own Discord user ID in their
 * store settings (tenant_settings.discord_owner_user_id, via
 * tenant.updateSettings) and callers pass it as opts.discordUserId. The env var
 * DISCORD_OWNER_USER_ID remains only as the platform-owner fallback (and for
 * single-tenant self-hosted deployments that never set a per-tenant recipient).
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN       — the platform bot (shared with the catalogue bot)
 *   DISCORD_OWNER_USER_ID   — platform-owner fallback recipient (optional)
 *
 * If neither a per-tenant recipient nor the env fallback is set, notifications
 * are logged to the console instead of failing.
 */

export type NotificationPayload = {
  title: string;
  content: string;
};

export type NotificationOptions = {
  /**
   * Per-tenant recipient (tenant_settings.discord_owner_user_id). Wins over
   * the DISCORD_OWNER_USER_ID env fallback when set.
   */
  discordUserId?: string | null;
};

async function sendDiscordDM(userId: string, text: string): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN is not set");

  // 1. Open a DM channel with the user
  const dmRes = await fetch("https://discord.com/api/v10/users/@me/channels", {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: userId }),
  });

  if (!dmRes.ok) {
    const detail = await dmRes.text().catch(() => dmRes.statusText);
    throw new Error(`Failed to open DM channel (${dmRes.status}): ${detail}`);
  }

  const { id: channelId } = (await dmRes.json()) as { id: string };

  // 2. Send the message
  const msgRes = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: text }),
    },
  );

  if (!msgRes.ok) {
    const detail = await msgRes.text().catch(() => msgRes.statusText);
    throw new Error(`Failed to send DM (${msgRes.status}): ${detail}`);
  }
}

export async function notifyOwner(
  payload: NotificationPayload,
  opts?: NotificationOptions,
): Promise<boolean> {
  const { title, content } = payload;
  const message = `**${title}**\n${content}`;

  const ownerId = opts?.discordUserId || process.env.DISCORD_OWNER_USER_ID;

  if (!ownerId) {
    // Graceful degradation: log to console if not configured
    console.log(`[Notification] ${message}`);
    return true;
  }

  try {
    await sendDiscordDM(ownerId, message);
    return true;
  } catch (err) {
    console.warn("[Notification] Failed to send Discord DM:", err);
    return false;
  }
}
