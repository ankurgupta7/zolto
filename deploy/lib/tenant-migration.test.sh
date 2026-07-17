#!/bin/bash
# deploy/lib/tenant-migration.test.sh — tests for migrate_0019_multitenant.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that (a) answers information_schema probes from
# scenario variables and (b) records every mutating statement, so we can assert:
#   - a FRESH database gets the CREATE/seed/ADD/backfill/NOT-NULL statements
#   - an ALREADY-MIGRATED database is a no-op (no INSERT/ADD/UPDATE/MODIFY),
#     i.e. the migration is safe to re-run on every deploy.
#
#   run with:  bash deploy/lib/tenant-migration.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILURES=0
PASSES=0
pass() { PASSES=$((PASSES + 1)); echo "  ok - $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "  NOT OK - $1"; }
assert_contains() { [[ "$1" == *"$2"* ]] && pass "$3" || { fail "$3 (missing: $2)"; }; }
assert_not_contains() { [[ "$1" != *"$2"* ]] && pass "$3" || { fail "$3 (unexpectedly present: $2)"; }; }

# Logging helpers db.sh expects in the calling shell.
ok() { :; }
warn() { :; }
die() { echo "DIE: $*"; exit 1; }

export MYSQL_DATABASE="testdb"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/db.sh"

# Records every statement run_sql issues (run_sql uses `-e`; probes use `-se`).
# run_sql invokes $MYSQL inside $(...) — a subshell — so mutations must be logged
# to a FILE, not a variable, to survive back to the parent shell.
MUT_LOG_FILE="$(mktemp)"
fake_mysql() {
  local mode="$1"; shift
  local sql="$*"
  if [ "$mode" = "-se" ]; then
    if echo "$sql" | grep -q "information_schema.COLUMNS" && echo "$sql" | grep -q "COUNT"; then
      echo "$FAKE_COL_EXISTS"
    elif echo "$sql" | grep -q "IS_NULLABLE"; then
      echo "$FAKE_NULLABLE"
    elif echo "$sql" | grep -q 'FROM `tenants` WHERE id=1'; then
      echo "$FAKE_TENANT_COUNT"
    elif echo "$sql" | grep -q 'FROM `tenant_settings`'; then
      echo "$FAKE_SETTINGS_COUNT"
    elif echo "$sql" | grep -q "information_schema.TABLES"; then
      echo "$FAKE_TBL_EXISTS"
    else
      echo ""
    fi
    return 0
  fi
  # -e: a mutating statement from run_sql
  printf '%s\n' "$sql" >> "$MUT_LOG_FILE"
  return 0
}
MYSQL="fake_mysql"

# ── Scenario A: fresh database ────────────────────────────────────────────────
echo "Scenario A — fresh database:"
FAKE_COL_EXISTS=0 FAKE_NULLABLE="YES" FAKE_TENANT_COUNT=0 FAKE_SETTINGS_COUNT=0 FAKE_TBL_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0019_multitenant
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`tenants\`" "creates tenants table"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`tenant_settings\`" "creates tenant_settings table"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`iteration_logs\`" "creates iteration_logs table"
assert_contains "$A_LOG" "INSERT INTO \`tenants\`" "seeds tenant #1"
assert_contains "$A_LOG" "INSERT INTO \`tenant_settings\`" "seeds tenant #1 settings"
for t in users products product_images instagram_posts orders bulk_upload_logs pos_orders pos_order_items returns stripe_reconciliations; do
  assert_contains "$A_LOG" "ALTER TABLE \`${t}\` ADD \`tenant_id\` int NULL" "adds ${t}.tenant_id"
  assert_contains "$A_LOG" "UPDATE \`${t}\` SET \`tenant_id\` = 1" "backfills ${t}.tenant_id"
  assert_contains "$A_LOG" "ALTER TABLE \`${t}\` MODIFY \`tenant_id\` int NOT NULL" "enforces ${t}.tenant_id NOT NULL"
done

# ── Scenario A2: fresh DB seeds pos key from POS_API_KEY (live POS keeps working)
echo "Scenario A2 — seed uses POS_API_KEY:"
FAKE_COL_EXISTS=0 FAKE_NULLABLE="YES" FAKE_TENANT_COUNT=0 FAKE_SETTINGS_COUNT=0 FAKE_TBL_EXISTS=0
: > "$MUT_LOG_FILE"
POS_API_KEY="live-pos-secret-123" migrate_0019_multitenant
assert_contains "$(cat "$MUT_LOG_FILE")" "'live-pos-secret-123'" "seeds tenant #1 with the deployment's POS_API_KEY"

# ── Scenario B: already migrated (re-run must be a no-op) ──────────────────────
echo "Scenario B — already migrated (idempotency):"
FAKE_COL_EXISTS=1 FAKE_NULLABLE="NO" FAKE_TENANT_COUNT=1 FAKE_SETTINGS_COUNT=1 FAKE_TBL_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0019_multitenant
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "INSERT INTO" "no re-seed on re-run"
assert_not_contains "$B_LOG" "ADD \`tenant_id\`" "no duplicate ADD COLUMN on re-run"
assert_not_contains "$B_LOG" "UPDATE \`" "no re-backfill on re-run"
assert_not_contains "$B_LOG" "MODIFY \`tenant_id\`" "no re-MODIFY on re-run"
# CREATE TABLE IF NOT EXISTS is still emitted, but that is inherently idempotent.
assert_contains "$B_LOG" "CREATE TABLE IF NOT EXISTS \`tenants\`" "CREATE ... IF NOT EXISTS still issued (safe)"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
