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
#
# ── Fast path ─────────────────────────────────────────────────────────────────
# The two expensive steps skip themselves when the change doesn't need them:
#
#   image rebuild — skipped when the running app container was already built
#                   from exactly this source (a fingerprint of the build context
#                   is baked into the image as a label; see deploy/lib/build.sh)
#   migrations    — skipped when this exact migration set already ran to
#                   completion against this database (deploy_state table; see
#                   deploy/lib/db.sh)
#
# Both fail towards doing the work: anything unproven — no running container, an
# unlabelled image, a dirty worktree, an edited .env, a restored database —
# rebuilds and re-migrates. Docker layer caching now does the rest, so even a
# real rebuild reuses the dependency install unless the lockfile moved.
#
# Options:
#   --full               do everything the old way: cold rebuild (--no-cache),
#                        re-run all migrations, aggressive prune
#   --rebuild            force the image rebuild (layer cache still used)
#   --no-cache           force a cold rebuild, ignoring the layer cache
#   --force-migrations   re-run every migration even if already recorded
#   --skip-build         never build; deploy whatever image is present
#   --prune              force the aggressive prune (images + build cache)
#   --fix-language       run the English-name repair script (needs LLM_API_KEY)
#
# Every option is also settable as an environment variable, e.g.
# FORCE_REBUILD=1 ./update.sh.

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

# Wall-clock for the summary, so "is this deploy actually faster?" is a fact on
# screen rather than a feeling.
DEPLOY_STARTED_AT=$SECONDS
fmt_duration() { # fmt_duration SECONDS
  local s=$1
  if [ "$s" -ge 60 ]; then printf '%dm %02ds' $((s / 60)) $((s % 60)); else printf '%ds' "$s"; fi
}

# ── Options ───────────────────────────────────────────────────────────────────
# Each one also reads its environment variable, so FORCE_REBUILD=1 ./update.sh
# and ./update.sh --rebuild are the same request.
FORCE_REBUILD="${FORCE_REBUILD:-0}"
FORCE_MIGRATIONS="${FORCE_MIGRATIONS:-0}"
NO_CACHE="${NO_CACHE:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
FULL_PRUNE="${FULL_PRUNE:-0}"

for arg in "$@"; do
  case "$arg" in
    --full)             FORCE_REBUILD=1; FORCE_MIGRATIONS=1; NO_CACHE=1; FULL_PRUNE=1 ;;
    --rebuild)          FORCE_REBUILD=1 ;;
    --no-cache)         FORCE_REBUILD=1; NO_CACHE=1 ;;
    --force-migrations) FORCE_MIGRATIONS=1 ;;
    --skip-build)       SKIP_BUILD=1 ;;
    --prune)            FULL_PRUNE=1 ;;
    --fix-language)     ;;  # handled further down, after the English-name check
    # Print the header comment block verbatim — it is the documentation, so
    # --help cannot drift from it. Stops at the first non-comment line rather
    # than a hard-coded line number, which would silently truncate as the
    # header grows.
    -h|--help)
      awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0"
      exit 0 ;;
    *) die "Unknown option: ${arg}
  Run  ./update.sh --help  for the supported options." ;;
  esac
done

if [ "$SKIP_BUILD" = "1" ] && [ "$FORCE_REBUILD" = "1" ]; then
  die "--skip-build and --rebuild/--no-cache/--full contradict each other."
fi

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

# Caddy config reload. `docker compose up -d` cannot notice a changed Caddyfile
# (it is a bind mount, so the service definition is identical), and Caddy only
# reads it at startup — see deploy/lib/caddy.sh.
# shellcheck source=deploy/lib/caddy.sh
source "deploy/lib/caddy.sh"

# Source fingerprinting, so an unchanged tree can skip the image rebuild
# entirely instead of paying for a cold build on every deploy.
# shellcheck source=deploy/lib/build.sh
source "deploy/lib/build.sh"
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
# Idempotent is not free: the full set below is ~90 `docker compose exec db
# mysql` round trips, almost all of them existence checks that answer "already
# applied". Record the migration set's fingerprint once it has all succeeded,
# and skip the block wholesale when it is unchanged. See the deploy_state
# helpers in deploy/lib/db.sh for why the fingerprint is the whole of update.sh
# + db.sh, and why every uncertain case falls through to running them.
ensure_deploy_state_table
MIGRATIONS_FP="$(migrations_fingerprint update.sh deploy/lib/db.sh)"
MIGRATIONS_APPLIED_FP="$(deploy_state_get schema_fingerprint)"
MIGRATIONS_RAN=0

