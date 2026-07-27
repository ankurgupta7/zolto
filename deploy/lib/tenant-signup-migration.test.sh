#!/bin/bash
# deploy/lib/tenant-signup-migration.test.sh — tests for migrate_0023_tenant_signup_fix
# and migrate_0024_staff_invites_and_photo_credits.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migrations with a fake $MYSQL that answers the information_schema probes from
# scenario variables and records every mutating statement, so we can assert:
#   - a STALE database (old plan enum, no terminal_location_id, missing tables)
#     gets the widen/remap/finalize + ADD COLUMN + CREATE TABLE statements
#   - an UP-TO-DATE database is a no-op
#
#   run with:  bash deploy/lib/tenant-signup-migration.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILURES=0
PASSES=0
pass() { PASSES=$((PASSES + 1)); echo "  ok - $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "  NOT OK - $1"; }
assert_contains() { [[ "$1" == *"$2"* ]] && pass "$3" || { fail "$3 (missing: $2)"; }; }
assert_not_contains() { [[ "$1" != *"$2"* ]] && pass "$3" || { fail "$3 (unexpectedly present: $2)"; }; }

ok() { :; }
warn() { :; }
die() { echo "DIE: $*"; exit 1; }

export MYSQL_DATABASE="testdb"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/db.sh"

MUT_LOG_FILE="$(mktemp)"
fake_mysql() {
  local mode="$1"; shift
  local sql="$*"
  if [ "$mode" = "-se" ]; then
    if echo "$sql" | grep -q "COLUMN_TYPE"; then
      echo "$FAKE_PLAN_ENUM"
    elif echo "$sql" | grep -q "information_schema.COLUMNS" && echo "$sql" | grep -q "COUNT"; then
      echo "$FAKE_COL_EXISTS"
    elif echo "$sql" | grep -q "information_schema.TABLES"; then
      echo "$FAKE_TBL_EXISTS"
    else
      echo ""
    fi
    return 0
  fi
  printf '%s\n' "$sql" >> "$MUT_LOG_FILE"
  return 0
}
MYSQL="fake_mysql"

# ── Scenario A: stale database (as deployed by pre-fix update.sh) ─────────────
echo "Scenario A — stale database (old plan enum, no terminal_location_id, missing tables):"
FAKE_PLAN_ENUM="enum('starter','growth','enterprise')" FAKE_COL_EXISTS=0 FAKE_TBL_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0023_tenant_signup_fix
migrate_0024_staff_invites_and_photo_credits
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "MODIFY \`plan\` enum('starter','growth','enterprise','free','maker','studio','atelier')" \
  "widens tenants.plan to the union of old+new values"
assert_contains "$A_LOG" "SET \`plan\`='free' WHERE \`plan\`='starter'" "remaps starter→free"
assert_contains "$A_LOG" "SET \`plan\`='maker' WHERE \`plan\`='growth'" "remaps growth→maker"
assert_contains "$A_LOG" "SET \`plan\`='atelier' WHERE \`plan\`='enterprise'" "remaps enterprise→atelier"
assert_contains "$A_LOG" "MODIFY \`plan\` enum('free','maker','studio','atelier') NOT NULL DEFAULT 'free'" \
  "finalizes tenants.plan to the new plan ids"
assert_contains "$A_LOG" "ALTER TABLE \`tenants\` ADD \`terminal_location_id\` varchar(255) NULL" \
  "adds tenants.terminal_location_id"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`staff_invites\`" "creates staff_invites table"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`photo_credit_ledger\`" "creates photo_credit_ledger table"
assert_contains "$A_LOG" "enum('monthly_grant','purchase','consumption','manual_adjustment')" \
  "photo_credit_ledger.kind enum matches schema"

# ── Scenario B: up-to-date database (idempotency) ──────────────────────────────
echo "Scenario B — up-to-date database (idempotency):"
FAKE_PLAN_ENUM="enum('free','maker','studio','atelier')" FAKE_COL_EXISTS=1 FAKE_TBL_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0023_tenant_signup_fix
migrate_0024_staff_invites_and_photo_credits
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "MODIFY \`plan\`" "no plan enum rewrite on re-run"
assert_not_contains "$B_LOG" "UPDATE \`tenants\`" "no remap on re-run"
assert_not_contains "$B_LOG" "ADD \`terminal_location_id\`" "no duplicate ADD COLUMN on re-run"
assert_not_contains "$B_LOG" "CREATE TABLE" "no CREATE TABLE on re-run"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
