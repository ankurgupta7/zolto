#!/usr/bin/env node
/**
 * ⚠️ TEMPORARY MIGRATION HELPER — delete this file once every deployment has
 * run it (tracked in the PR that introduced it).
 *
 * One-shot migration for the platform/tenant secrets separation:
 *
 *   1. ENV migration (default): rewrites .env for the new layout —
 *      - REMOVES fossil tenant-era vars: POS_API_KEY, CIRCLECI_TOKEN,
 *        CODEMAGIC_TOKEN, CODEMAGIC_APP_ID (retired with
 *        deploy/rotate-pos-key.sh; POS keys are per-tenant now).
 *      - ADDS TENANT_SECRETS_KEY (generated, openssl-grade random) if missing.
 *      - ADDS an empty STRIPE_CONNECT_CLIENT_ID placeholder if missing.
 *      The original is preserved as .env.bak-YYYYmmdd-HHMMSS. Writes
 *      .env.migrated by default; pass --write to update .env in place.
 *
 *   2. DB migration (--db): one-shot hash of EXISTING plaintext
 *      tenants.pos_api_key values (SHA-256, matching server/posApiKey.ts).
 *      MUST RUN EXACTLY ONCE per database, AFTER update.sh has applied
 *      migration 0025 and the new code is deployed. It refuses to run twice
 *      (marker row in tenant_secrets). POS terminals keep working — the
 *      server now hashes the presented key, which matches the stored hash.
 *
 * Usage (on the server, from the repo root):
 *   node scripts/migrate-tenant-secrets.mjs            # .env → .env.migrated
 *   node scripts/migrate-tenant-secrets.mjs --write    # rewrite .env in place
 *   node scripts/migrate-tenant-secrets.mjs --db       # hash POS keys (once!)
 *   node scripts/migrate-tenant-secrets.mjs --write --db
 *
 * No dependencies — plain Node + the deployment's own `docker compose` mysql.
 */

import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";

const args = new Set(process.argv.slice(2));
const WRITE = args.has("--write");
const DO_DB = args.has("--db");
const ENV_PATH = args.has("--env")
  ? process.argv[process.argv.indexOf("--env") + 1]
  : ".env";

// ── Fossil vars removed by this migration ─────────────────────────────────────
const FOSSIL_VARS = [
  "POS_API_KEY", // per-tenant now: generated at signup, hashed at rest
  "CIRCLECI_TOKEN", // only used by the retired deploy/rotate-pos-key.sh
  "CODEMAGIC_TOKEN", //   ↳ same
  "CODEMAGIC_APP_ID", //   ↳ same
];

function log(msg) {
  console.log(`  ${msg}`);
}
function header(msg) {
  console.log(`\n==> ${msg}`);
}

// ── 1. ENV migration ──────────────────────────────────────────────────────────
function migrateEnv() {
  header(`ENV migration: ${ENV_PATH}`);
  if (!fs.existsSync(ENV_PATH)) {
    console.error(`  ✗ ${ENV_PATH} not found — skipping env migration.`);
    return;
  }
  const original = fs.readFileSync(ENV_PATH, "utf8");
  const lines = original.split("\n");
  const presentKeys = new Set(
    lines
      .map((l) => l.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1])
      .filter(Boolean),
  );

  const kept = [];
  const removed = [];
  for (const line of lines) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
    if (m && FOSSIL_VARS.includes(m[1])) {
      removed.push(m[1]);
      // Drop a dangling comment block immediately above the removed var
      // (the rotate-pos-key.sh section header/comments).
      while (
        kept.length > 0 &&
        (kept[kept.length - 1].trimStart().startsWith("#") ||
          kept[kept.length - 1].trim() === "")
      ) {
        kept.pop();
      }
      continue;
    }
    kept.push(line);
  }

  const additions = [];
  if (!presentKeys.has("TENANT_SECRETS_KEY")) {
    const key = crypto.randomBytes(32).toString("hex");
    additions.push(
      "",
      "# ── Tenant secrets vault (added by migrate-tenant-secrets.mjs) ──",
      "# Master key encrypting tenant-provided secrets at rest. Back it up like",
      "# the database password — losing it makes tenant_secrets unrecoverable.",
      `TENANT_SECRETS_KEY=${key}`,
    );
    log(`+ TENANT_SECRETS_KEY generated (64 hex chars)`);
  } else {
    log(`= TENANT_SECRETS_KEY already present, untouched`);
  }
  if (!presentKeys.has("STRIPE_CONNECT_CLIENT_ID")) {
    additions.push(
      "",
      "# Stripe Connect OAuth client id (ca_...) — Dashboard → Connect → Settings.",
      "# Lets tenants link their OWN Stripe accounts. Unset = feature disabled.",
      "STRIPE_CONNECT_CLIENT_ID=",
    );
    log(`+ STRIPE_CONNECT_CLIENT_ID placeholder added (fill in from Stripe)`);
  } else {
    log(`= STRIPE_CONNECT_CLIENT_ID already present, untouched`);
  }

  for (const v of removed) log(`- ${v} removed (fossil)`);
  if (removed.length === 0) log(`= no fossil vars found`);

  // Also remind about external systems that still hold the fossil key.
  if (removed.includes("POS_API_KEY")) {
    log(`! Remember: POS_API_KEY may still exist in CircleCI / Codemagic`);
    log(`  project settings and codemagic.yaml — remove it there too.`);
  }

  const output =
    kept.join("\n").replace(/\n{3,}/g, "\n\n") + additions.join("\n") + "\n";

  if (WRITE) {
    const backup = `${ENV_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, "").slice(0, 15)}`;
    fs.copyFileSync(ENV_PATH, backup);
    fs.writeFileSync(ENV_PATH, output);
    log(`✓ ${ENV_PATH} rewritten in place (backup: ${backup})`);
  } else {
    const out = `${ENV_PATH}.migrated`;
    fs.writeFileSync(out, output);
    log(`✓ wrote ${out} — review it, then: mv ${out} ${ENV_PATH}`);
  }
}

