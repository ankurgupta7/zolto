/**
 * One-tap register pairing.
 *
 * Binding a register used to mean rotating the POS key and then typing 64 hex
 * characters into a phone at a market stall, or scanning a QR that could only be
 * rendered in the instant after rotation. This mints a short-lived link instead:
 * the merchant taps it on the phone, the app opens already bound to their store.
 *
 * Why a token and not the key itself in the link:
 *
 *   A POS key is a bearer credential (server/pos.ts requirePosKey). Putting it in
 *   a URL puts it in browser history, in every access log along the way, and in
 *   Referer headers of whatever the phone loads next. A pairing token is instead
 *   single-use and expires in minutes, so a link that leaks after redemption is
 *   worth nothing. The key travels once, in a POST response body over TLS.
 *
 * Where the key comes from:
 *
 *   tenants.pos_api_key holds only a SHA-256, so it cannot be read back. The
 *   plaintext is kept in the encrypted tenant-secrets vault under provider
 *   "pos" (server/tenantSecrets.ts, AES-256-GCM). That is a deliberate change to
 *   the property described in server/posApiKey.ts — the platform CAN now decrypt
 *   a tenant's POS key — accepted so that pairing a second register doesn't have
 *   to rotate the key and sign the first one out.
 *
 *   Keys minted before that vault write existed have no copy, and none can be
 *   recovered. Those tenants get `needsRotation`, and the UI asks them to rotate
 *   once; there is no way around it and no silent failure.
 */

import crypto from "node:crypto";
import {
  claimPosPairingToken,
  createPosPairingToken,
  getTenantById,
} from "./db";
import {
  getTenantSecret,
  isTenantSecretsConfigured,
  setTenantSecret,
} from "./tenantSecrets";

/** Vault provider key for a tenant's own POS API key. */
export const POS_SECRET_PROVIDER = "pos";

/**
 * How long a pairing link stays good. Long enough to walk from a laptop to the
 * till and get past the OS "open in Zolto POS?" prompt; short enough that a link
 * left in a chat thread is dead by the time anyone else finds it.
 */
export const PAIRING_TTL_MS = 10 * 60 * 1000;

/** Deep-link scheme both apps register. */
export const PAIRING_SCHEME = "zolto";

// ─── Token primitives (pure) ──────────────────────────────────────────────────

/** A fresh pairing token: 32 bytes, url-safe. */
export function generatePairingToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Hash a token into the form stored in pos_pairing_tokens.token. */
export function hashPairingToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * The link the phone opens. A custom scheme rather than an https App Link /
 * Universal Link: those need an assetlinks.json signing fingerprint and an
 * apple-app-site-association team id, and neither is stable for a debug APK and
 * an unsigned IPA. The https form below is the fallback for a device that
 * doesn't have the app yet.
 *
 * Carries the server origin as well as the token, because a freshly installed
 * register knows neither. The token alone would leave the app with nothing to
 * redeem against — the same reason the scan-to-pair QR payload carries `baseUrl`
 * (client/src/lib/posPairing.ts). The origin is the store's own host, so the
 * register ends up talking to the deployment the merchant is actually using.
 */
export function buildPairingDeepLink(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${PAIRING_SCHEME}://pair?t=${encodeURIComponent(token)}&url=${encodeURIComponent(base)}`;
}

/** Web fallback: a page that offers the deep link plus the download links. */
export function buildPairingWebLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/pos/pair?t=${encodeURIComponent(token)}`;
}

// ─── Vault ────────────────────────────────────────────────────────────────────

/**
 * Remember a freshly generated POS key so pairing links can be minted later.
 *
 * Best-effort by design: a self-hosted deployment without TENANT_SECRETS_KEY has
 * no vault, and rotating a key must still work there. Failing here would break
 * signup and rotation to add a convenience feature, so this logs and returns
 * false instead, and pairing reports `needsRotation`.
 */
export async function rememberPosApiKey(
  tenantId: number,
  plaintext: string,
): Promise<boolean> {
  if (!isTenantSecretsConfigured()) {
    console.warn(
      `[posPairing] TENANT_SECRETS_KEY not set — tenant=${tenantId} POS key not stored, one-tap pairing unavailable`,
    );
    return false;
  }
  try {
    await setTenantSecret(tenantId, POS_SECRET_PROVIDER, plaintext);
    return true;
  } catch (err) {
    console.error(
      `[posPairing] could not store POS key for tenant=${tenantId}:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

/** Is a pairing link mintable for this tenant at all? */
export async function canMintPairingToken(tenantId: number): Promise<boolean> {
  if (!isTenantSecretsConfigured()) return false;
  try {
    return (await getTenantSecret(tenantId, POS_SECRET_PROVIDER)) !== null;
  } catch {
    return false;
  }
}

// ─── Mint ─────────────────────────────────────────────────────────────────────

export type MintResult =
  | { ok: true; token: string; expiresAt: Date }
  /** No recoverable key — the merchant must rotate once to enable this. */
  | { ok: false; reason: "needsRotation" };

export async function mintPairingToken(
  tenantId: number,
): Promise<MintResult> {
  if (!(await canMintPairingToken(tenantId))) {
    return { ok: false, reason: "needsRotation" };
  }
  const token = generatePairingToken();
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  await createPosPairingToken({
    tenantId,
    token: hashPairingToken(token),
    expiresAt,
  });
  return { ok: true, token, expiresAt };
}

// ─── Redeem ───────────────────────────────────────────────────────────────────

export interface RedeemedPairing {
  apiKey: string;
  storeName: string;
  storeSlug: string;
}

/**
 * Spend a pairing token and hand back the store's credentials.
 *
 * Returns null for every failure — unknown, expired, already spent, no vault
 * copy. The caller must not distinguish them to the client: a differentiated
 * error turns this endpoint into an oracle for guessing tokens.
 */
export async function redeemPairingToken(
  token: string,
): Promise<RedeemedPairing | null> {
  const normalized = token.trim();
  if (!normalized) return null;

  const claimed = await claimPosPairingToken(hashPairingToken(normalized));
  if (!claimed) return null;

  const apiKey = await getTenantSecret(claimed.tenantId, POS_SECRET_PROVIDER);
  if (!apiKey) {
    // The token was valid but the key vanished (vault cleared, key rotated by a
    // path that didn't store it). The token is already spent, which is correct:
    // it must not become reusable because this step failed.
    console.error(
      `[posPairing] tenant=${claimed.tenantId} redeemed a pairing token but has no stored POS key`,
    );
    return null;
  }

  const tenant = await getTenantById(claimed.tenantId);
  if (!tenant) return null;

  return { apiKey, storeName: tenant.name, storeSlug: tenant.slug };
}
