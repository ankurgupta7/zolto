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

# Helper: does a PLAIN (non-constraint) index exist?
#
# idx_exists above queries TABLE_CONSTRAINTS, which only ever contains PRIMARY
# KEY, UNIQUE and FOREIGN KEY entries — an ordinary CREATE INDEX never appears
# there. Probing for one with idx_exists therefore always answers 0, so the
# migration would re-issue CREATE INDEX on every deploy and fail on the second
# run. STATISTICS is the table that lists every index, constraint-backed or not.
plain_index_exists() { # plain_index_exists TABLE INDEX_NAME
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1'
    AND INDEX_NAME='$2';" 2>/dev/null || echo 0
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

# ── 0026: per-tenant storage ledger ──────────────────────────────────────────
# Creates storage_objects, which backs the "5 GB / 50 GB photo storage" on the
# plan cards. Before this nothing enforced either figure — the only limit was
# express.json's 50 MB per request — so a free tenant could upload without
# bound. server/storage.ts storagePut now takes a tenantId, checks the plan
# allowance, and records a row here.
#
# No backfill: objects written before this migration are unmetered and stay
# that way. Charging a merchant for photos we never measured would be worse
# than starting their ledger at zero, and at current volumes the difference is
# noise. Idempotent.
migrate_0026_storage_objects() {
  if [ "$(tbl_exists storage_objects)" = "0" ]; then
    run_sql "0026 storage_objects table" "
      CREATE TABLE IF NOT EXISTS \`storage_objects\` (
        \`id\`          int AUTO_INCREMENT NOT NULL,
        \`tenant_id\`   int NOT NULL,
        \`storage_key\` varchar(512) NOT NULL,
        \`bytes\`       int NOT NULL,
        \`createdAt\`   timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`storage_objects_id\` PRIMARY KEY(\`id\`)
      );"
  else
    ok "0026 storage_objects already exists"
  fi

  if [ "$(plain_index_exists storage_objects storage_objects_tenant_idx)" = "0" ]; then
    run_sql "0026 index storage_objects(tenant_id)" \
      "CREATE INDEX \`storage_objects_tenant_idx\` ON \`storage_objects\` (\`tenant_id\`);"
  else
    ok "0026 storage_objects_tenant_idx already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0027: two-tier pricing pivot (free/pro) + order channel/fee columns.
#
# Ships drizzle/0008_two_tier_pricing.sql, which update.sh never picked up —
# checkout.ts and billing.ts have referenced orders.channel and
# orders.platform_fee_rappen since the pivot shipped, so any deploy that only
# ran through update.sh (not drizzle-kit) was missing them entirely. Same
# widen/remap/finalize shape as 0023: maker/studio/atelier all collapse to
# pro (every old paid tier is a superset-priced ancestor of Pro), Stripe
# subscriptions are untouched by this step — see the legacy-subscriber
# runbook in docs/planning/pricing-pivot-agent-commerce.md §8. Idempotent.
# ─────────────────────────────────────────────────────────────────────────────
migrate_0027_two_tier_pricing() {
  local plan_enum
  plan_enum=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='tenants' AND COLUMN_NAME='plan';" 2>/dev/null || echo "")

  if echo "$plan_enum" | grep -q "'pro'"; then
    ok "0027 tenants.plan already has 'pro'"
  else
    # Widen first so old and new values coexist during the remap.
    run_sql "0027 widen tenants.plan enum" \
      "ALTER TABLE \`tenants\` MODIFY \`plan\` enum('free','maker','studio','atelier','pro') NOT NULL DEFAULT 'free';"
    run_sql "0027 remap tenants.plan maker→pro" \
      "UPDATE \`tenants\` SET \`plan\`='pro' WHERE \`plan\`='maker';"
    run_sql "0027 remap tenants.plan studio→pro" \
      "UPDATE \`tenants\` SET \`plan\`='pro' WHERE \`plan\`='studio';"
    run_sql "0027 remap tenants.plan atelier→pro" \
      "UPDATE \`tenants\` SET \`plan\`='pro' WHERE \`plan\`='atelier';"
    run_sql "0027 finalize tenants.plan enum" \
      "ALTER TABLE \`tenants\` MODIFY \`plan\` enum('free','pro') NOT NULL DEFAULT 'free';"
  fi

  if [ "$(col_exists orders channel)" = "0" ]; then
    run_sql "0027 add orders.channel" \
      "ALTER TABLE \`orders\` ADD \`channel\` enum('web','agent') NOT NULL DEFAULT 'web';"
  else
    ok "0027 orders.channel already exists"
  fi

  if [ "$(col_exists orders platform_fee_rappen)" = "0" ]; then
    run_sql "0027 add orders.platform_fee_rappen" \
      "ALTER TABLE \`orders\` ADD \`platform_fee_rappen\` int NOT NULL DEFAULT 0;"
  else
    ok "0027 orders.platform_fee_rappen already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0033: German + French product locales.
#
# Ships drizzle/0007_product_locales.sql, which update.sh never picked up —
# only its follow-up, 0009_product_locale_it, was ported (as 0028), so a
# database built by update.sh had nameEn/descriptionEn and nameIt/descriptionIt
# but no DE/FR columns at all. drizzle/schema.ts declares all of them, so every
# storefront product query selected `nameDe` and failed outright:
#
#   ER_BAD_FIELD_ERROR: Unknown column 'nameDe' in 'field list'
#
# Nullable like the other locales — the storefront falls back to the merchant's
# primary name/description whenever a locale is empty (client/src/lib/
# localize.ts), so this is purely additive and needs no backfill. Idempotent.
# ─────────────────────────────────────────────────────────────────────────────
migrate_0033_product_locales_de_fr() {
  if [ "$(col_exists products nameDe)" = "0" ]; then
    run_sql "0033 add products.nameDe" \
      "ALTER TABLE \`products\` ADD \`nameDe\` varchar(255) NULL;"
  else
    ok "0033 products.nameDe already exists"
  fi

  if [ "$(col_exists products descriptionDe)" = "0" ]; then
    run_sql "0033 add products.descriptionDe" \
      "ALTER TABLE \`products\` ADD \`descriptionDe\` text NULL;"
  else
    ok "0033 products.descriptionDe already exists"
  fi

  if [ "$(col_exists products nameFr)" = "0" ]; then
    run_sql "0033 add products.nameFr" \
      "ALTER TABLE \`products\` ADD \`nameFr\` varchar(255) NULL;"
  else
    ok "0033 products.nameFr already exists"
  fi

  if [ "$(col_exists products descriptionFr)" = "0" ]; then
    run_sql "0033 add products.descriptionFr" \
      "ALTER TABLE \`products\` ADD \`descriptionFr\` text NULL;"
  else
    ok "0033 products.descriptionFr already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0034: magic-link login tokens.
#
# Ships drizzle/0014_magic_link_tokens.sql — the same omission as 0033, one
# table over: server/db.ts (createMagicLinkToken / consumeMagicLinkToken) has
# written to `magic_link_tokens` since passwordless sign-in shipped, but
# update.sh never created it, so requesting a login link failed on a live
# deployment. Mirrors the drizzle DDL exactly, including the UNIQUE on `token`
# that consumeMagicLinkToken's single-row lookup relies on. Idempotent.
# ─────────────────────────────────────────────────────────────────────────────
migrate_0034_magic_link_tokens() {
  if [ "$(tbl_exists magic_link_tokens)" = "0" ]; then
    run_sql "0034 magic_link_tokens table" "
      CREATE TABLE IF NOT EXISTS \`magic_link_tokens\` (
        \`id\`         int AUTO_INCREMENT NOT NULL,
        \`email\`      varchar(320) NOT NULL,
        \`token\`      varchar(64) NOT NULL,
        \`next\`       varchar(512),
        \`expiresAt\`  timestamp NOT NULL,
        \`consumedAt\` timestamp NULL,
        \`createdAt\`  timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`magic_link_tokens_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`magic_link_tokens_token_unique\` UNIQUE(\`token\`)
      );"
  else
    ok "0034 magic_link_tokens already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0044: one-tap POS register pairing.
#
# Ships drizzle/0026_pos_pairing_tokens.sql. server/posPairing.ts mints a
# short-lived single-use token so a merchant can bind a register by tapping a
# link instead of typing a 64-char key into a phone; without this table minting
# a pairing link fails on a live deployment. Mirrors the drizzle DDL exactly,
# including the UNIQUE on `token` that redemption's single-row lookup relies on.
# Idempotent.
# ─────────────────────────────────────────────────────────────────────────────
migrate_0044_pos_pairing_tokens() {
  if [ "$(tbl_exists pos_pairing_tokens)" = "0" ]; then
    run_sql "0044 pos_pairing_tokens table" "
      CREATE TABLE IF NOT EXISTS \`pos_pairing_tokens\` (
        \`id\`         int AUTO_INCREMENT NOT NULL,
        \`tenant_id\`  int NOT NULL,
        \`token\`      varchar(64) NOT NULL,
        \`expiresAt\`  timestamp NOT NULL,
        \`consumedAt\` timestamp NULL,
        \`createdAt\`  timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`pos_pairing_tokens_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`pos_pairing_tokens_token_unique\` UNIQUE(\`token\`)
      );"
  else
    ok "0044 pos_pairing_tokens already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0045: the paid one-time site import.
#
# Ships drizzle/0027_site_imports.sql. server/routers/siteImport.ts writes a row
# per attempt; without this table the importer's free preview fails outright.
# `status` carries the previewed → paid → applied order that keeps a replayed
# Stripe webhook from importing the same shop twice. Idempotent.
# ─────────────────────────────────────────────────────────────────────────────
migrate_0045_site_imports() {
  if [ "$(tbl_exists site_imports)" = "0" ]; then
    run_sql "0045 site_imports table" "
      CREATE TABLE IF NOT EXISTS \`site_imports\` (
        \`id\`                int AUTO_INCREMENT NOT NULL,
        \`tenant_id\`         int NOT NULL,
        \`source_url\`        varchar(1024) NOT NULL,
        \`status\`            enum('previewed','paid','applied','failed') NOT NULL DEFAULT 'previewed',
        \`extraction\`        json,
        \`product_count\`     int NOT NULL DEFAULT 0,
        \`stripe_session_id\` varchar(255),
        \`amount_cents\`      int,
        \`currency\`          varchar(3),
        \`paid_at\`           timestamp NULL,
        \`applied_at\`        timestamp NULL,
        \`failure_reason\`    varchar(512),
        \`createdAt\`         timestamp NOT NULL DEFAULT (now()),
        CONSTRAINT \`site_imports_id\` PRIMARY KEY(\`id\`)
      );"
  else
    ok "0045 site_imports already exists"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Migration 0047: restore users_openId_unique where it is missing.
#
# upsertUser writes every sign-in with onDuplicateKeyUpdate, which in MySQL
# fires only on a PRIMARY KEY or UNIQUE collision. `users.id` is autoincrement
# and never supplied, so openId's unique index is the ONLY thing that turns a
# repeat sign-in into an update. Without it every sign-in INSERTs a new row —
# the same person accumulating an account per visit, silently, with no error
# anywhere.
#
# The baseline created it (drizzle/0000_baseline_2026_07_05.sql). It then
# disappeared from drizzle/schema.ts and from the meta snapshots at 0004, while
# every database kept it, because no generated migration ever emitted the DROP.
# That is survivable until someone runs `npm run db:sync` (drizzle-kit push
# --force), which reconciles a live database to schema.ts and would drop what
# the file no longer declares. schema.ts declares it again; this is the other
# half, for any database where that already happened.
#
# Refuses rather than fails when duplicate openIds exist: ADD CONSTRAINT on
# duplicated data is an error, and run_sql's die() would abort the whole
# deploy. Merging duplicate accounts is a judgement call about which row's
# history to keep, so it warns and leaves the database alone.
# ─────────────────────────────────────────────────────────────────────────────
migrate_0047_users_openid_unique() {
  if [ "$(idx_exists users users_openId_unique)" != "0" ]; then
    ok "0047 users_openId_unique already present"
    return
  fi

  local dupes
  dupes=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM
    (SELECT \`openId\` FROM \`users\` GROUP BY \`openId\` HAVING COUNT(*) > 1) d;" 2>/dev/null || echo "")

  if [ -z "$dupes" ]; then
    warn "0047 could not check users.openId for duplicates — leaving the index alone"
    return
  fi

  if [ "$dupes" != "0" ]; then
    warn "0047 users_openId_unique NOT restored: ${dupes} openId(s) appear on more than one row."
    warn "     Every sign-in is creating a new row until this is fixed. Merge the"
    warn "     duplicates (bash deploy/dedupe-users.sh), then re-run this deploy."
    return
  fi

  run_sql "0047 restore users_openId_unique" \
    "ALTER TABLE \`users\` ADD CONSTRAINT \`users_openId_unique\` UNIQUE(\`openId\`);"
}

migrate_0036_merchant_verticals() {
  # Per-tenant categories + merchant vertical. Ships
  # drizzle/0017_merchant_verticals.sql and 0018_seed_jewellery_categories.sql:
  # converts the global jewellery category enum into a per-tenant list
  # (products.category enum→varchar keeps the stored strings, so no data step),
  # records what each merchant sells on tenant_settings, and seeds every
  # existing tenant with the jewellery preset so nothing changes for them.
  if [ "$(tbl_exists tenant_categories)" = "0" ]; then
    run_sql "0036 tenant_categories table" "
      CREATE TABLE IF NOT EXISTS \`tenant_categories\` (
        \`id\`         int AUTO_INCREMENT NOT NULL,
        \`tenant_id\`  int NOT NULL,
        \`key\`        varchar(64) NOT NULL,
        \`label_en\`   varchar(64) NOT NULL,
        \`label_de\`   varchar(64),
        \`extra_includes\` json,
        \`sort_order\` int NOT NULL DEFAULT 0,
        \`createdAt\`  timestamp NOT NULL DEFAULT (now()),
        \`updatedAt\`  timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT \`tenant_categories_id\` PRIMARY KEY(\`id\`),
        CONSTRAINT \`tenant_categories_tenant_key\` UNIQUE(\`tenant_id\`,\`key\`)
      );"
  else
    ok "0036 tenant_categories already exists"
  fi

  local category_type
  category_type=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COLUMN_TYPE FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='products' AND COLUMN_NAME='category';" 2>/dev/null || echo "")
  if echo "$category_type" | grep -q "^enum"; then
    # enum→varchar preserves the stored strings — lossless, no data rewrite.
    run_sql "0036 products.category enum → varchar(64)" \
      "ALTER TABLE \`products\` MODIFY COLUMN \`category\` varchar(64) NOT NULL;"
  else
    ok "0036 products.category already varchar"
  fi

  if [ "$(col_exists tenant_settings vertical)" = "0" ]; then
    run_sql "0036 add tenant_settings.vertical" \
      "ALTER TABLE \`tenant_settings\` ADD \`vertical\` varchar(32) NOT NULL DEFAULT 'jewellery';"
  else
    ok "0036 tenant_settings.vertical already exists"
  fi

  if [ "$(col_exists tenant_settings vertical_description)" = "0" ]; then
    run_sql "0036 add tenant_settings.vertical_description" \
      "ALTER TABLE \`tenant_settings\` ADD \`vertical_description\` text NULL;"
  else
    ok "0036 tenant_settings.vertical_description already exists"
  fi

  # Seed the jewellery preset for tenants with no category rows yet — the
  # exact keys/order/folding the app hard-coded before verticals existed.
  run_sql "0036 seed jewellery categories for existing tenants" "
    INSERT INTO \`tenant_categories\` (\`tenant_id\`, \`key\`, \`label_en\`, \`label_de\`, \`extra_includes\`, \`sort_order\`)
    SELECT t.\`id\`, c.\`k\`, c.\`k\`, c.\`de\`, c.\`extra\`, c.\`ord\`
    FROM \`tenants\` t
    CROSS JOIN (
      SELECT 'Necklaces' AS \`k\`, 'Halsketten' AS \`de\`, JSON_ARRAY('Sets') AS \`extra\`, 0 AS \`ord\`
      UNION ALL SELECT 'Earrings', 'Ohrringe', JSON_ARRAY('Sets'), 1
      UNION ALL SELECT 'Sets', 'Sets', NULL, 2
      UNION ALL SELECT 'Rings', 'Ringe', NULL, 3
      UNION ALL SELECT 'Bracelets', 'Armbänder', NULL, 4
      UNION ALL SELECT 'Bangles', 'Armreifen', NULL, 5
      UNION ALL SELECT 'Anklets', 'Fussschmuck', NULL, 6
      UNION ALL SELECT 'Brooches', 'Broschen', NULL, 7
      UNION ALL SELECT 'Hair Accessories', 'Haarschmuck', NULL, 8
      UNION ALL SELECT 'Other', 'Sonstiges', NULL, 9
    ) c
    WHERE NOT EXISTS (
      SELECT 1 FROM \`tenant_categories\` tc WHERE tc.\`tenant_id\` = t.\`id\`
    );"
}

# ─────────────────────────────────────────────────────────────────────────────
# Deploy state: skip the whole migration block when nothing about it changed.
#
# Every migration above is idempotent, and that is the point — but "idempotent"
# is not "free". Re-running the set costs ~90 `docker compose exec -T db mysql`
# round trips (each one a fresh exec plus a fresh client connection), which is
# tens of seconds of a deploy that, on a no-schema-change pull, applies exactly
# nothing.
#
# So record what was applied. The key is a hash of the files that DEFINE the
# migration set — update.sh and this file — and it is written only after the
# whole block has succeeded. Matching hash means the same migrations already ran
# to completion against this database, so the block can be skipped wholesale.
# Anything else (first deploy, edited migration, a restored//swapped database
# with no deploy_state row) falls through to running them all, and `./update.sh
# --force-migrations` re-runs them on demand.
#
# Hashing the two files whole rather than just the migration region is a
# deliberate over-approximation: an unrelated edit to update.sh costs one slow
# deploy, whereas a missed edit would skip a migration that needed to run.
# ─────────────────────────────────────────────────────────────────────────────

# Creates the bookkeeping table. Safe to call on every run.
ensure_deploy_state_table() {
  $MYSQL -e "${MYSQL_LOCK_TIMEOUT_SQL}
    CREATE TABLE IF NOT EXISTS \`deploy_state\` (
      \`k\`          varchar(64)  NOT NULL,
      \`v\`          varchar(255) NOT NULL,
      \`updated_at\` timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`deploy_state_k\` PRIMARY KEY (\`k\`)
    );" &>/dev/null
}

# Reads a deploy_state value, printing empty when absent or unreadable.
deploy_state_get() { # deploy_state_get KEY
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT \`v\` FROM \`deploy_state\` WHERE \`k\`='$1';" 2>/dev/null \
    | tr -d '[:space:]'
}

# Writes a deploy_state value. Non-fatal: losing the bookkeeping costs a slow
# deploy next time, which is never a reason to fail an otherwise-good one.
deploy_state_set() { # deploy_state_set KEY VALUE
  $MYSQL -e "${MYSQL_LOCK_TIMEOUT_SQL}
    INSERT INTO \`deploy_state\` (\`k\`, \`v\`) VALUES ('$1', '$2')
    ON DUPLICATE KEY UPDATE \`v\` = VALUES(\`v\`);" &>/dev/null || true
}

# Hash of the files that define the migration set. Prints empty on failure,
# which callers must read as "run the migrations".
migrations_fingerprint() { # migrations_fingerprint FILE...
  local file
  for file in "$@"; do
    [ -r "$file" ] || return 0
  done
  if command -v sha256sum &>/dev/null; then
    cat "$@" | sha256sum | awk '{print $1}'
  else
    cat "$@" | shasum -a 256 | awk '{print $1}'
  fi
}
