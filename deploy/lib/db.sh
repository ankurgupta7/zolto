#!/bin/bash
# deploy/lib/db.sh — MySQL migration helpers shared by update.sh.
#
# Sourced (not executed) by update.sh, after $MYSQL_USER / $MYSQL_PASSWORD /
# $MYSQL_DATABASE are loaded from .env and the ok()/die() logging helpers are
# defined — this file relies on both being present in the calling shell.
# Kept in its own file so it can be sourced and exercised directly by
# deploy/lib/db.test.sh without running the rest of update.sh (git pull,
# docker builds, cron install, ...).

# A migration statement blocked on a lock (e.g. held by another connection,
# or an orphaned query from a previously interrupted run) used to hang
# forever with no feedback, since neither the connection nor the statement
# had any timeout. Bound both, so a stuck migration fails fast with a clear
# error instead of hanging the whole deploy indefinitely.
MYSQL_LOCK_TIMEOUT_SQL="SET SESSION lock_wait_timeout=15, innodb_lock_wait_timeout=15; "

# Builds the docker-compose-exec-mysql command line. Callers assign the
# result to $MYSQL, e.g.:  MYSQL="$(build_mysql_cmd)"
build_mysql_cmd() {
  echo "docker compose exec -T db mysql --connect-timeout=10 -u${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE}"
}

# Helper: run a SQL block and print a named result. On failure, surfaces the
# actual MySQL error — previously discarded (2>/dev/null), which made a bare
# "Migration failed: <label>" impossible to debug.
run_sql() {
  local label="$1"; shift
  local output
  if output=$($MYSQL -e "${MYSQL_LOCK_TIMEOUT_SQL}$*" 2>&1); then
    ok "$label"
  else
    die "Migration failed: ${label}
${output}"
  fi
}

# Helper: check whether a column exists (prints 1 or 0)
col_exists() { # col_exists TABLE COLUMN
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1' AND COLUMN_NAME='$2';" 2>/dev/null || echo 0
}

# Helper: check whether a table exists (prints 1 or 0)
tbl_exists() {
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1';" 2>/dev/null || echo 0
}

# Helper: check whether a unique constraint exists on a column (prints 1 or 0)
idx_exists() { # idx_exists TABLE INDEX_NAME
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1'
    AND CONSTRAINT_NAME='$2';" 2>/dev/null || echo 0
}

# Helper: is a column currently nullable? (prints YES / NO / empty if absent)
col_nullable() { # col_nullable TABLE COLUMN
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT IS_NULLABLE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1' AND COLUMN_NAME='$2';" 2>/dev/null || echo ""
}

