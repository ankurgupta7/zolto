/**
 * Self-hosted notification helper
 *
 * Sends owner notifications as a Discord DM to the owner's Discord user ID.
 * This reuses the existing DISCORD_BOT_TOKEN so no extra credentials are needed.
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN       — already required for the catalogue bot
 *   DISCORD_OWNER_USER_ID   — your personal Discord user ID (right-click yourself
 *                             in Discord → Copy User ID; needs Developer Mode on)
 *
 * If DISCORD_OWNER_USER_ID is not set, notifications are silently logged to
 * the console instead of failing.
 */

export type NotificationPayload = {
  title: string;
  content: string;
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
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: text }),
  });

  if (!msgRes.ok) {
    const detail = await msgRes.text().catch(() => msgRes.statusText);
    throw new Error(`Failed to send DM (${msgRes.status}): ${detail}`);
  }
}

export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const { title, content } = payload;
  const message = `**${title}**\n${content}`;

  const ownerId = process.env.DISCORD_OWNER_USER_ID;

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
