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

# Parse .env literally via the shared loader. NEVER `source` it: this script
# used to, and a value like RESEND_FROM_EMAIL=Zolto <orders@zolto.ch> was then
# read as a shell redirect — producing "/dev/fd/63: line N: orders@zolto.ch: No
# such file or directory" before any query ran. See deploy/lib/env.sh.
# shellcheck source=lib/env.sh
. "$(dirname "$0")/lib/env.sh"
load_dotenv .env || {
  echo "ERROR: could not read .env" >&2
  exit 1
}

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
echo "── Was this database EVER populated? (data-loss forensics) ─────"
# An all-zero row count has two very different causes: a database that was
# never written to, and one that was wiped. AUTO_INCREMENT separates them.
# MySQL 8.0 persists the counter across restarts and does NOT reset it on
# DELETE, so:
#   0 rows + AUTO_INCREMENT = 1  → nothing was ever inserted (fresh volume)
#   0 rows + AUTO_INCREMENT > 1  → rows existed and are gone (DATA LOSS)
# Caveat in the other direction: TRUNCATE TABLE and a dropped-and-recreated
# volume both reset the counter to 1, so 1 is consistent with data loss too —
# it just isn't proof of it. CREATE_TIME is the corroborating signal: on a
# restored or long-lived database the tables predate today's deploy.
printf "  %-24s %8s %14s   %s\n" "table" "rows" "auto_increment" "created"
EVER_POPULATED=0
for t in users products orders pos_orders tenants; do
  exists=$(q "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='${t}';")
  [ "$exists" = "1" ] || continue
  rows=$(q "SELECT COUNT(*) FROM \`${t}\`;")
  ai=$(q "SELECT IFNULL(AUTO_INCREMENT, 0) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='${t}';")
  ct=$(q "SELECT IFNULL(CREATE_TIME, '?') FROM information_schema.TABLES WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='${t}';")
  printf "  %-24s %8s %14s   %s\n" "$t" "$rows" "$ai" "$ct"
  # Only flag a table that is empty NOW but has handed out ids before.
  if [ "${rows:-0}" = "0" ] && [ "${ai:-0}" -gt 1 ] 2>/dev/null; then
    EVER_POPULATED=1
  fi
done
echo
if [ "$EVER_POPULATED" = "1" ]; then
  echo "  ⛔ DATA LOSS: a table above is empty but its AUTO_INCREMENT is past 1,"
  echo "     so rows were inserted and later removed. Restore from a backup"
  echo "     before writing anything new: ./deploy/recover-from-backup.sh --list"
else
  echo "  ✅ No evidence of deleted rows: every empty table still has its"
  echo "     AUTO_INCREMENT at 1, i.e. it has never issued an id. Consistent"
  echo "     with a database that was simply never populated. Compare the"
  echo "     'created' column against when this server was provisioned to"
  echo "     confirm — recent timestamps mean a fresh volume."
fi

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