if [ "$FORCE_MIGRATIONS" != "1" ] && [ -n "$MIGRATIONS_FP" ] && [ "$MIGRATIONS_APPLIED_FP" = "$MIGRATIONS_FP" ]; then
  log "Database migrations"
  ok "schema already at ${MIGRATIONS_FP:0:12} — skipping (--force-migrations to re-run)"
else
  MIGRATIONS_RAN=1
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

# Skip when 'Sets' is already present AND when the column is no longer an
# enum at all — 0035 converts it to varchar for per-tenant categories, and
# re-applying this enum on a varchar column would truncate custom categories.
if echo "$CURRENT_CAT_ENUM_SETS" | grep -q "'Sets'" || ! echo "$CURRENT_CAT_ENUM_SETS" | grep -q "^enum"; then
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

# ── 0026: per-tenant storage ledger ──────────────────────────────────────────
# Creates storage_objects so the "5 GB / 50 GB photo storage" on the plan cards
# is actually enforced — until now nothing was, and a free tenant could upload
# without bound. Idempotent; see migrate_0026_storage_objects in
# deploy/lib/db.sh.
migrate_0026_storage_objects

# ── 0027: two-tier pricing pivot (free/pro) + order channel/fee columns ──────
# Ships drizzle/0008_two_tier_pricing.sql, which update.sh never picked up —
# checkout.ts and billing.ts have referenced these columns since the pivot
# shipped. Idempotent; see migrate_0027_two_tier_pricing in deploy/lib/db.sh.
migrate_0027_two_tier_pricing

# ── 0028: Italian product locale (nameIt / descriptionIt) ────────────────────
# Ships drizzle/0009_product_locale_it.sql, also missing from this path.
if [ "$(col_exists products nameIt)" = "0" ]; then
  run_sql "0028 add products.nameIt" \
    "ALTER TABLE \`products\` ADD \`nameIt\` varchar(255) NULL;"
else
  ok "0028 products.nameIt already exists"
fi

if [ "$(col_exists products descriptionIt)" = "0" ]; then
  run_sql "0028 add products.descriptionIt" \
    "ALTER TABLE \`products\` ADD \`descriptionIt\` text NULL;"
else
  ok "0028 products.descriptionIt already exists"
fi

