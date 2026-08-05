/**
 * Per-tenant channel credentials — the bridge between the tenant-secrets vault
 * and the intake channels (WhatsApp, Slack, Discord).
 *
 * A merchant can paste their own provider credentials into Channels admin;
 * they land in the encrypted vault (server/tenantSecrets.ts, the ONLY
 * sanctioned home for tenant secrets). Every channel handler asks here first
 * and falls back to the platform-level env var, so both models keep working:
 *   - platform-app model: one Meta/Slack/Discord app owned by Zolto, its
 *     credentials in env, tenants only registering IDs/numbers;
 *   - bring-your-own-app model: a tenant's own app credentials in the vault.
 *
 * Fallback rules are deliberately per-credential (not per-channel): a tenant
 * who sets only their WhatsApp token still gets the platform app secret for
 * signature checks, which is exactly right when their number lives under the
 * platform's Meta app.
 */

import { getTenantSecret } from "./tenantSecrets";

export const CHANNEL_SECRET_PROVIDERS = [
  "whatsapp_token",
  "whatsapp_app_secret",
  "slack_bot_token",
  "slack_signing_secret",
  "discord_bot_token",
] as const;

export type ChannelSecretProvider = (typeof CHANNEL_SECRET_PROVIDERS)[number];

/** Human labels for the admin UI — kept here so client and server agree. */
export const CHANNEL_SECRET_LABELS: Record<ChannelSecretProvider, string> = {
  whatsapp_token: "WhatsApp access token",
  whatsapp_app_secret: "WhatsApp app secret",
  slack_bot_token: "Slack bot token",
  slack_signing_secret: "Slack signing secret",
  discord_bot_token: "Discord bot token",
};

const ENV_FALLBACK: Record<ChannelSecretProvider, string | undefined> = {
  get whatsapp_token() {
    return process.env.WHATSAPP_TOKEN;
  },
  get whatsapp_app_secret() {
    return process.env.WHATSAPP_APP_SECRET;
  },
  get slack_bot_token() {
    return process.env.SLACK_BOT_TOKEN;
  },
  get slack_signing_secret() {
    return process.env.SLACK_SIGNING_SECRET;
  },
  get discord_bot_token() {
    return process.env.DISCORD_BOT_TOKEN;
  },
};

/**
 * The credential to use for a tenant: their own vault entry when present,
 * else the platform env var, else null. Vault errors (no DB, master key
 * unset, tampered row) degrade to the env fallback rather than killing the
 * webhook — a broken vault must not take working platform-app intake down.
 */
export async function channelSecret(
  tenantId: number | undefined,
  provider: ChannelSecretProvider,
): Promise<string | null> {
  if (tenantId !== undefined) {
    try {
      const own = await getTenantSecret(tenantId, provider);
      if (own) return own;
    } catch (err) {
      console.warn(
        `[ChannelCredentials] vault lookup failed for tenant=${tenantId} provider=${provider}; using env fallback:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return ENV_FALLBACK[provider]?.trim() || null;
}