# Helper: number of rows matching a WHERE on a table (prints an integer, 0 on error)
row_count() { # row_count TABLE WHERE_CLAUSE
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM \`$1\` WHERE $2;" 2>/dev/null || echo 0
}

# Tables that carry a NOT NULL tenant_id in drizzle/schema.ts. Kept as a function
# (not a global) so db.test.sh can call it without side effects.
tenant_scoped_tables() {
  echo users products product_images instagram_posts orders bulk_upload_logs \
       pos_orders pos_order_items returns stripe_reconciliations
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0019: multi-tenant foundation.
#
# Brings the database in line with drizzle/schema.ts's multi-tenancy, which was
# authored in the schema but never migrated. Creates the tenant tables, seeds
# tenant #1 (a neutral platform tenant — the fallback for context-free writes;
# override with SEED_TENANT_SLUG/SEED_TENANT_NAME), then adds tenant_id to every
# tenant-scoped table (nullable -> backfill = 1 -> NOT NULL). Fully idempotent:
# on an already-migrated DB it performs no writes. No FK constraints or secondary
# indexes are added because schema.ts declares none (no .references()).
#
# tenant #1's pos_api_key stores only the SHA-256 of the key (the server hashes
# a presented key to authenticate — server/posApiKey.ts). For a cutover that
# imports an existing store as tenant #1, set POS_API_KEY so that store's POS
# terminal — which authenticates purely by that key — keeps working after the
# migration; the plaintext env value is hashed on insert and never stored.
# ─────────────────────────────────────────────────────────────────────────────
# Migration 0020: Stripe Connect for tenant storefronts.
#
# Adds tenants.stripe_connected_account_id — the Standard Connect account a
# tenant links so THEIR storefront checkout pays out directly to them,
# separate from stripe_customer_id/stripe_subscription_id (Zolto's own
# billing relationship with the tenant, added in 0019). Idempotent: a no-op
# if the column already exists.
migrate_0020_stripe_connect() {
  if [ "$(col_exists tenants stripe_connected_account_id)" = "0" ]; then
    run_sql "0020 add tenants.stripe_connected_account_id" \
      "ALTER TABLE \`tenants\` ADD \`stripe_connected_account_id\` varchar(255) NULL;"
  else
    ok "0020 tenants.stripe_connected_account_id already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0021: POS <-> online inventory sync (checkout holds).
#
# Adds products.reserved_until / products.reserved_token — a short-lived hold
# placed on a piece while an online Checkout Session for it is in flight, so
# the POS terminal (or a second online checkout) can't sell the same
# one-of-a-kind piece out from under it. reserved_token disambiguates
# concurrent holds so releasing an expired/failed session's hold can never
# clear a different, newer hold on the same piece. Idempotent: a no-op if the
# columns already exist.
migrate_0021_product_reservations() {
  if [ "$(col_exists products reserved_until)" = "0" ]; then
    run_sql "0021 add products.reserved_until" \
      "ALTER TABLE \`products\` ADD \`reserved_until\` timestamp NULL;"
  else
    ok "0021 products.reserved_until already exists"
  fi

  if [ "$(col_exists products reserved_token)" = "0" ]; then
    run_sql "0021 add products.reserved_token" \
      "ALTER TABLE \`products\` ADD \`reserved_token\` varchar(32) NULL;"
  else
    ok "0021 products.reserved_token already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0022: POS attribution for amount-only in-person sales.
#
# Creates pos_attributions — the review queue for the end-of-day pass that ties
# a bare-amount POS sale (a custom line item with no productId) back to a product.
# Keyed on posOrderItemId so each unattributed line is reviewed exactly once;
# confirmationToken backs the one-click email links. Idempotent: a no-op if the
# table already exists. See server/posAttribution.ts + drizzle/schema.ts.
# ─────────────────────────────────────────────────────────────────────────────
migrate_0022_pos_attributions() {
  if [ "$(tbl_exists pos_attributions)" = "0" ]; then
    run_sql "0022 pos_attributions table" "
      CREATE TABLE IF NOT EXISTS \`pos_attributions\` (
        \`id\`                  int AUTO_INCREMENT NOT NULL,
        \`tenant_id\`           int NOT NULL,
        \`posOrderId\`          int NOT NULL,
        \`posOrderItemId\`      int NOT NULL,
        \`amountRappen\`        int NOT NULL,
        \`status\`              enum('pending_review','confirmed','rejected','no_candidates') NOT NULL DEFAULT 'pending_review',
        \`candidateProductIds\` varchar(512) NOT NULL,
        \`chosenProductId\`     int,
        \`confirmationToken\`   varchar(128) NOT NULL,
        \`resolvedAt\`          timestamp NULL,
        \`createdAt\`           timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\`           timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`pos_attributions_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`pos_attributions_posOrderItemId_unique\` UNIQUE(\`posOrderItemId\`),
        CONSTRAINT \`pos_attributions_confirmationToken_unique\` UNIQUE(\`confirmationToken\`)
      );"
  else
    ok "0022 pos_attributions already exists"
  fi
}

migrate_0019_multitenant() {
  run_sql "0019 tenants table" "
    CREATE TABLE IF NOT EXISTS \`tenants\` (
      \`id\`                        int AUTO_INCREMENT NOT NULL,
      \`slug\`                      varchar(64) NOT NULL,
      \`name\`                      varchar(255) NOT NULL,
      \`domain\`                    varchar(255),
      \`plan\`                      enum('free','maker','studio','atelier') NOT NULL DEFAULT 'free',
      \`stripe_customer_id\`        varchar(255),
      \`stripe_subscription_id\`    varchar(255),
      \`status\`                    enum('trialing','active','past_due','canceled') DEFAULT 'trialing',
      \`trial_ends_at\`             timestamp NULL,
      \`pos_api_key\`               varchar(64) NOT NULL,
      \`onboarding_step\`           int DEFAULT 0,
      \`onboarding_completed_at\`   timestamp NULL,
      \`referred_by\`               int,
      \`referral_code\`             varchar(16),
      \`referral_discount_applied\` boolean DEFAULT false,
      \`plan_price_override\`       decimal(10,2),
      \`price_lock_expires_at\`     timestamp NULL,
      \`createdAt\`                 timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\`                 timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`tenants_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`tenants_slug_unique\` UNIQUE(\`slug\`),
      CONSTRAINT \`tenants_pos_api_key_unique\` UNIQUE(\`pos_api_key\`),
      CONSTRAINT \`tenants_referral_code_unique\` UNIQUE(\`referral_code\`)
    );"

  run_sql "0019 tenant_settings table" "
    CREATE TABLE IF NOT EXISTS \`tenant_settings\` (
      \`id\`                 int AUTO_INCREMENT NOT NULL,
      \`tenant_id\`          int NOT NULL,
      \`logo_url\`           varchar(1024),
      \`primary_color\`      varchar(7) DEFAULT '#000000',
      \`favicon_url\`        varchar(1024),
      \`whatsapp_number\`    varchar(32),
      \`instagram_handle\`   varchar(64),
      \`currency\`           varchar(10) DEFAULT 'chf',
      \`meta_title\`         varchar(255),
      \`meta_description\`   text,
      \`white_label_name\`   varchar(255),
      \`public_domain\`      varchar(255),
      \`discord_channel_id\` varchar(64),
      \`slack_channel_id\`   varchar(64),
      \`contact_email\`      varchar(320),
      \`contact_phone\`      varchar(32),
      \`facebook_url\`       varchar(1024),
      \`sso_provider\`       enum('google_workspace','microsoft','okta','custom'),
      \`sso_metadata_url\`   text,
      \`createdAt\`          timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\`          timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`tenant_settings_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`tenant_settings_tenant_id_unique\` UNIQUE(\`tenant_id\`)
    );"

  run_sql "0019 iteration_logs table" "
    CREATE TABLE IF NOT EXISTS \`iteration_logs\` (
      \`id\`          int AUTO_INCREMENT NOT NULL,
      \`tenant_id\`   int NOT NULL,
      \`request\`     text NOT NULL,
      \`solution\`    text NOT NULL,
      \`deployed_at\` timestamp NULL,
      \`validated\`   boolean DEFAULT false,
      \`impact\`      enum('critical','high','medium','low'),
      \`createdAt\`   timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`iteration_logs_id\` PRIMARY KEY(\`id\`)
    );"

  run_sql "0019 audit_logs table" "
    CREATE TABLE IF NOT EXISTS \`audit_logs\` (
      \`id\`            int AUTO_INCREMENT NOT NULL,
      \`tenant_id\`     int NOT NULL,
      \`user_id\`       int,
      \`action\`        varchar(64) NOT NULL,
      \`resource_type\` varchar(64),
      \`resource_id\`   int,
      \`metadata\`      json,
      \`ip\`            varchar(45),
      \`createdAt\`     timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`audit_logs_id\` PRIMARY KEY(\`id\`)
    );"

  run_sql "0019 api_keys table" "
    CREATE TABLE IF NOT EXISTS \`api_keys\` (
      \`id\`           int AUTO_INCREMENT NOT NULL,
      \`tenant_id\`    int NOT NULL,
      \`name\`         varchar(255),
      \`key_hash\`     varchar(64) NOT NULL,
      \`scopes\`       json,
      \`last_used_at\` timestamp NULL,
      \`createdAt\`    timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`api_keys_id\` PRIMARY KEY(\`id\`)
    );"

  run_sql "0019 add_ons table" "
    CREATE TABLE IF NOT EXISTS \`add_ons\` (
      \`id\`                    int AUTO_INCREMENT NOT NULL,
      \`tenant_id\`             int NOT NULL,
      \`type\`                  enum('extra_staff','extra_products','api_access','priority_support') NOT NULL,
      \`quantity\`              int NOT NULL DEFAULT 1,
      \`stripe_sub_item_id\`    varchar(255),
      \`createdAt\`             timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`add_ons_id\` PRIMARY KEY(\`id\`)
    );"

  # ── Seed tenant #1 (the platform's system tenant) ───────────────────────────
  # Zolto is a standalone multi-tenant product; tenant #1 is a neutral platform
  # tenant, NOT any specific store. It exists because context-free server writes
  # (webhooks, jobs) fall back to DEFAULT_TENANT_ID=1. Real stores are created via
  # self-serve signup. Override the identity per deployment with SEED_TENANT_SLUG
  # / SEED_TENANT_NAME (e.g. a cutover that imports an existing store as tenant 1).
  local seed_slug="${SEED_TENANT_SLUG:-platform}"
  local seed_name="${SEED_TENANT_NAME:-Zolto Platform}"
  if [ "$(row_count tenants 'id=1')" = "0" ]; then
    local pos_key="${POS_API_KEY:-}"
    if [ -z "$pos_key" ]; then
      # A fresh standalone deploy has no POS terminal yet, so a generated key is
      # fine; a cutover should set POS_API_KEY so the existing terminal keeps
      # working. Only the SHA-256 of the key is stored (server/posApiKey.ts) —
      # a generated throwaway key's plaintext is never needed or recoverable.
      pos_key="$(head -c 32 /dev/urandom 2>/dev/null | od -An -tx1 | tr -d ' \n' || date +%s%N)"
      warn "0019 POS_API_KEY not set — seeded tenant #1 with a generated (hashed) POS key."
      warn "     To connect a POS terminal to tenant #1 later, rotate its key from the"
      warn "     tenant admin panel (tenant.rotatePosApiKey) and enter the new key in the app."
    fi
    run_sql "0019 seed tenant #1 (${seed_slug})" "
      INSERT INTO \`tenants\` (\`id\`,\`slug\`,\`name\`,\`plan\`,\`status\`,\`pos_api_key\`)
      VALUES (1,'${seed_slug}','${seed_name}','free','active',SHA2('${pos_key}',256));"
  else
    ok "0019 tenant #1 already seeded"
  fi

  if [ "$(row_count tenant_settings 'tenant_id=1')" = "0" ]; then
    run_sql "0019 seed tenant #1 settings" "
      INSERT INTO \`tenant_settings\` (\`tenant_id\`,\`currency\`,\`white_label_name\`)
      VALUES (1,'chf','${seed_name}');"
  else
    ok "0019 tenant #1 settings already seeded"
  fi

  # ── Add tenant_id to every tenant-scoped table (nullable -> backfill -> NOT NULL) ──
  local tbl nullable
  for tbl in $(tenant_scoped_tables); do
    if [ "$(col_exists "$tbl" tenant_id)" = "0" ]; then
      run_sql "0019 add ${tbl}.tenant_id (nullable)" \
        "ALTER TABLE \`${tbl}\` ADD \`tenant_id\` int NULL;"
    fi
    nullable="$(col_nullable "$tbl" tenant_id)"
    if [ "$nullable" = "YES" ]; then
      run_sql "0019 backfill ${tbl}.tenant_id = 1" \
        "UPDATE \`${tbl}\` SET \`tenant_id\` = 1 WHERE \`tenant_id\` IS NULL;"
      run_sql "0019 enforce ${tbl}.tenant_id NOT NULL" \
        "ALTER TABLE \`${tbl}\` MODIFY \`tenant_id\` int NOT NULL;"
    else
      ok "0019 ${tbl}.tenant_id already NOT NULL"
    fi
  done
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0023: tenant signup schema drift fix.
#
# Self-serve signup (server/routers/tenant.ts create) inserts plan='free' and
# relies on tenants.terminal_location_id — but 0019 created the plan enum with
# the OLD tier names (starter/growth/enterprise, since renamed to
# free/maker/studio/atelier in shared/platform.ts PLANS) and terminal_location_id
# was only ever in the drizzle/*.sql (db:push) path, which is NOT authoritative
# (update.sh is). On a live DB built by update.sh the signup insert therefore
# failed with "Unknown column 'terminal_location_id'" / a truncated 'free'.
#
# Two idempotent steps:
#  1. Widen tenants.plan to the union of old+new values, remap any old rows
#     (starter→free, growth→maker, enterprise→atelier), then narrow to the new
#     enum with DEFAULT 'free'.
#  2. Add tenants.terminal_location_id (Stripe Terminal Location, tml_...).
# ─────────────────────────────────────────────────────────────────────────────
migrate_0023_tenant_signup_fix() {
  local plan_enum
  plan_enum=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='tenants' AND COLUMN_NAME='plan';" 2>/dev/null || echo "")

  if echo "$plan_enum" | grep -q "'free'"; then
    ok "0023 tenants.plan already has new plan ids"
  else
    # Widen first so old and new values coexist during the remap.
    run_sql "0023 widen tenants.plan enum" \
      "ALTER TABLE \`tenants\` MODIFY \`plan\` enum('starter','growth','enterprise','free','maker','studio','atelier') NOT NULL DEFAULT 'starter';"
    run_sql "0023 remap tenants.plan starter→free" \
      "UPDATE \`tenants\` SET \`plan\`='free' WHERE \`plan\`='starter';"
    run_sql "0023 remap tenants.plan growth→maker" \
      "UPDATE \`tenants\` SET \`plan\`='maker' WHERE \`plan\`='growth';"
    run_sql "0023 remap tenants.plan enterprise→atelier" \
      "UPDATE \`tenants\` SET \`plan\`='atelier' WHERE \`plan\`='enterprise';"
    run_sql "0023 finalize tenants.plan enum" \
      "ALTER TABLE \`tenants\` MODIFY \`plan\` enum('free','maker','studio','atelier') NOT NULL DEFAULT 'free';"
  fi

  if [ "$(col_exists tenants terminal_location_id)" = "0" ]; then
    run_sql "0023 add tenants.terminal_location_id" \
      "ALTER TABLE \`tenants\` ADD \`terminal_location_id\` varchar(255) NULL;"
  else
    ok "0023 tenants.terminal_location_id already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0024: staff invites + photo credit ledger tables.
#
# Both exist in drizzle/schema.ts (staff_invites for team-seat invites,
# photo_credit_ledger for AI photo metering) but had no update.sh migration —
# any invite/credit write would have hit "table doesn't exist" on a live DB.
# Idempotent: no-op if the tables already exist.
# ─────────────────────────────────────────────────────────────────────────────
migrate_0024_staff_invites_and_photo_credits() {
  if [ "$(tbl_exists staff_invites)" = "0" ]; then
    run_sql "0024 staff_invites table" "
      CREATE TABLE IF NOT EXISTS \`staff_invites\` (
        \`id\`                int AUTO_INCREMENT NOT NULL,
        \`tenant_id\`         int NOT NULL,
        \`email\`             varchar(320) NOT NULL,
        \`token\`             varchar(64) NOT NULL,
        \`invited_by_user_id\` int,
        \`expiresAt\`         timestamp NOT NULL,
        \`acceptedAt\`        timestamp NULL,
        \`createdAt\`         timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`staff_invites_id\` PRIMARY KEY(\`id\`)
      );"
  else
    ok "0024 staff_invites already exists"
  fi

  if [ "$(tbl_exists photo_credit_ledger)" = "0" ]; then
    run_sql "0024 photo_credit_ledger table" "
      CREATE TABLE IF NOT EXISTS \`photo_credit_ledger\` (
        \`id\`         int AUTO_INCREMENT NOT NULL,
        \`tenant_id\`  int NOT NULL,
        \`delta\`      int NOT NULL,
        \`kind\`       enum('monthly_grant','purchase','consumption','manual_adjustment') NOT NULL,
        \`ref\`        varchar(255),
        \`note\`       text,
        \`createdAt\`  timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`photo_credit_ledger_id\` PRIMARY KEY(\`id\`)
      );"
  else
    ok "0024 photo_credit_ledger already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0025: tenant secrets vault + per-tenant Discord DM recipient.
#
# Creates tenant_secrets — the encrypted vault for tenant-provided credentials
# (ciphertext only, AES-256-GCM against TENANT_SECRETS_KEY; see
# server/tenantSecrets.ts) — and adds tenant_settings.discord_owner_user_id so
# each tenant's owner can receive their own "new order" DM from the single
# platform bot. Idempotent: no-op when already applied.
#
# NOTE: this migration is DDL only. Hashing the EXISTING plaintext
# tenants.pos_api_key values is a one-shot data migration handled by the
# temporary scripts/migrate-tenant-secrets.mjs helper — run it once per
# deployment right after this migration, then delete the helper.
# ─────────────────────────────────────────────────────────────────────────────
migrate_0025_tenant_secrets() {
  if [ "$(tbl_exists tenant_secrets)" = "0" ]; then
    run_sql "0025 tenant_secrets table" "
      CREATE TABLE IF NOT EXISTS \`tenant_secrets\` (
        \`id\`          int AUTO_INCREMENT NOT NULL,
        \`tenant_id\`   int NOT NULL,
        \`provider\`    varchar(64) NOT NULL,
        \`ciphertext\`  text NOT NULL,
        \`hint\`        varchar(8) NOT NULL,
        \`key_version\` int NOT NULL DEFAULT 1,
        \`createdAt\`   timestamp NOT NULL DEFAULT (now()),
        \`rotated_at\`  timestamp NULL,
        \`last_used_at\` timestamp NULL,
        CONSTRAINT \`tenant_secrets_id\` PRIMARY KEY(\`id\`)
      );"
  else
    ok "0025 tenant_secrets already exists"
  fi

  if [ "$(col_exists tenant_settings discord_owner_user_id)" = "0" ]; then
    run_sql "0025 add tenant_settings.discord_owner_user_id" \
      "ALTER TABLE \`tenant_settings\` ADD \`discord_owner_user_id\` varchar(64) NULL;"
  else
    ok "0025 tenant_settings.discord_owner_user_id already exists"
  fi
}
