#!/bin/bash
# update.sh — Kalakosh Zurich full update script
#
# Pulls latest code, applies all DB migrations (idempotent), runs an optional
# one-time English translation backfill, rebuilds the app, restarts Docker
# services, and prunes unused Docker resources.
#
# By default it deploys the branch currently checked out on this host. To pin a
# specific branch, set DEPLOY_BRANCH (in .env or the environment).
#
# Usage:
#   chmod +x update.sh
#   ./update.sh                      # deploy the checked-out branch
#   DEPLOY_BRANCH=main ./update.sh   # deploy a specific branch
#
# Safe to re-run at any time — every step is idempotent.

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

log()  { echo -e "\n${CYAN}==>${RESET} ${BOLD}$*${RESET}"; }
ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
die()  { echo -e "\n${RED}✗ FATAL:${RESET} $*\n"; exit 1; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
log "Pre-flight checks"

[ -f ".env" ]           || die ".env not found — copy .env.example and fill it in first."
docker info &>/dev/null  || die "Docker is not running."
command -v git &>/dev/null || die "git is not installed."

# A full disk stalls MySQL mid-write (it can't flush its binlog), which then
# looks exactly like a hung migration with no indication of the real cause —
# fail fast here with a clear message instead.
DISK_USE_PCT=$(df -P . | awk 'NR==2 { gsub("%", "", $5); print $5 }')
if [ "${DISK_USE_PCT:-0}" -ge 90 ] 2>/dev/null; then
  die "Disk is ${DISK_USE_PCT}% full — free space before continuing.
  Try:    docker builder prune -af && docker image prune -a -f
  Check:  docker system df"
fi

# Load .env. Parse it literally rather than `source`-ing it: sourcing executes
# every line as bash, so a value with a shell metacharacter — online (bot),
# p@ss(word), a backtick — breaks the run ("syntax error near unexpected token")
# or, worse, gets executed. See deploy/lib/env.sh.
# shellcheck source=deploy/lib/env.sh
source "deploy/lib/env.sh"
load_dotenv ".env"

: "${MYSQL_USER:?MYSQL_USER not set in .env}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD not set in .env}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE not set in .env}"

ok "environment loaded"

# ── Stripe payment configuration (optional, non-fatal) ────────────────────────
# Online checkout degrades gracefully to the WhatsApp enquiry flow when Stripe
# is not configured, so surface the current state rather than failing the run.
if [ -n "${STRIPE_SECRET_KEY:-}" ]; then
  ok "Stripe secret key detected — online checkout enabled"
  if [ -z "${STRIPE_WEBHOOK_SECRET:-}" ]; then
    warn "STRIPE_WEBHOOK_SECRET is not set — paid orders won't be confirmed and"
    warn "pieces won't be auto-marked as sold. Add a webhook pointing to"
    warn "/api/stripe/webhook in the Stripe Dashboard and set STRIPE_WEBHOOK_SECRET in .env."
  fi
  if [ -z "${PUBLIC_BASE_URL:-}" ]; then
    warn "PUBLIC_BASE_URL is not set — success/cancel redirects will fall back to the request origin."
  fi
else
  warn "STRIPE_SECRET_KEY not set — online checkout is disabled; customers use the WhatsApp enquiry flow."
fi

# ── Tenant secrets vault (optional, non-fatal) ────────────────────────────────
# Tenant-provided secrets are encrypted with this master key before touching
# the database. Without it the vault is disabled — flag it so a deployment
# that expects it doesn't silently run unconfigured.
if [ -n "${TENANT_SECRETS_KEY:-}" ]; then
  ok "TENANT_SECRETS_KEY detected — tenant secrets vault enabled"
else
  warn "TENANT_SECRETS_KEY is not set — the tenant secrets vault is disabled."
  warn "Generate one with: openssl rand -hex 32  (see .env.example)"
fi

# Shorthand to run SQL inside the running db container, plus the run_sql /
# col_exists / tbl_exists / idx_exists helpers used by the migrations below.
# See deploy/lib/db.sh for why the connection and every statement now have a
# timeout, and why failures print the actual MySQL error.
source "deploy/lib/db.sh"
MYSQL="$(build_mysql_cmd)"

# ── Git pull ──────────────────────────────────────────────────────────────────
# Deploy whatever branch is checked out on this server, not a hard-coded one —
# otherwise a host running a feature/release branch would silently keep pulling
# `main` and never see its own changes. Override explicitly with DEPLOY_BRANCH.
DEPLOY_BRANCH="${DEPLOY_BRANCH:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")}"
if [ -z "$DEPLOY_BRANCH" ] || [ "$DEPLOY_BRANCH" = "HEAD" ]; then
  die "Cannot determine which branch to deploy (detached HEAD?).
  Check out a branch, or set DEPLOY_BRANCH in .env / the environment, e.g.:
      DEPLOY_BRANCH=main ./update.sh"
