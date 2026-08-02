/**
 * Slack "click to connect" — the OAuth v2 flow behind the Add-to-Slack button
 * on the Channels admin page.
 *
 * The merchant clicks the button (URL built per-tenant by the tenant router),
 * approves Zolto's Slack app in THEIR workspace, and Slack redirects back
 * here with a code. We exchange it for that workspace's bot token and write
 * it straight into the encrypted tenant-secrets vault — the same place the
 * manual paste on the Channels page stores it — so the intake handlers pick
 * it up through channelSecret() with no extra plumbing.
 *
 * The signing secret stays platform-level (it belongs to Zolto's app, not the
 * workspace), so OAuth removes any need for merchants to handle secrets at
 * all: the whole Slack section becomes one click plus a channel id.
 *
 * Platform env:
 *   SLACK_CLIENT_ID / SLACK_CLIENT_SECRET — from Zolto's Slack app
 *   PUBLIC_BASE_URL                       — the redirect_uri host
 *
 * The `state` parameter carries WHICH tenant is connecting, HMAC-signed with
 * the cookie secret and expiring after 15 minutes, so a callback can't be
 * replayed or aimed at someone else's store.
 */

import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";
import { setTenantSecret } from "./tenantSecrets";

/** Scopes the intake needs: read channel messages + files, post replies. */
const SLACK_SCOPES = [
  "channels:history",
  "groups:history",
  "files:read",
  "chat:write",
].join(",");

const STATE_TTL_MS = 15 * 60 * 1000;

function stateSignature(tenantId: number, expiresAt: number): string {
  return crypto
    .createHmac("sha256", ENV.cookieSecret)
    .update(`slack-oauth:${tenantId}:${expiresAt}`)
    .digest("hex");
}

/** Signed state: `<tenantId>.<expiresAtMs>.<hmac>`. */
export function buildSlackOAuthState(
  tenantId: number,
  now: number = Date.now(),
): string {
  if (!ENV.cookieSecret) {
    throw new Error("Cannot sign Slack OAuth state without a cookie secret");
  }
  const expiresAt = now + STATE_TTL_MS;
  return `${tenantId}.${expiresAt}.${stateSignature(tenantId, expiresAt)}`;
}

/** The tenant a valid, unexpired state was issued for — else null. */
export function verifySlackOAuthState(
  state: string,
  now: number = Date.now(),
): number | null {
  if (!ENV.cookieSecret) return null;
  const [idPart, expPart, sig] = state.split(".");
  const tenantId = Number(idPart);
  const expiresAt = Number(expPart);
  if (!Number.isInteger(tenantId) || !Number.isFinite(expiresAt) || !sig) {
    return null;
  }
  if (expiresAt < now) return null;
  const expected = stateSignature(tenantId, expiresAt);
  try {
    if (
      sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    ) {
      return tenantId;
    }
  } catch {
    /* fall through */
  }
  return null;
}

export function slackOAuthRedirectUri(): string {
  const base = (process.env.PUBLIC_BASE_URL ?? "https://zolto.ch").replace(
    /\/+$/,
    "",
  );
  return `${base}/api/slack/oauth/callback`;
}

/**
 * The per-tenant authorize URL for the Add-to-Slack button, or null when the
 * platform has no Slack app configured (the button then stays hidden).
 */
export function buildSlackAuthorizeUrl(tenantId: number): string | null {
  const clientId = process.env.SLACK_CLIENT_ID;
  if (!clientId || !ENV.cookieSecret) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SLACK_SCOPES,
    redirect_uri: slackOAuthRedirectUri(),
    state: buildSlackOAuthState(tenantId),
  });
  return `https://slack.com/oauth/v2/authorize?${params}`;
}

/** Where the merchant lands back in the admin, with a status flag for a toast. */
function adminRedirect(res: Response, status: "connected" | "error"): void {
  res.redirect(`/admin/channels?slack=${status}`);
}

export function registerSlackOAuthRoutes(app: Express): void {
  app.get("/api/slack/oauth/callback", async (req: Request, res: Response) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error || !code || !state) {
      console.warn(`[SlackOAuth] Callback without code (error=${error})`);
      adminRedirect(res, "error");
      return;
    }
    const tenantId = verifySlackOAuthState(state);
    if (tenantId === null) {
      console.warn("[SlackOAuth] Invalid or expired state");
      adminRedirect(res, "error");
      return;
    }
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      console.warn("[SlackOAuth] SLACK_CLIENT_ID/SECRET not configured");
      adminRedirect(res, "error");
      return;
    }

    try {
      const resp = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: slackOAuthRedirectUri(),
        }),
      });
      const data = (await resp.json()) as {
        ok: boolean;
        access_token?: string;
        error?: string;
      };
      if (!data.ok || !data.access_token) {
        console.warn(`[SlackOAuth] Token exchange failed: ${data.error}`);
        adminRedirect(res, "error");
        return;
      }
      // Same vault, same provider key as the manual paste — the intake
      // handlers need no notion of HOW the token arrived.
      await setTenantSecret(tenantId, "slack_bot_token", data.access_token);
      console.log(`[SlackOAuth] Connected workspace for tenant ${tenantId}`);
      adminRedirect(res, "connected");
    } catch (err) {
      console.error("[SlackOAuth] Token exchange error:", err);
      adminRedirect(res, "error");
    }
  });
}

/**
 * The Discord counterpart is simpler: no token changes hands. The platform
 * bot gets INVITED to the merchant's server via a plain OAuth authorize URL;
 * message intake then works through the existing platform-token gateway plus
 * the channel id the merchant already registers. Null when the platform has
 * no Discord app configured.
 *
 * Permissions: View Channels (1<<10) + Send Messages (1<<11) +
 * Read Message History (1<<16) = 68608 — read the intake channel, reply
 * with the confirmation.
 */
export function buildDiscordInviteUrl(): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot",
    permissions: "68608",
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}