// ── 2. DB migration: hash existing plaintext POS keys (one-shot) ─────────────
function sqlEnv() {
  // Reuse the deployment's .env for MySQL credentials.
  const env = {};
  if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  for (const k of ["MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_DATABASE"]) {
    env[k] = process.env[k] ?? env[k];
    if (!env[k]) {
      console.error(`  ✗ ${k} not set (in ${ENV_PATH} or the environment).`);
      process.exit(1);
    }
  }
  return env;
}

function mysql(env, sql) {
  return execSync(
    `docker compose exec -T db mysql --connect-timeout=10 ` +
      `-u${env.MYSQL_USER} -p${env.MYSQL_PASSWORD} ${env.MYSQL_DATABASE} ` +
      `-se "${sql.replace(/"/g, '\\"')}"`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
  ).trim();
}

function migrateDb() {
  header("DB migration: hash plaintext tenants.pos_api_key (ONE-SHOT)");
  const env = sqlEnv();

  const hasTable = mysql(
    env,
    "SELECT COUNT(*) FROM information_schema.TABLES " +
      `WHERE TABLE_SCHEMA='${env.MYSQL_DATABASE}' AND TABLE_NAME='tenant_secrets';`,
  );
  if (hasTable !== "1") {
    console.error(
      "  ✗ tenant_secrets does not exist yet. Run ./update.sh first " +
        "(migration 0025), then re-run with --db.",
    );
    process.exit(1);
  }

  const marker = mysql(
    env,
    "SELECT COUNT(*) FROM tenant_secrets " +
      "WHERE provider='_migration' AND hint='poskey';",
  );
  if (marker !== "0") {
    log("= marker row found — POS keys were already hashed. Nothing to do.");
    return;
  }

  const count = mysql(env, "SELECT COUNT(*) FROM tenants;");
  log(`hashing pos_api_key for ${count} tenant(s)…`);
  mysql(env, "UPDATE tenants SET pos_api_key = SHA2(pos_api_key, 256);");
  mysql(
    env,
    "INSERT INTO tenant_secrets (tenant_id, provider, ciphertext, hint) " +
      "VALUES (0, '_migration', 'pos_api_key hashed with SHA2', 'poskey');",
  );
  log(`✓ done. POS terminals keep working — the server hashes the presented`);
  log(`  key before lookup. Verify one terminal, then DELETE this script.`);
}

// ── main ──────────────────────────────────────────────────────────────────────
console.log("migrate-tenant-secrets — TEMPORARY one-shot helper");
if (!DO_DB || WRITE || args.size === 0 || args.has("--env")) migrateEnv();
if (DO_DB) migrateDb();
if (args.size === 0) {
  console.log(
    "\nNext: review .env.migrated, then re-run with --write --db on the server.",
  );
}
