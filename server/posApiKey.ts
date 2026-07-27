/**
 * POS API keys — generation + at-rest hashing.
 *
 * A POS API key is a bearer credential: anything that presents it authenticates
 * as that tenant (server/pos.ts requirePosKey). Storing it in plaintext meant a
 * DB read (or a backup, or a dump) handed out live credentials for EVERY tenant
 * at once. Instead, tenants.pos_api_key now stores only the SHA-256 of the key:
 *
 *   - generation (signup, rotation) returns the plaintext exactly ONCE to the
 *     tenant, who enters it into their POS app;
 *   - authentication hashes the presented key and compares hashes
 *     (server/db.ts getTenantByPosApiKey);
 *   - the platform can never recover a lost key — the tenant rotates instead
 *     (tenant.rotatePosApiKey), which is precisely the "zolto admin never sees
 *     tenant credentials" property.
 *
 * SHA-256 (unsalted) is sufficient here because the keys are 256-bit random
 * strings — there is no dictionary to attack, so a salt adds nothing.
 */

import crypto from "node:crypto";

/** Generate a new plaintext POS API key (64 hex chars, 256 bits of entropy). */
export function generatePosApiKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/** Hash a presented/plaintext key into the form stored in tenants.pos_api_key. */
export function hashPosApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}
