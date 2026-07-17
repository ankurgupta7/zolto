#!/bin/bash
# deploy/inspect-db.sh — READ-ONLY pre-migration inspection for migration 0019.
#
# Run this ON THE LIVE KALAKOSH SERVER, from the repo root, before deploying the
# multi-tenant migration. It performs NO writes — only SELECTs against
# information_schema and COUNT(*) — and prints a summary you can share back so
# the migration can be validated against a copy of this database.
#
# It never prints customer data, and never prints the value of any secret
# (POS_API_KEY is reported only as set / not set).
#
#   Usage:  bash deploy/inspect-db.sh
#
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $(pwd). Run this from the repo root on the server." >&2
  exit 1
fi

# Load DB creds the same way update.sh does.
set -a
# shellcheck source=/dev/null
source <(grep -v '^\s*#' .env | grep -v '^\s*$')
set +a

: "${MYSQL_USER:?MYSQL_USER not set in .env}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD not set in .env}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE not set in .env}"

MYSQL="docker compose exec -T db mysql --connect-timeout=10 -u${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE}"

q() { $MYSQL -N -s -e "$1" 2>/dev/null; }

echo "════════════════════════════════════════════════════════════════"
echo " Zolto migration 0019 — pre-flight inspection (READ ONLY)"
echo " $(date -u '+%Y-%m-%d %H:%M:%SZ')   database: ${MYSQL_DATABASE}"
echo "════════════════════════════════════════════════════════════════"

if ! $MYSQL -e "SELECT 1" >/dev/null 2>&1; then
  echo "ERROR: cannot reach the db container. Is 'docker compose up -d db' running?" >&2
  exit 1
fi

echo
echo "── Server ──────────────────────────────────────────────────────"
echo "  version:                    $(q 'SELECT VERSION();')"
echo "  explicit_defaults_ts:       $(q "SHOW VARIABLES LIKE 'explicit_defaults_for_timestamp';" | awk '{print $2}')"
echo "  default storage engine:     $(q "SHOW VARIABLES LIKE 'default_storage_engine';" | awk '{print $2}')"

echo
echo "── New tenant tables (expect: absent before 0019) ──────────────"
for t in tenants tenant_settings iteration_logs audit_logs api_keys add_ons; do
  n=$(q "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='${t}';")
  if [ "$n" = "1" ]; then
    rows=$(q "SELECT COUNT(*) FROM \`${t}\`;")
    printf "  %-20s EXISTS (rows: %s)\n" "$t" "$rows"
  else
    printf "  %-20s absent\n" "$t"
  fi
done

echo
echo "── Tenant-scoped tables: presence, engine, rows, tenant_id ─────"
printf "  %-24s %-8s %10s   %s\n" "table" "engine" "rows" "tenant_id"
for t in users products product_images instagram_posts orders bulk_upload_logs \
         pos_orders pos_order_items returns stripe_reconciliations; do
  exists=$(q "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='${t}';")
  if [ "$exists" != "1" ]; then
    printf "  %-24s %-8s %10s   %s\n" "$t" "-" "-" "TABLE ABSENT (earlier migration missing)"
    continue
  fi
  engine=$(q "SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='${t}';")
  rows=$(q "SELECT COUNT(*) FROM \`${t}\`;")
  nullable=$(q "SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='${t}' AND COLUMN_NAME='tenant_id';")
  if [ -z "$nullable" ]; then
    tid="absent (will be added)"
  else
    tid="present (nullable=${nullable})"
  fi
  printf "  %-24s %-8s %10s   %s\n" "$t" "$engine" "$rows" "$tid"
done

echo
echo "── Deploy prerequisites ────────────────────────────────────────"
if [ -n "${POS_API_KEY:-}" ]; then
  echo "  POS_API_KEY in .env:        set (value hidden) — tenant #1 will seed with it"
else
  echo "  POS_API_KEY in .env:        NOT SET — seed would use a placeholder and the"
  echo "                              live POS terminal would reject sales until fixed"
fi
echo "  bulk_upload_logs.operation: $(q "SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='bulk_upload_logs' AND COLUMN_NAME='operation';")"

echo
echo "════════════════════════════════════════════════════════════════"
echo " Done. No changes were made. Share this output (it contains no"
echo " customer data or secrets) to validate the migration."
echo "════════════════════════════════════════════════════════════════"