fi

log "Pulling latest code (branch: ${DEPLOY_BRANCH})"

PREV_COMMIT=$(git rev-parse --short HEAD)
git fetch origin "$DEPLOY_BRANCH"
git pull origin "$DEPLOY_BRANCH"
NEW_COMMIT=$(git rev-parse --short HEAD)

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ]; then
  ok "already up to date (${NEW_COMMIT})"
else
  ok "${PREV_COMMIT} → ${NEW_COMMIT}  ($(git log -1 --pretty=%s))"
fi

# ── Wait for database ─────────────────────────────────────────────────────────
log "Waiting for database to be ready"

echo -n "  "
for i in $(seq 1 30); do
  if $MYSQL -e "SELECT 1" &>/dev/null 2>&1; then
    echo " ready"
    break
  fi
  echo -n "."
  sleep 2
  [ "$i" -lt 30 ] || die "Database not responding after 60 s. Is 'docker compose up -d db' running?"
done

# ── DB migrations (all idempotent) ────────────────────────────────────────────
log "Applying database migrations"

# ── 0000: users table ─────────────────────────────────────────────────────────
run_sql "0000 users table" "
  CREATE TABLE IF NOT EXISTS \`users\` (
    \`id\`           int AUTO_INCREMENT NOT NULL,
    \`openId\`       varchar(64) NOT NULL,
    \`name\`         text,
    \`email\`        varchar(320),
    \`loginMethod\`  varchar(64),
    \`role\`         enum('user','admin') NOT NULL DEFAULT 'user',
    \`createdAt\`    timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\`    timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    \`lastSignedIn\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`users_id\`       PRIMARY KEY(\`id\`),
    CONSTRAINT \`users_openId_unique\` UNIQUE(\`openId\`)
  );"

# ── 0001: products table ──────────────────────────────────────────────────────
run_sql "0001 products table" "
  CREATE TABLE IF NOT EXISTS \`products\` (
    \`id\`          int AUTO_INCREMENT NOT NULL,
    \`name\`        varchar(255) NOT NULL,
    \`description\` text NOT NULL,
    \`price\`       decimal(10,2) NOT NULL,
    \`category\`    enum('Silver','Semi-Precious Gems','Pearls') NOT NULL,
    \`imageKey\`    varchar(512),
    \`imageUrl\`    varchar(1024),
    \`visible\`     boolean NOT NULL DEFAULT true,
    \`source\`      enum('whatsapp','manual') NOT NULL DEFAULT 'manual',
    \`createdAt\`   timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\`   timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`products_id\` PRIMARY KEY(\`id\`)
  );"

# ── 0002: discordMessageId column + unique constraint ─────────────────────────
if [ "$(col_exists products discordMessageId)" = "0" ]; then
  run_sql "0002 add discordMessageId column" \
    "ALTER TABLE \`products\` ADD \`discordMessageId\` varchar(64);"
else
  ok "0002 discordMessageId column already exists"
fi

if [ "$(idx_exists products products_discordMessageId_unique)" = "0" ]; then
  run_sql "0002 add discordMessageId unique constraint" \
    "ALTER TABLE \`products\` ADD CONSTRAINT \`products_discordMessageId_unique\` UNIQUE(\`discordMessageId\`);"
else
  ok "0002 discordMessageId unique constraint already exists"
fi

# ── 0003: sold column ─────────────────────────────────────────────────────────
if [ "$(col_exists products sold)" = "0" ]; then
  run_sql "0003 add sold column" \
    "ALTER TABLE \`products\` ADD \`sold\` boolean NOT NULL DEFAULT false;"
else
  ok "0003 sold column already exists"
fi

# ── 0004: product_images table ────────────────────────────────────────────────
run_sql "0004 product_images table" "
  CREATE TABLE IF NOT EXISTS \`product_images\` (
    \`id\`        int AUTO_INCREMENT NOT NULL,
    \`productId\` int NOT NULL,
    \`imageKey\`  varchar(512) NOT NULL,
    \`imageUrl\`  varchar(1024) NOT NULL,
    \`sortOrder\` int NOT NULL DEFAULT 0,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`product_images_id\` PRIMARY KEY(\`id\`)
  );"

# ── 0005: instagram_posts table ───────────────────────────────────────────────
run_sql "0005 instagram_posts table" "
  CREATE TABLE IF NOT EXISTS \`instagram_posts\` (
    \`id\`        int AUTO_INCREMENT NOT NULL,
    \`postUrl\`   varchar(1024) NOT NULL,
    \`sortOrder\` int NOT NULL DEFAULT 0,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`instagram_posts_id\` PRIMARY KEY(\`id\`)
  );"

# ── 0006: bulk_upload_logs table ──────────────────────────────────────────────
run_sql "0006 bulk_upload_logs table" "
  CREATE TABLE IF NOT EXISTS \`bulk_upload_logs\` (
    \`id\`           int AUTO_INCREMENT NOT NULL,
    \`operation\`    enum('analyze','create','extra_image') NOT NULL,
    \`ref\`          varchar(512) NOT NULL,
    \`errorMessage\` text NOT NULL,
    \`createdAt\`    timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`bulk_upload_logs_id\` PRIMARY KEY(\`id\`)
  );"

# ── 0007: nameEn + descriptionEn columns (bilingual content) ──────────────────
if [ "$(col_exists products nameEn)" = "0" ]; then
  run_sql "0007 add nameEn column" \
    "ALTER TABLE \`products\` ADD \`nameEn\` varchar(255) NULL;"
else
  ok "0007 nameEn column already exists"
fi

if [ "$(col_exists products descriptionEn)" = "0" ]; then
  run_sql "0007 add descriptionEn column" \
    "ALTER TABLE \`products\` ADD \`descriptionEn\` text NULL;"
else
  ok "0007 descriptionEn column already exists"
fi

# ── 0008: orders table (Stripe checkout) ──────────────────────────────────────
run_sql "0008 orders table" "
  CREATE TABLE IF NOT EXISTS \`orders\` (
    \`id\`                    int AUTO_INCREMENT NOT NULL,
    \`stripeSessionId\`       varchar(255) NOT NULL,
    \`stripePaymentIntentId\` varchar(255),
    \`status\`                enum('pending','paid','failed','expired') NOT NULL DEFAULT 'pending',
    \`customerEmail\`         varchar(320),
    \`customerName\`          varchar(255),
    \`amountTotal\`           int NOT NULL,
    \`currency\`              varchar(10) NOT NULL DEFAULT 'chf',
    \`productIds\`            varchar(512) NOT NULL,
    \`paymentMethod\`         varchar(32),
    \`createdAt\`             timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\`             timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`orders_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`orders_stripeSessionId_unique\` UNIQUE(\`stripeSessionId\`)
  );"

# ── 0009: quantity column on products ─────────────────────────────────────────
if [ "$(col_exists products quantity)" = "0" ]; then
  run_sql "0009 add quantity column" \
    "ALTER TABLE \`products\` ADD \`quantity\` int NOT NULL DEFAULT 1;"
else
  ok "0009 quantity column already exists"
fi

# ── 0010: POS Terminal tables ─────────────────────────────────────────────────
run_sql "0010 pos_orders table" "
  CREATE TABLE IF NOT EXISTS \`pos_orders\` (
    \`id\`                    int AUTO_INCREMENT NOT NULL,
    \`stripePaymentIntentId\` varchar(255) NOT NULL,
    \`status\`                enum('pending','paid','failed') NOT NULL DEFAULT 'pending',
    \`totalRappen\`           int NOT NULL,
    \`createdAt\`             timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`pos_orders_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`pos_orders_stripePaymentIntentId_unique\` UNIQUE(\`stripePaymentIntentId\`)
  );"

run_sql "0010 pos_order_items table" "
  CREATE TABLE IF NOT EXISTS \`pos_order_items\` (
    \`id\`          int AUTO_INCREMENT NOT NULL,
    \`posOrderId\`  int NOT NULL,
    \`productId\`   int NOT NULL,
    \`priceRappen\` int NOT NULL,
    \`createdAt\`   timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`pos_order_items_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`fk_pos_order\` FOREIGN KEY (\`posOrderId\`) REFERENCES \`pos_orders\`(\`id\`)
  );"

# ── 0011: body-part product categories (replaces Silver/Semi-Precious Gems/Pearls) ──
# Check if the category column still has the old material-based enum.
# col_exists returns 1 even for the new schema, so inspect the column type instead.
CURRENT_CAT_ENUM=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='products' AND COLUMN_NAME='category';" 2>/dev/null || echo "")

if echo "$CURRENT_CAT_ENUM" | grep -q "'Silver'"; then
  # Step 1: expand enum to hold both old and new values simultaneously
  run_sql "0011 expand category enum" \
    "ALTER TABLE \`products\` MODIFY COLUMN \`category\` enum('Silver','Semi-Precious Gems','Pearls','Necklaces','Earrings','Rings','Bracelets','Bangles','Anklets','Brooches','Hair Accessories','Other') NOT NULL;"

  # Step 2: re-map using German/English name keywords; Anklets before Necklaces
  #         to prevent 'Knöchelkette' matching the 'kette' fragment in Necklaces.
  run_sql "0011 remap Earrings" \
    "UPDATE \`products\` SET \`category\`='Earrings'
     WHERE \`category\` IN ('Silver','Semi-Precious Gems','Pearls')
       AND (\`name\` REGEXP 'Ohrh[aä]nger|Ohrstecker|Ohrringe|Ohrring|Ohrclip|Ohrschmuck'
            OR \`nameEn\` REGEXP 'Earring|Stud|Hoop|Chandelier|Ear Cuff');"

  run_sql "0011 remap Anklets" \
    "UPDATE \`products\` SET \`category\`='Anklets'
     WHERE \`category\` IN ('Silver','Semi-Precious Gems','Pearls')
       AND (\`name\` REGEXP 'Fussband|Fu[sß]band|Kn[oö]chelkette|Payal'
            OR \`nameEn\` REGEXP 'Anklet|Ankle Chain');"

  run_sql "0011 remap Necklaces" \
    "UPDATE \`products\` SET \`category\`='Necklaces'
     WHERE \`category\` IN ('Silver','Semi-Precious Gems','Pearls')
       AND (\`name\` REGEXP 'Halskette|Kollier|Kette|Anh[aä]nger|Choker'
            OR \`nameEn\` REGEXP 'Necklace|Pendant|Choker|Collar|Lariat');"

  run_sql "0011 remap Bangles" \
    "UPDATE \`products\` SET \`category\`='Bangles'
     WHERE \`category\` IN ('Silver','Semi-Precious Gems','Pearls')
       AND (\`name\` REGEXP 'Armreif|Armring'
            OR \`nameEn\` REGEXP 'Bangle');"

  run_sql "0011 remap Bracelets" \
    "UPDATE \`products\` SET \`category\`='Bracelets'
     WHERE \`category\` IN ('Silver','Semi-Precious Gems','Pearls')
       AND (\`name\` REGEXP 'Armband'
            OR \`nameEn\` REGEXP 'Bracelet|Cuff');"

  run_sql "0011 remap Rings" \
    "UPDATE \`products\` SET \`category\`='Rings'
     WHERE \`category\` IN ('Silver','Semi-Precious Gems','Pearls')
       AND (\`name\` REGEXP 'Fingerring|\\bRing\\b'
            OR \`nameEn\` REGEXP '\\bRing\\b');"

  run_sql "0011 remap Brooches" \
    "UPDATE \`products\` SET \`category\`='Brooches'
     WHERE \`category\` IN ('Silver','Semi-Precious Gems','Pearls')
       AND (\`name\` REGEXP 'Brosche|Anstecknadel'
            OR \`nameEn\` REGEXP 'Brooch|Lapel Pin');"

  run_sql "0011 remap Hair Accessories" \
    "UPDATE \`products\` SET \`category\`='Hair Accessories'
     WHERE \`category\` IN ('Silver','Semi-Precious Gems','Pearls')
       AND (\`name\` REGEXP 'Haarnadel|Haarschmuck|Haarspange|Haar|Tikka|Tiara'
            OR \`nameEn\` REGEXP 'Hair Pin|Hair Comb|Tikka|Tiara|Maang|Juda');"

  run_sql "0011 remap Other (fallback)" \
    "UPDATE \`products\` SET \`category\`='Other'
     WHERE \`category\` IN ('Silver','Semi-Precious Gems','Pearls');"

  # Step 3: drop the old values, leaving only body-part categories
  run_sql "0011 finalize category enum" \
    "ALTER TABLE \`products\` MODIFY COLUMN \`category\` enum('Necklaces','Earrings','Rings','Bracelets','Bangles','Anklets','Brooches','Hair Accessories','Other') NOT NULL;"
else
  ok "0011 body-part categories already applied"
fi

# ── 0012: returns table ────────────────────────────────────────────────────────
run_sql "0012 returns table" "
  CREATE TABLE IF NOT EXISTS \`returns\` (
    \`id\`             int AUTO_INCREMENT NOT NULL,
    \`orderId\`        int NOT NULL,
    \`productIds\`     varchar(512) NOT NULL,
    \`status\`         enum('requested','received','refunded','rejected') NOT NULL DEFAULT 'requested',
    \`requestedAt\`    timestamp NOT NULL DEFAULT (now()),
    \`receivedAt\`     timestamp,
    \`refundedAt\`     timestamp,
    \`stripeRefundId\` varchar(255),
    \`notes\`          text,
    \`createdAt\`      timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\`      timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`returns_id\` PRIMARY KEY(\`id\`)
  );"

# ── 0013: Sets category (necklace+earring combo pieces) ──────────────────────
CURRENT_CAT_ENUM_SETS=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='products' AND COLUMN_NAME='category';" 2>/dev/null || echo "")

if echo "$CURRENT_CAT_ENUM_SETS" | grep -q "'Sets'"; then
  ok "0013 Sets category already applied"
else
  run_sql "0013 add Sets category" \
    "ALTER TABLE \`products\` MODIFY COLUMN \`category\` enum('Necklaces','Earrings','Sets','Rings','Bracelets','Bangles','Anklets','Brooches','Hair Accessories','Other') NOT NULL;"
fi

# ── 0014: stripe_reconciliations table ────────────────────────────────────────
run_sql "0014 stripe_reconciliations table" "
  CREATE TABLE IF NOT EXISTS \`stripe_reconciliations\` (
    \`id\`                    int AUTO_INCREMENT NOT NULL,
    \`stripePaymentIntentId\` varchar(255) NOT NULL,
    \`amountRappen\`          int NOT NULL,
    \`currency\`              varchar(10) NOT NULL DEFAULT 'chf',
    \`stripeCreatedAt\`       timestamp NOT NULL,
    \`description\`           text,
    \`paymentMethodType\`     varchar(32),
    \`status\`                enum('pending_review','confirmed','rejected','no_candidates') NOT NULL DEFAULT 'pending_review',
    \`candidateProductIds\`   varchar(512) NOT NULL,
    \`chosenProductId\`       int,
    \`confirmationToken\`     varchar(128) NOT NULL,
    \`resolvedAt\`            timestamp,
    \`createdAt\`             timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\`             timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`stripe_reconciliations_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`stripe_reconciliations_stripePaymentIntentId_unique\` UNIQUE(\`stripePaymentIntentId\`),
    CONSTRAINT \`stripe_reconciliations_confirmationToken_unique\` UNIQUE(\`confirmationToken\`)
  );"

# ── 0015: pos_order_items custom line items (nullable productId + name) ──────
POS_ITEM_PRODUCT_ID_NULLABLE=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='pos_order_items' AND COLUMN_NAME='productId';" 2>/dev/null || echo "")

if [ "$POS_ITEM_PRODUCT_ID_NULLABLE" != "YES" ]; then
  run_sql "0015 make pos_order_items.productId nullable" \
    "ALTER TABLE \`pos_order_items\` MODIFY COLUMN \`productId\` int;"
else
  ok "0015 pos_order_items.productId already nullable"
fi

if [ "$(col_exists pos_order_items name)" = "0" ]; then
  run_sql "0015 add pos_order_items.name column" \
    "ALTER TABLE \`pos_order_items\` ADD \`name\` varchar(255);"
else
  ok "0015 pos_order_items.name column already exists"
fi

# ── 0016: pos_orders payment method (card / cash / twint) ────────────────────
# Cash sales have no Stripe PaymentIntent, so stripePaymentIntentId must be
# nullable before paymentMethod can distinguish cash from card/TWINT.
POS_ORDER_PI_NULLABLE=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT IS_NULLABLE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='pos_orders' AND COLUMN_NAME='stripePaymentIntentId';" 2>/dev/null || echo "")

if [ "$POS_ORDER_PI_NULLABLE" != "YES" ]; then
  run_sql "0016 make pos_orders.stripePaymentIntentId nullable" \
    "ALTER TABLE \`pos_orders\` MODIFY COLUMN \`stripePaymentIntentId\` varchar(255);"
else
  ok "0016 pos_orders.stripePaymentIntentId already nullable"
fi

if [ "$(col_exists pos_orders paymentMethod)" = "0" ]; then
  run_sql "0016 add pos_orders.paymentMethod column" \
    "ALTER TABLE \`pos_orders\` ADD \`paymentMethod\` enum('card','cash','twint') DEFAULT 'card' NOT NULL;"
else
  ok "0016 pos_orders.paymentMethod column already exists"
fi

# ── 0017: pos_orders invoice + customer fields ────────────────────────────────
# Added by feat/pos-invoices: sequential invoice number, customer contact
# fields for receipts, and a URL to the saved receipt HTML on S3.
if [ "$(col_exists pos_orders invoiceNumber)" = "0" ]; then
  run_sql "0017 add pos_orders.invoiceNumber column" \
    "ALTER TABLE \`pos_orders\` ADD \`invoiceNumber\` varchar(32) UNIQUE;"
else
  ok "0017 pos_orders.invoiceNumber column already exists"
fi
if [ "$(col_exists pos_orders customerName)" = "0" ]; then
  run_sql "0017 add pos_orders.customerName column" \
    "ALTER TABLE \`pos_orders\` ADD \`customerName\` varchar(255);"
else
  ok "0017 pos_orders.customerName column already exists"
fi
if [ "$(col_exists pos_orders customerEmail)" = "0" ]; then
  run_sql "0017 add pos_orders.customerEmail column" \
    "ALTER TABLE \`pos_orders\` ADD \`customerEmail\` varchar(320);"
else
  ok "0017 pos_orders.customerEmail column already exists"
fi
if [ "$(col_exists pos_orders customerPhone)" = "0" ]; then
  run_sql "0017 add pos_orders.customerPhone column" \
    "ALTER TABLE \`pos_orders\` ADD \`customerPhone\` varchar(32);"
else
  ok "0017 pos_orders.customerPhone column already exists"
fi
if [ "$(col_exists pos_orders receiptUrl)" = "0" ]; then
  run_sql "0017 add pos_orders.receiptUrl column" \
    "ALTER TABLE \`pos_orders\` ADD \`receiptUrl\` varchar(512);"
else
  ok "0017 pos_orders.receiptUrl column already exists"
fi

# ── 0018: bulk_upload_logs.operation adds 'upsert_images' value ───────────────
# The bulk image-upsert flow logs an 'upsert_images' operation on failure; the
# enum predated that value. Idempotent: only widen the enum if it's missing.
CURRENT_BULK_OP_ENUM=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='bulk_upload_logs' AND COLUMN_NAME='operation';" 2>/dev/null || echo "")

if echo "$CURRENT_BULK_OP_ENUM" | grep -q "'upsert_images'"; then
  ok "0018 bulk_upload_logs.operation already has 'upsert_images'"
else
  run_sql "0018 add 'upsert_images' to bulk_upload_logs.operation" \
    "ALTER TABLE \`bulk_upload_logs\` MODIFY COLUMN \`operation\` enum('analyze','create','extra_image','upsert_images') NOT NULL;"
fi

# ── 0019: multi-tenant foundation ─────────────────────────────────────────────
# Creates the tenant tables, seeds tenant #1, and adds tenant_id to every
# tenant-scoped table. Idempotent; see migrate_0019_multitenant in deploy/lib/db.sh
# (kept there so it can be exercised by deploy/lib/db.test.sh without a live DB).
migrate_0019_multitenant

# ── 0020: Stripe Connect for tenant storefronts ───────────────────────────────
# Adds tenants.stripe_connected_account_id. Idempotent; see
# migrate_0020_stripe_connect in deploy/lib/db.sh.
migrate_0020_stripe_connect

# ── 0021: POS <-> online inventory sync (checkout holds) ─────────────────────
# Adds products.reserved_until / products.reserved_token. Idempotent; see
# migrate_0021_product_reservations in deploy/lib/db.sh.
migrate_0021_product_reservations

# ── 0022: POS attribution for amount-only in-person sales ────────────────────
# Creates pos_attributions (end-of-day "which piece was that CHF 50 sale?"
# review queue). Idempotent; see migrate_0022_pos_attributions in deploy/lib/db.sh.
migrate_0022_pos_attributions

# ── 0023: tenant signup schema drift fix ──────────────────────────────────────
# Brings tenants.plan to the current plan ids (free/maker/studio/atelier —
# 0019 created it with the retired starter/growth/enterprise names, which made
# every self-serve signup insert fail) and adds tenants.terminal_location_id
# (Stripe Terminal Location for Tap to Pay; previously only in the non-
# authoritative drizzle/*.sql path). Idempotent; see
# migrate_0023_tenant_signup_fix in deploy/lib/db.sh.
migrate_0023_tenant_signup_fix

# ── 0024: staff invites + photo credit ledger ────────────────────────────────
# Creates staff_invites and photo_credit_ledger — both in drizzle/schema.ts
# (team-seat invites, AI photo metering) but missing from update.sh, so any
# invite/credit write would have failed on a live DB. Idempotent; see
# migrate_0024_staff_invites_and_photo_credits in deploy/lib/db.sh.
migrate_0024_staff_invites_and_photo_credits

# ── 0025: tenant secrets vault + per-tenant Discord DM recipient ─────────────
# Creates tenant_secrets (encrypted vault for tenant-provided credentials) and
# adds tenant_settings.discord_owner_user_id. DDL only — hashing the existing
# plaintext tenants.pos_api_key values is the one-shot data step in the
# temporary scripts/migrate-tenant-secrets.mjs helper; run it once per
# deployment right after this migration, then delete the helper. Idempotent;
# see migrate_0025_tenant_secrets in deploy/lib/db.sh.
migrate_0025_tenant_secrets

# ── Shared helper: run a script inside the builder container ──────────────────
# Usage: run_in_builder <tag> <script-path> [extra docker args...]
run_in_builder() {
  local tag="$1"; local script="$2"; shift 2

  # Build the 'builder' Docker stage — it has pnpm + tsx + all dev dependencies
  echo "  Building runner image…"
  docker build --target builder --tag "${tag}" . --quiet 2>&1 | sed 's/^/    /'

  # Discover the compose internal network so the runner can reach the db service
  local network
  DB_CONTAINER=$(docker compose ps -q db 2>/dev/null || true)
  if [ -n "${DB_CONTAINER}" ]; then
    network=$(docker inspect "${DB_CONTAINER}" \
      --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}' \
      2>/dev/null | awk '{print $1}')
  else
    local project
    project=$(docker compose config 2>/dev/null \
      | awk '/^name:/{print $2}' | tr '[:upper:]' '[:lower:]' \
      || basename "$(pwd)" | tr '[:upper:]' '[:lower:]')
    network="${project}_internal"
  fi
  ok "Docker network: ${network}"

  # Give the throwaway runner a stable name and guarantee it is torn down even
  # if this script is interrupted (Ctrl-C) or the runner is killed mid-run.
  # Relying on `--rm` alone is not enough: on a signal the cleanup can be
  # skipped, leaving an orphaned container attached to "${network}". Because
  # that container is not managed by compose, a later `docker compose down`
  # then fails with "Network ${network} Resource is still in use". A fixed
  # --name plus a trap (mirroring deploy/dry-run-migration.sh) makes cleanup
  # reliable regardless of how we exit.
  local runner_name="kalakosh-runner-$$"
  docker rm -f "${runner_name}" &>/dev/null || true
  trap "docker rm -f '${runner_name}' &>/dev/null || true" INT TERM EXIT

  docker run --rm \
    --name "${runner_name}" \
    --network "${network}" \
    --env-file .env \
    --env "DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE}" \
    "$@" \
    "${tag}" \
    pnpm tsx "${script}"

  # Normal completion: remove the runner and drop the trap so it does not fire
  # again (or clobber cleanup for a subsequent run_in_builder call).
  docker rm -f "${runner_name}" &>/dev/null || true
  trap - INT TERM EXIT

  docker rmi "${tag}" --force &>/dev/null || true
}

# ── One-time backfill: English translations ───────────────────────────────────
log "Checking for products missing English translations"

NEEDS_BACKFILL=$($MYSQL -se \
  "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM \`products\` WHERE \`nameEn\` IS NULL OR \`descriptionEn\` IS NULL;" \
  2>/dev/null || echo "0")
NEEDS_BACKFILL=$(echo "$NEEDS_BACKFILL" | tr -d '[:space:]')

if [ "${NEEDS_BACKFILL}" -gt "0" ]; then
  warn "${NEEDS_BACKFILL} product(s) are missing English translations."

  if [ -n "${LLM_API_KEY:-}" ]; then
    log "Running English translation backfill (${NEEDS_BACKFILL} product(s))"
    run_in_builder kalakosh-backfill:latest scripts/backfill-translations.ts
    ok "backfill complete"
  else
    warn "LLM_API_KEY is not set in .env — skipping auto-backfill."
    warn "To run manually: LLM_API_KEY=... ./update.sh  (or set it in .env)"
  fi
else
  ok "all products already have English translations"
fi

# ── Check for products accidentally uploaded in English ───────────────────────
log "Checking for products accidentally in English"

# Heuristic: English jewellery words that should never appear in German names
EN_COUNT=$($MYSQL -se "
  ${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM \`products\`
  WHERE LOWER(\`name\`) REGEXP
    'earring|necklace|bracelet|pendant|brooch|bangle|choker|anklet|stud|cuff|ring |pearl |silver |gold |crystal'
  AND \`name\` NOT REGEXP '[äöüÄÖÜ]';
" 2>/dev/null || echo "0")
EN_COUNT=$(echo "$EN_COUNT" | tr -d '[:space:]')

if [ "${EN_COUNT}" -gt "0" ]; then
  warn "${EN_COUNT} product(s) appear to have English names in the German field."
  warn "Run the language-fix script to detect and correct them:"
  warn ""
  warn "  Preview (no changes):  ./scripts/fix-language-errors.ts --dry-run  (see below)"
  warn "  Apply fixes:           see below"
  warn ""
  warn "  # If running locally with pnpm:"
  warn "  DATABASE_URL=... LLM_API_KEY=... pnpm tsx scripts/fix-language-errors.ts --dry-run"
  warn "  DATABASE_URL=... LLM_API_KEY=... pnpm tsx scripts/fix-language-errors.ts"
  warn ""
  warn "  # If running via Docker (no local pnpm):"
  warn "  ./update.sh --fix-language"
  warn ""

  # Auto-run if --fix-language flag is passed
  if [[ " $* " == *" --fix-language "* ]] || [[ "${1:-}" == "--fix-language" ]]; then
    if [ -n "${LLM_API_KEY:-}" ]; then
      log "Running language-error fix (--fix-language flag set)"
      run_in_builder kalakosh-langfix:latest scripts/fix-language-errors.ts
      ok "language fix complete"
    else
      warn "LLM_API_KEY not set — cannot run fix. Add it to .env and re-run."
    fi
  fi
else
  ok "no English-language products detected in German fields"
fi

# ── Rebuild app container ─────────────────────────────────────────────────────
log "Rebuilding app container (no cache)"
docker compose build --no-cache app

# ── Restart all services ──────────────────────────────────────────────────────
log "Restarting services"
docker compose up -d

# ── Health check ──────────────────────────────────────────────────────────────
log "Waiting for app to come up"

echo -n "  "
for i in $(seq 1 30); do
  APP_STATE=$(docker compose ps --format json 2>/dev/null \
    | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        d = json.loads(line)
        if d.get('Service') == 'app':
            print(d.get('Health') or d.get('State', ''))
            break
    except Exception:
        pass
" 2>/dev/null || echo "")

  if echo "$APP_STATE" | grep -qiE "healthy|running"; then
    echo " up"
    break
  fi
  echo -n "."
  sleep 2
  [ "$i" -lt 30 ] || warn "App may still be starting — check 'docker compose logs -f app'"
done

# ── Verify the freshly-built frontend actually shipped ────────────────────────
# The marketing/storefront frontend is compiled into dist/public at image-build
# time and served as static files in production, so a `git pull` alone never
# changes what users see — only a rebuilt image does. A deploy can still report
# "healthy" while serving a stale bundle (e.g. the image wasn't rebuilt), which
# is exactly the "I pulled but still see the old skin" failure mode. Surface the
# hashed asset baked into the *running* container so that's visible, not silent.
# Read-only and non-fatal: never fail an otherwise-good deploy over this check.
log "Verifying deployed frontend build"

SERVED_ASSET=$(docker compose exec -T app sh -c \
  "grep -o 'assets/index-[^\"]*\.js' dist/public/index.html | head -1" 2>/dev/null \
  | tr -d '[:space:]' || echo "")

if [ -n "$SERVED_ASSET" ]; then
  ok "running container serves frontend bundle: ${SERVED_ASSET}"
  warn "Vite hashes this filename per build, so it changes whenever the frontend"
  warn "actually rebuilt. If it's unchanged after a code update, the image didn't"
  warn "rebuild. If the browser still shows the old skin, hard-refresh (Ctrl-Shift-R)"
  warn "to drop the cached HTML shell."
else
  warn "Could not read the served frontend bundle from the app container."
  warn "Check:  docker compose exec app ls dist/public/assets"
fi

# ── Prune unused Docker resources ─────────────────────────────────────────────
# All three of these previously only removed dangling/never-used resources,
# so tagged-but-unused images (old builder-stage images, the one-off
# backfill/langfix runner images, aws-cli pulled by backups) and build cache
# accumulated forever across rebuilds — 19GB+ of build cache and 18GB of
# images on a single-app 4GB droplet, which silently filled the disk and
# stalled MySQL mid-write (it could no longer write its binlog, so every
# write — including migrations — hung until space was freed). Run with -a
# now that we're past the rebuild/restart above, so nothing currently in use
# gets touched.
log "Pruning unused Docker resources"

# Stopped containers
PRUNED_CONTAINERS=$(docker container prune -f --format "{{.SpaceReclaimed}}" 2>/dev/null || true)
ok "containers pruned${PRUNED_CONTAINERS:+ (freed ${PRUNED_CONTAINERS})}"

# All unused images, not just dangling ones
PRUNED_IMAGES=$(docker image prune -a -f --format "{{.SpaceReclaimed}}" 2>/dev/null || true)
ok "unused images pruned${PRUNED_IMAGES:+ (freed ${PRUNED_IMAGES})}"

# Build cache (grows without bound across rebuilds otherwise)
BUILDER_PRUNE_OUTPUT=$(docker builder prune -a -f 2>&1 || true)
PRUNED_CACHE=$(printf '%s\n' "$BUILDER_PRUNE_OUTPUT" | awk -F': *' '/^Total:/{print $2}' | tail -1)
ok "build cache pruned${PRUNED_CACHE:+ (freed ${PRUNED_CACHE})}"

# Unused networks (never connected to any container)
docker network prune -f &>/dev/null || true
ok "unused networks pruned"

# NOTE: volumes are intentionally NOT pruned — they contain the database.
#       To reclaim volume space manually: docker volume prune -f
#       WARNING: that will wipe all database data if the db container is stopped.

# ── Weekly backup cron job ────────────────────────────────────────────────────
log "Installing weekly backup cron job"

PROJECT_DIR="$(realpath .)"
CRON_ENTRY="0 2 * * 0 cd ${PROJECT_DIR} && ./deploy/backup.sh >> ${PROJECT_DIR}/backups/backup.log 2>&1"

if crontab -l 2>/dev/null | grep -qF "deploy/backup.sh"; then
  ok "cron job already installed (runs every Sunday at 02:00)"
else
  (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
  ok "cron job installed — every Sunday at 02:00"
  ok "log: ${PROJECT_DIR}/backups/backup.log"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  Update complete!${RESET}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  Branch   ${DEPLOY_BRANCH}"
echo -e "  Commit   $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"
echo -e "  Date     $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo -e "  Backup   every Sunday 02:00 → ${PROJECT_DIR}/backups/"
echo ""
docker compose ps
echo ""
echo -e "  ${CYAN}Logs:${RESET}   docker compose logs -f app"
echo -e "  ${CYAN}Shell:${RESET}  docker compose exec app sh"
echo -e "  ${CYAN}Backup:${RESET} ./deploy/backup.sh"
echo ""