# ── 0029: shared rate-limit store ─────────────────────────────────────────────
# Ships drizzle/0011_rate_limit_windows.sql. Moves server/rateLimit.ts off an
# in-process Map (reset on every deploy, siloed per instance) onto a shared
# table, so the checkout rate limit actually holds across instances.
if [ "$(tbl_exists rate_limit_windows)" = "0" ]; then
  run_sql "0029 rate_limit_windows table" "
    CREATE TABLE IF NOT EXISTS \`rate_limit_windows\` (
      \`id\`         int AUTO_INCREMENT NOT NULL,
      \`limit_key\`  varchar(255) NOT NULL,
      \`count\`      int NOT NULL,
      \`reset_at\`   bigint NOT NULL,
      CONSTRAINT \`rate_limit_windows_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`rate_limit_windows_limit_key_unique\` UNIQUE(\`limit_key\`)
    );"
else
  ok "0029 rate_limit_windows already exists"
fi

# ── 0030: drop tenants.plan_price_override ────────────────────────────────────
# Ships drizzle/0012_drop_plan_price_override.sql. The grandfathering machinery
# it fed is gone (server/billing.ts) — it recorded what a pre-pivot paid tenant
# actually billed, for a population that never existed. Idempotent.
if [ "$(col_exists tenants plan_price_override)" = "1" ]; then
  run_sql "0030 drop tenants.plan_price_override" \
    "ALTER TABLE \`tenants\` DROP COLUMN \`plan_price_override\`;"
else
  ok "0030 tenants.plan_price_override already dropped"
fi

# ── 0031: TWINT QR-sticker POS rail ───────────────────────────────────────────
# Ships drizzle/0013_twint_qr_sticker.sql. Adds the merchant's uploaded TWINT QR
# sticker and a `twint_qr` payment method kept distinct from Stripe's `twint` —
# gateway-confirmed vs merchant-attested. See
# docs/planning/native-twint-integration.md §4b. Idempotent.
CURRENT_POS_METHOD_ENUM=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='pos_orders' AND COLUMN_NAME='paymentMethod';" 2>/dev/null || echo "")

if echo "$CURRENT_POS_METHOD_ENUM" | grep -q "'twint_qr'"; then
  ok "0031 pos_orders.paymentMethod already has 'twint_qr'"
else
  run_sql "0031 add 'twint_qr' to pos_orders.paymentMethod" \
    "ALTER TABLE \`pos_orders\` MODIFY COLUMN \`paymentMethod\` enum('card','cash','twint','twint_qr') NOT NULL DEFAULT 'card';"
fi

if [ "$(col_exists tenant_settings twint_qr_url)" = "0" ]; then
  run_sql "0031 add tenant_settings.twint_qr_url" \
    "ALTER TABLE \`tenant_settings\` ADD \`twint_qr_url\` varchar(1024) NULL;"
else
  ok "0031 tenant_settings.twint_qr_url already exists"
fi

# ── 0032: users.role enum — the four roles the app actually uses ──────────────
# The baseline shipped enum('user','admin') and NOTHING ever widened it, while
# drizzle/schema.ts has declared enum('superadmin','admin','staff','customer')
# with DEFAULT 'customer' for as long as multi-tenancy has existed. Every write
# of a value outside the live pair fails with
#   ERROR 1265 Data truncated for column 'role'
# which silently broke, in production:
#   - staff invites      (db.ts claimStaffInvite sets role='staff')
#   - platform ownership (deploy/tenant-admin.sh --superadmin)
# Signup survived only because it never names a role and takes the column
# default.
#
# Widen → migrate data → narrow, the same shape as 0004/0008 for tenants.plan.
# The transitional enum is the UNION of both, so this is safe from either
# starting point and safe to re-run.
CURRENT_ROLE_ENUM=$($MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COLUMN_TYPE FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='users' AND COLUMN_NAME='role';" 2>/dev/null || echo "")

if echo "$CURRENT_ROLE_ENUM" | grep -q "'superadmin'" && ! echo "$CURRENT_ROLE_ENUM" | grep -q "'user'"; then
  ok "0032 users.role already has the four app roles"
else
  run_sql "0032 widen users.role to the union of old and new" \
    "ALTER TABLE \`users\` MODIFY COLUMN \`role\` enum('user','admin','superadmin','staff','customer') NOT NULL DEFAULT 'customer';"

  # 'user' was the baseline's name for an ordinary shopper — 'customer' now.
  run_sql "0032 map legacy 'user' role to 'customer'" \
    "UPDATE \`users\` SET \`role\`='customer' WHERE \`role\`='user';"

  run_sql "0032 narrow users.role to the four app roles" \
    "ALTER TABLE \`users\` MODIFY COLUMN \`role\` enum('superadmin','admin','staff','customer') NOT NULL DEFAULT 'customer';"
fi

# ── 0033: German + French product locales ────────────────────────────────────
# Ships drizzle/0007_product_locales.sql. Only its Italian follow-up was ever
# ported (0028 above), so products had EN and IT columns but no DE/FR — and
# every storefront product query, which selects all of them from
# drizzle/schema.ts, died with "Unknown column 'nameDe' in 'field list'".
# Idempotent; see migrate_0033_product_locales_de_fr in deploy/lib/db.sh.
migrate_0033_product_locales_de_fr

# ── 0034: magic-link login tokens ────────────────────────────────────────────
# Ships drizzle/0014_magic_link_tokens.sql, missing from this path too — so
# server/db.ts's passwordless sign-in wrote to a table that did not exist.
# Idempotent; see migrate_0034_magic_link_tokens in deploy/lib/db.sh.
migrate_0034_magic_link_tokens

# ── 0035: storefront templates ────────────────────────────────────────────────
# Ships drizzle/0016_store_templates.sql. The signup wizard's template choice
# (shared/templates.ts) — surfaces half of the storefront palette. NULL keeps
# the pre-template default look, so existing stores are untouched. Idempotent.
if [ "$(col_exists tenant_settings template_id)" = "0" ]; then
  run_sql "0035 add tenant_settings.template_id" \
    "ALTER TABLE \`tenant_settings\` ADD \`template_id\` varchar(32) NULL;"
else
  ok "0035 tenant_settings.template_id already exists"
fi

# ── 0036: merchant verticals + per-tenant categories ─────────────────────────
# Ships drizzle/0017_merchant_verticals.sql + 0018_seed_jewellery_categories.sql.
# products.category enum→varchar, tenant_categories table, tenant_settings
# vertical columns, and a jewellery-preset seed for every existing tenant.
# Idempotent; see migrate_0036_merchant_verticals in deploy/lib/db.sh.
migrate_0036_merchant_verticals

# ── 0037: where the merchant is migrating from ───────────────────────────────
# Ships drizzle/0019_migrate_from_provider.sql. Signup's "already selling
# somewhere?" answer, which aims the onboarding checklist's catalogue step at
# the matching importer (server/onboarding.ts). NULL = started fresh, so every
# existing store is untouched. Idempotent.
if [ "$(col_exists tenant_settings migrate_from)" = "0" ]; then
  run_sql "0037 add tenant_settings.migrate_from" \
    "ALTER TABLE \`tenant_settings\` ADD \`migrate_from\` varchar(16) NULL;"
else
  ok "0037 tenant_settings.migrate_from already exists"
fi

# ── 0038: French + Italian category labels ────────────────────────────────────
# Ships drizzle/0020_tenant_category_locale_fr_it.sql. Storefront category
# chips fell back to English for fr/it visitors; nullable like label_de, so
# additive and safe ahead of any content existing.
if [ "$(col_exists tenant_categories label_fr)" = "0" ]; then
  run_sql "0038 add tenant_categories.label_fr" \
    "ALTER TABLE \`tenant_categories\` ADD \`label_fr\` varchar(64) NULL;"
else
  ok "0038 tenant_categories.label_fr already exists"
fi

if [ "$(col_exists tenant_categories label_it)" = "0" ]; then
  run_sql "0038 add tenant_categories.label_it" \
    "ALTER TABLE \`tenant_categories\` ADD \`label_it\` varchar(64) NULL;"
else
  ok "0038 tenant_categories.label_it already exists"
fi

# ── 0039: order locale ────────────────────────────────────────────────────────
# Ships drizzle/0021_order_locale.sql. Captures which storefront language the
# customer bought in (de/en/fr/it) so the receipt email matches; nullable —
# pre-capture orders fall back to English.
if [ "$(col_exists orders locale)" = "0" ]; then
  run_sql "0039 add orders.locale" \
    "ALTER TABLE \`orders\` ADD \`locale\` varchar(5) NULL;"
else
  ok "0039 orders.locale already exists"
fi

# ── 0040: second brand color ──────────────────────────────────────────────────
# Ships drizzle/0022_secondary_brand_color.sql. Drives the accent family, which
# a one-color derivation could only render as a tint of the primary. NULL keeps
# the existing derive-from-primary behaviour, so this is a no-op for stores that
# never pick one. Idempotent.
if [ "$(col_exists tenant_settings secondary_color)" = "0" ]; then
  run_sql "0040 add tenant_settings.secondary_color" \
    "ALTER TABLE \`tenant_settings\` ADD \`secondary_color\` varchar(7) NULL;"
else
  ok "0040 tenant_settings.secondary_color already exists"
fi

# ── 0041: one custom domain, one store ────────────────────────────────────────
# Ships drizzle/0023_custom_domain_unique.sql. `public_domain` now decides which
# tenant a request arriving on that hostname is served as (server/tenantResolve.ts)
# and whose plan gates its TLS certificate (server/domainAsk.ts) — both take the
# first matching row, so two stores claiming one hostname is a tenant mix-up.
# MySQL exempts NULL from unique indexes, so stores without a custom domain are
# untouched. Idempotent.
#
# Pre-existing duplicates would make CREATE UNIQUE INDEX fail, and a failed
# run_sql aborts the whole deploy — a schema tidy-up is not worth taking the
# store offline for, so duplicates are reported and the index is left for the
# next run. The application-level check in tenant.updateSettings refuses new
# duplicates meanwhile.
if [ "$(idx_exists tenant_settings tenant_settings_public_domain_unique)" = "0" ]; then
  DUP_DOMAIN_ROWS="$(row_count tenant_settings "public_domain IS NOT NULL AND public_domain IN (SELECT public_domain FROM (SELECT public_domain FROM tenant_settings WHERE public_domain IS NOT NULL GROUP BY public_domain HAVING COUNT(*) > 1) dupes)")"
  if [ "${DUP_DOMAIN_ROWS:-0}" = "0" ]; then
    run_sql "0041 unique tenant_settings.public_domain" \
      "CREATE UNIQUE INDEX \`tenant_settings_public_domain_unique\` ON \`tenant_settings\` (\`public_domain\`);"
  else
    warn "0041 skipped: ${DUP_DOMAIN_ROWS} tenant_settings rows share a custom domain with another store — clear the duplicates, then re-run ./update.sh"
  fi
else
  ok "0041 tenant_settings.public_domain already unique"
fi

# ── 0042: comped stores ───────────────────────────────────────────────────────
# Ships drizzle/0024_tenant_comps.sql. What the platform owner gives a store for
# nothing: `comp_plan` grants a plan without a subscription, `comp_fee_waived`
# takes 0% on its online/agent orders. Kept separate from `plan` — which Stripe's
# webhooks write — so a late `customer.subscription.deleted` can't revoke a comp
# and revoking a comp can't remove a plan the merchant pays for. Both are read
# together via shared/entitlements.ts. NULL + 0 is the existing behaviour of
# every store, so this is additive. Idempotent.
if [ "$(col_exists tenants comp_plan)" = "0" ]; then
  run_sql "0042 add tenants.comp_plan" \
    "ALTER TABLE \`tenants\` ADD \`comp_plan\` enum('free','pro') NULL;"
else
  ok "0042 tenants.comp_plan already exists"
fi

if [ "$(col_exists tenants comp_fee_waived)" = "0" ]; then
  run_sql "0042 add tenants.comp_fee_waived" \
    "ALTER TABLE \`tenants\` ADD \`comp_fee_waived\` boolean NOT NULL DEFAULT false;"
else
  ok "0042 tenants.comp_fee_waived already exists"
fi

if [ "$(col_exists tenants comp_note)" = "0" ]; then
  run_sql "0042 add tenants.comp_note" \
    "ALTER TABLE \`tenants\` ADD \`comp_note\` varchar(255) NULL;"
else
  ok "0042 tenants.comp_note already exists"
fi

if [ "$(col_exists tenants comp_granted_at)" = "0" ]; then
  run_sql "0042 add tenants.comp_granted_at" \
    "ALTER TABLE \`tenants\` ADD \`comp_granted_at\` timestamp NULL;"
else
  ok "0042 tenants.comp_granted_at already exists"
fi

if [ "$(col_exists tenants comp_granted_by)" = "0" ]; then
  run_sql "0042 add tenants.comp_granted_by" \
    "ALTER TABLE \`tenants\` ADD \`comp_granted_by\` int NULL;"
else
  ok "0042 tenants.comp_granted_by already exists"
fi

# ── 0043: merchant-authored storefront content + legal identity ───────────────
# Ships drizzle/0025_storefront_content.sql. Until now a store could change how
# its website looked but not a word of what it said: the home hero, the About
# page and the Impressum were generated templates with the store name
# interpolated in, and the hero background was one static asset every store
# shared. These columns are where a merchant's own words go.
#
# Every column is NULL for every existing store, and NULL means "keep using the
# generated copy" rather than "render nothing", so this is additive and a
# no-op until a merchant writes something. Idempotent.
if [ "$(col_exists tenant_settings hero_image_url)" = "0" ]; then
  run_sql "0043 add tenant_settings.hero_image_url" \
    "ALTER TABLE \`tenant_settings\` ADD \`hero_image_url\` varchar(1024) NULL;"
else
  ok "0043 tenant_settings.hero_image_url already exists"
fi

if [ "$(col_exists tenant_settings hero_headline)" = "0" ]; then
  run_sql "0043 add tenant_settings.hero_headline" \
    "ALTER TABLE \`tenant_settings\` ADD \`hero_headline\` varchar(120) NULL;"
else
  ok "0043 tenant_settings.hero_headline already exists"
fi

if [ "$(col_exists tenant_settings hero_subtitle)" = "0" ]; then
  run_sql "0043 add tenant_settings.hero_subtitle" \
    "ALTER TABLE \`tenant_settings\` ADD \`hero_subtitle\` varchar(300) NULL;"
else
  ok "0043 tenant_settings.hero_subtitle already exists"
fi

if [ "$(col_exists tenant_settings about_body)" = "0" ]; then
  run_sql "0043 add tenant_settings.about_body" \
    "ALTER TABLE \`tenant_settings\` ADD \`about_body\` text NULL;"
else
  ok "0043 tenant_settings.about_body already exists"
fi

# The legal-notice fields. The generated Impressum has always told the merchant
# they are responsible for adding their company form, registration or VAT number
# and a registered address — and then gave them nowhere to put them.
if [ "$(col_exists tenant_settings company_legal_name)" = "0" ]; then
  run_sql "0043 add tenant_settings.company_legal_name" \
    "ALTER TABLE \`tenant_settings\` ADD \`company_legal_name\` varchar(255) NULL;"
else
  ok "0043 tenant_settings.company_legal_name already exists"
fi

if [ "$(col_exists tenant_settings company_address)" = "0" ]; then
  run_sql "0043 add tenant_settings.company_address" \
    "ALTER TABLE \`tenant_settings\` ADD \`company_address\` text NULL;"
else
  ok "0043 tenant_settings.company_address already exists"
fi

if [ "$(col_exists tenant_settings vat_number)" = "0" ]; then
  run_sql "0043 add tenant_settings.vat_number" \
    "ALTER TABLE \`tenant_settings\` ADD \`vat_number\` varchar(64) NULL;"
else
  ok "0043 tenant_settings.vat_number already exists"
fi

if [ "$(col_exists tenant_settings company_registration)" = "0" ]; then
  run_sql "0043 add tenant_settings.company_registration" \
    "ALTER TABLE \`tenant_settings\` ADD \`company_registration\` varchar(64) NULL;"
else
  ok "0043 tenant_settings.company_registration already exists"
fi

# ── 0044: one-tap POS register pairing ────────────────────────────────────────
# Ships drizzle/0026_pos_pairing_tokens.sql. Short-lived single-use tokens so a
# merchant can pair a register by tapping a link rather than typing a 64-char
# key into a phone; the key itself stays out of the URL and out of this table.
# Additive — nothing reads it until a merchant mints a pairing link.
# Idempotent; see migrate_0044_pos_pairing_tokens in deploy/lib/db.sh.
migrate_0044_pos_pairing_tokens

# ── 0045: the paid one-time site import ──────────────────────────────────────
# Ships drizzle/0027_site_imports.sql. One row per attempt at lifting a
# merchant's existing shop across; the previewed → paid → applied status is what
# stops a replayed Stripe webhook importing the same catalogue twice. Additive —
# nothing reads it until a merchant starts an import.
# Idempotent; see migrate_0045_site_imports in deploy/lib/db.sh.
migrate_0045_site_imports

# ── 0046: the "Made with Zolto" credit becomes an opt-out ─────────────────────
# Ships drizzle/0028_zolto_attribution.sql. The platform credit used to be
# decided entirely by the plan: Free stores carried it (in /llms.txt, and
# nowhere else), Pro stores dropped it silently. A custom domain is Pro-only, so
# the storefronts where the Zolto name is least discoverable were the exact ones
# that never named it — to a shopper, a search crawler or an AI agent.
#
# The credit now shows by default on every plan and white-labelling buys the
# right to switch it off. This column is that switch; DEFAULT false means "show
# it", which is the new behaviour every existing row wants. Idempotent.
if [ "$(col_exists tenant_settings hide_zolto_badge)" = "0" ]; then
  run_sql "0046 add tenant_settings.hide_zolto_badge" \
    "ALTER TABLE \`tenant_settings\` ADD \`hide_zolto_badge\` boolean NOT NULL DEFAULT false;"
else
  ok "0046 tenant_settings.hide_zolto_badge already exists"
fi

# ── Record the applied migration set ──────────────────────────────────────────
# Only reached when every migration above succeeded — `set -e` plus run_sql's
# die() mean a failure never gets this far, so a half-applied schema is never
# recorded as done and the next run re-applies from the top.
if [ -n "$MIGRATIONS_FP" ]; then
  deploy_state_set schema_fingerprint "$MIGRATIONS_FP"
  ok "recorded schema fingerprint ${MIGRATIONS_FP:0:12}"
fi

fi  # end: migrations needed

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
# This step used to be `docker compose build --no-cache app`, unconditionally:
# a cold base image, two full `pnpm install` runs and a Vite + esbuild compile
# on every deploy, including deploys that pulled nothing but a doc change. Now
# we ask first, and only build what the source actually demands. A build that
# does happen keeps its layer cache (`--no-cache` is opt-in via --no-cache /
# --full), so an unchanged pnpm-lock.yaml means the dependency install is a
# cache hit and only the compile re-runs.
log "Checking whether the app image needs rebuilding"

SOURCE_FP="$(source_fingerprint || echo "")"
BUILD_ACTION="skipped"

if [ "$SKIP_BUILD" = "1" ]; then
  BUILD_ACTION="not built (--skip-build)"
  warn "--skip-build set — deploying whatever image is already present"
else
  if [ "$FORCE_REBUILD" = "1" ]; then
    REBUILD_REASON="forced (--rebuild/--no-cache/--full)"
  else
    REBUILD_REASON="$(app_rebuild_reason "$SOURCE_FP")" || REBUILD_REASON=""
  fi

  if [ -n "$REBUILD_REASON" ]; then
    log "Rebuilding app image — ${REBUILD_REASON}"
    BUILD_FLAGS=(--build-arg "SOURCE_FINGERPRINT=${SOURCE_FP:-unknown}")
    if [ "$NO_CACHE" = "1" ]; then
      BUILD_FLAGS+=(--no-cache)
      BUILD_ACTION="rebuilt (cold)"
    else
      BUILD_ACTION="rebuilt (layer cache)"
    fi
    docker compose build "${BUILD_FLAGS[@]}" app
  else
    ok "app image already built from this source (${SOURCE_FP:0:12}) — skipping rebuild"
    ok "force one with:  ./update.sh --rebuild"
  fi
fi

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

# ── Reload Caddy so Caddyfile changes take effect ─────────────────────────────
# Deliberately after the health check: Caddy's on-demand TLS asks the app
# (/api/domain-ask) whether a hostname may get a certificate, and a "no" is
# cached. Reloading before the app can answer would poison that decision.
#
# Without this step a Caddyfile change is a silent no-op — compose sees an
# unchanged service definition and leaves the container running the config it
# booted with. See deploy/lib/caddy.sh.
log "Reloading Caddy configuration"

set +e
CADDY_RELOAD_OUTPUT=$(reload_caddy)
CADDY_RELOAD_STATUS=$?
set -e

case "$CADDY_RELOAD_STATUS" in
  0) ok "caddy reloaded (Caddyfile changes are now live)" ;;
  2) ok "no bundled caddy running — skipped (another proxy fronts this app)" ;;
  *)
    warn "Caddy reload FAILED — it is still serving its previous configuration,"
    warn "so any Caddyfile change in this update has NOT taken effect."
    [ -n "$CADDY_RELOAD_OUTPUT" ] && printf '%s\n' "$CADDY_RELOAD_OUTPUT" | sed 's/^/      /'
    warn "Check:  docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile"
    ;;
esac

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
# History: these once removed only dangling resources, so tagged-but-unused
# images (old builder stages, the one-off backfill/langfix runners, aws-cli
# pulled by backups) and build cache accumulated forever — 19GB+ of cache and
# 18GB of images on a single-app 4GB droplet, which filled the disk and stalled
# MySQL mid-write (no room for its binlog, so every write, migrations included,
# hung until space was freed). The fix was `-a` on everything, every run.
#
# That traded a disk problem for a time problem: `docker builder prune -a`
# deletes exactly the layer cache the NEXT build wants, so every deploy was
# guaranteed a cold build. Both matter, so the aggressive prune is now driven by
# the thing it exists to prevent — disk pressure — instead of running blind.
# Below the threshold we still collect the genuinely dead stuff (stopped
# containers, dangling images, week-old cache) and keep the warm cache.
#
# Force the full sweep any time with --prune (or --full), and tune the trigger
# with PRUNE_DISK_PCT. The pre-flight check still hard-fails at 90%.
PRUNE_DISK_PCT="${PRUNE_DISK_PCT:-70}"
DISK_USE_NOW=$(df -P . | awk 'NR==2 { gsub("%", "", $5); print $5 }')
DISK_USE_NOW="${DISK_USE_NOW:-0}"

if [ "$FULL_PRUNE" = "1" ] || [ "$DISK_USE_NOW" -ge "$PRUNE_DISK_PCT" ] 2>/dev/null; then
  if [ "$FULL_PRUNE" = "1" ]; then
    log "Pruning unused Docker resources (full sweep requested)"
  else
    log "Pruning unused Docker resources (disk ${DISK_USE_NOW}% ≥ ${PRUNE_DISK_PCT}%)"
  fi

  PRUNED_CONTAINERS=$(docker container prune -f --format "{{.SpaceReclaimed}}" 2>/dev/null || true)
  ok "containers pruned${PRUNED_CONTAINERS:+ (freed ${PRUNED_CONTAINERS})}"

  # All unused images, not just dangling ones
  PRUNED_IMAGES=$(docker image prune -a -f --format "{{.SpaceReclaimed}}" 2>/dev/null || true)
  ok "unused images pruned${PRUNED_IMAGES:+ (freed ${PRUNED_IMAGES})}"

  # Whole build cache — costs the next deploy a cold build, which is the right
  # trade only when the disk is the thing actually at risk.
  BUILDER_PRUNE_OUTPUT=$(docker builder prune -a -f 2>&1 || true)
  PRUNED_CACHE=$(printf '%s\n' "$BUILDER_PRUNE_OUTPUT" | awk -F': *' '/^Total:/{print $2}' | tail -1)
  warn "build cache fully pruned${PRUNED_CACHE:+ (freed ${PRUNED_CACHE})} — the next build will be cold"
else
  log "Pruning dead Docker resources (disk ${DISK_USE_NOW}%, keeping the build cache warm)"

  PRUNED_CONTAINERS=$(docker container prune -f --format "{{.SpaceReclaimed}}" 2>/dev/null || true)
  ok "stopped containers pruned${PRUNED_CONTAINERS:+ (freed ${PRUNED_CONTAINERS})}"

  # Dangling images only: untagged leftovers of previous builds. The tagged
  # images the running stack and the layer cache depend on stay put.
  PRUNED_IMAGES=$(docker image prune -f --format "{{.SpaceReclaimed}}" 2>/dev/null || true)
  ok "dangling images pruned${PRUNED_IMAGES:+ (freed ${PRUNED_IMAGES})}"

  # Cache entries untouched for a week — old enough that no upcoming build will
  # reuse them, so this bounds growth without costing the next build anything.
  BUILDER_PRUNE_OUTPUT=$(docker builder prune -f --filter until=168h 2>&1 || true)
  PRUNED_CACHE=$(printf '%s\n' "$BUILDER_PRUNE_OUTPUT" | awk -F': *' '/^Total:/{print $2}' | tail -1)
  ok "stale build cache pruned${PRUNED_CACHE:+ (freed ${PRUNED_CACHE})}"
  ok "reclaim everything with:  ./update.sh --prune"
fi

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
echo -e "  Took     $(fmt_duration $((SECONDS - DEPLOY_STARTED_AT)))"
if [ "$MIGRATIONS_RAN" = "1" ]; then
  echo -e "  Schema   migrations applied"
else
  echo -e "  Schema   unchanged (migrations skipped)"
fi
echo -e "  Image    ${BUILD_ACTION}${SOURCE_FP:+ — source ${SOURCE_FP:0:12}}"
echo -e "  Backup   every Sunday 02:00 → ${PROJECT_DIR}/backups/"
echo ""
docker compose ps
echo ""
echo -e "  ${CYAN}Logs:${RESET}   docker compose logs -f app"
echo -e "  ${CYAN}Shell:${RESET}  docker compose exec app sh"
echo -e "  ${CYAN}Backup:${RESET} ./deploy/backup.sh"
echo ""
