/**
 * Tenant secrets vault — the ONLY sanctioned home for tenant-provided secrets.
 *
 * Platform credentials (Zolto's own Stripe key, Discord bot token, DB password)
 * live in env vars. Tenant credentials (anything a merchant pastes into their
 * admin settings — a future per-tenant bot token, a POS provider token, ...) must
 * NEVER go into env vars: env is process-global, so one leak exposes every
 * tenant, and per-tenant rotation would require a redeploy. They live here
 * instead, encrypted at the application layer before they touch the database.
 *
 * Properties this enforces:
 *   - Ciphertext at rest: AES-256-GCM with a platform master key from
 *     TENANT_SECRETS_KEY (env). A DB dump or leaked backup is useless without it.
 *   - Write-only UI contract: the plaintext is returned by nothing. The `hint`
 *     column (last 4 chars) lets the admin UI show "…3f9a" without decrypting.
 *   - Zolto admin cannot read tenant secrets: there is deliberately no tRPC
 *     endpoint and no admin query that returns plaintext. getTenantSecret()
 *     exists for SERVER-side use only (calling the provider's API on the
 *     tenant's behalf); every decrypt is audit-logged and stamped in
 *     last_used_at.
 *
 * Master key: TENANT_SECRETS_KEY = 64 hex chars (32 bytes), generate with
 *   openssl rand -hex 32
 * key_version is stamped on every row so a future master-key rotation can
 * re-encrypt lazily without downtime.
 */

import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { tenantSecrets } from "../drizzle/schema";

const FORMAT_VERSION = "v1";
const KEY_VERSION = 1;

// ─── Crypto (pure, unit-testable) ─────────────────────────────────────────────

function masterKey(keyHex?: string): Buffer {
  const hex = keyHex ?? process.env.TENANT_SECRETS_KEY ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "TENANT_SECRETS_KEY is not set or invalid (expected 64 hex chars — `openssl rand -hex 32`)",
    );
  }
  return Buffer.from(hex, "hex");
}

/** Encrypt with AES-256-GCM; returns `v1:<iv_hex>:<tag_hex>:<ciphertext_hex>`. */
export function encryptSecret(plaintext: string, keyHex?: string): string {
  const key = masterKey(keyHex);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    FORMAT_VERSION,
    iv.toString("hex"),
    tag.toString("hex"),
    ciphertext.toString("hex"),
  ].join(":");
}

/** Decrypt a payload produced by encryptSecret. Throws on tampering/wrong key. */
export function decryptSecret(payload: string, keyHex?: string): string {
  const key = masterKey(keyHex);
  const [version, ivHex, tagHex, ciphertextHex] = payload.split(":");
  if (version !== FORMAT_VERSION || !ivHex || !tagHex || !ciphertextHex) {
    throw new Error("Unrecognized tenant-secret payload format");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

/** Last-4 hint for masked display ("…3f9a") — stored so masking never decrypts. */
function hintOf(plaintext: string): string {
  return plaintext.slice(-4);
}

// ─── Repository ───────────────────────────────────────────────────────────────

export function isTenantSecretsConfigured(): boolean {
  return /^[0-9a-fA-F]{64}$/.test(process.env.TENANT_SECRETS_KEY ?? "");
}

/**
 * Store (or rotate) a tenant secret. The plaintext is never persisted and never
 * returned by any read path — only its last-4 hint is kept for masked display.
 */
export async function setTenantSecret(
  tenantId: number,
  provider: string,
  plaintext: string,
): Promise<void> {
  if (!plaintext) throw new Error("Refusing to store an empty secret");
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const ciphertext = encryptSecret(plaintext);
  const hint = hintOf(plaintext);
  const now = new Date();

  const existing = await db
    .select({ id: tenantSecrets.id })
    .from(tenantSecrets)
    .where(
      and(
        eq(tenantSecrets.tenantId, tenantId),
        eq(tenantSecrets.provider, provider),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(tenantSecrets)
      .set({ ciphertext, hint, keyVersion: KEY_VERSION, rotatedAt: now })
      .where(eq(tenantSecrets.id, existing[0].id));
  } else {
    await db.insert(tenantSecrets).values({
      tenantId,
      provider,
      ciphertext,
      hint,
      keyVersion: KEY_VERSION,
    });
  }
  console.log(
    `[TenantSecrets] stored tenant=${tenantId} provider=${provider} (…${hint})`,
  );
}

/**
 * SERVER-SIDE ONLY: decrypt a tenant secret to call the provider's API on the
 * tenant's behalf. Never expose the result through a route, tRPC procedure, or
 * log line. Every call is audit-logged + stamped in last_used_at.
 */
export async function getTenantSecret(
  tenantId: number,
  provider: string,
): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(tenantSecrets)
    .where(
      and(
        eq(tenantSecrets.tenantId, tenantId),
        eq(tenantSecrets.provider, provider),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const plaintext = decryptSecret(row.ciphertext);
  await db
    .update(tenantSecrets)
    .set({ lastUsedAt: new Date() })
    .where(eq(tenantSecrets.id, row.id));
  // Audit trail: who/what was decrypted — never the value itself.
  console.log(
    `[TenantSecrets] decrypt tenant=${tenantId} provider=${provider}`,
  );
  return plaintext;
}

export interface TenantSecretMeta {
  provider: string;
  /** Last 4 chars of the secret, for masked display ("…3f9a"). */
  hint: string;
  keyVersion: number;
  createdAt: Date;
  rotatedAt: Date | null;
  lastUsedAt: Date | null;
}

/** Metadata for the admin UI — never includes ciphertext or plaintext. */
export async function listTenantSecrets(
  tenantId: number,
): Promise<TenantSecretMeta[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      provider: tenantSecrets.provider,
      hint: tenantSecrets.hint,
      keyVersion: tenantSecrets.keyVersion,
      createdAt: tenantSecrets.createdAt,
      rotatedAt: tenantSecrets.rotatedAt,
      lastUsedAt: tenantSecrets.lastUsedAt,
    })
    .from(tenantSecrets)
    .where(eq(tenantSecrets.tenantId, tenantId));
  return rows;
}

/**
 * Tenants that have a secret stored for a provider — used at boot to know
 * which tenants brought their own bot (e.g. one Discord gateway per stored
 * token). Returns ids only; decryption stays with getTenantSecret.
 */
export async function listTenantIdsWithSecret(
  provider: string,
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ tenantId: tenantSecrets.tenantId })
    .from(tenantSecrets)
    .where(eq(tenantSecrets.provider, provider));
  return rows.map((r) => r.tenantId);
}

export async function deleteTenantSecret(
  tenantId: number,
  provider: string,
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(tenantSecrets)
    .where(
      and(
        eq(tenantSecrets.tenantId, tenantId),
        eq(tenantSecrets.provider, provider),
      ),
    );
  console.log(
    `[TenantSecrets] deleted tenant=${tenantId} provider=${provider}`,
  );
}
