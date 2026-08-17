#!/bin/bash
# deploy/lib/sheet-mirror-migration.test.sh — tests for migrate_0051_sheet_mirrors.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the migration
# with a fake $MYSQL that answers the information_schema probes from scenario
# variables and records every mutating statement.
#
# Why the shape matters: upsertSheetMirror (server/db.ts) is an INSERT … ON
# DUPLICATE KEY UPDATE, and in MySQL that fires ONLY on a PRIMARY KEY or UNIQUE
# collision. `id` is autoincrement and never supplied, so
# `sheet_mirrors_tenant_id_unique` is the only thing standing between "one mirror
# per store" and a second spreadsheet appearing on every reconnect. The failure is
# silent and actively misleading: both files open, both look like the store's
# books, and getSheetMirror's LIMIT 1 decides which one the sync keeps current
# while the merchant may well be reading the other.
#
#   run with:  bash deploy/lib/sheet-mirror-migration.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILURES=0
PASSES=0
pass() { PASSES=$((PASSES + 1)); echo "  ok - $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "  NOT OK - $1"; }
assert_contains() { [[ "$1" == *"$2"* ]] && pass "$3" || { fail "$3 (missing: $2)"; }; }
assert_not_contains() { [[ "$1" != *"$2"* ]] && pass "$3" || { fail "$3 (unexpectedly present: $2)"; }; }
# The DDL pads column names for alignment, so anything asserting on a
# "name type" pair has to tolerate runs of whitespace.
assert_matches() {
  grep -Eq "$2" <<< "$1" && pass "$3" || { fail "$3 (no match: $2)"; }
}

ok() { :; }
warn() { :; }
die() { echo "DIE: $*"; exit 1; }

export MYSQL_DATABASE="testdb"
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/db.sh"

MUT_LOG_FILE="$(mktemp)"
trap 'rm -f "${MUT_LOG_FILE}"' EXIT

FAKE_TABLE_EXISTS=0
FAKE_INDEX_EXISTS=0

fake_mysql() {
  local mode="$1"; shift
  local sql="$*"
  if [ "$mode" = "-se" ]; then
    if echo "$sql" | grep -q "information_schema.TABLES"; then
      echo "$FAKE_TABLE_EXISTS"
    # idx_exists probes TABLE_CONSTRAINTS (where UNIQUE lives), not STATISTICS.
    elif echo "$sql" | grep -q "information_schema.TABLE_CONSTRAINTS"; then
      echo "$FAKE_INDEX_EXISTS"
    else
      echo ""
    fi
    return 0
  fi
  printf '%s\n' "$sql" >> "$MUT_LOG_FILE"
  return 0
}
MYSQL="fake_mysql"

# ── Scenario A: table missing ─────────────────────────────────────────────────
echo "Scenario A — sheet_mirrors missing:"
FAKE_TABLE_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0051_sheet_mirrors
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`sheet_mirrors\`" "creates sheet_mirrors"

for col in id tenant_id spreadsheet_id spreadsheet_url shared_with \
           stock_in_enabled last_synced_at last_sync_error createdAt updatedAt; do
  assert_contains "$A_LOG" "\`${col}\`" "creates sheet_mirrors.${col}"
done

# The upsert key. Without it, reconnecting creates a second mirror.
assert_contains "$A_LOG" \
  "CONSTRAINT \`sheet_mirrors_tenant_id_unique\` UNIQUE(\`tenant_id\`)" \
  "one mirror per store — the UNIQUE key is what makes upsertSheetMirror an update"

assert_matches "$A_LOG" '`tenant_id` +int NOT NULL' \
  "tenant_id is NOT NULL — a NULL would be exempt from the unique index above"

# stock_in_enabled decides whether the merchant holds a Drive *writer* grant.
# Defaulting it to anything but false would hand every newly created mirror an
# editable ledger before server/sheetMirror.ts has applied its protected ranges.
assert_matches "$A_LOG" '`stock_in_enabled` +boolean NOT NULL DEFAULT false' \
  "lane 2 is off by default — a new mirror is read-only until asked otherwise"

# Sync state is nullable on purpose: a freshly connected store has not synced
# yet, and 'never' must be distinguishable from 'synced at the epoch'.
assert_matches "$A_LOG" '`last_synced_at` +timestamp NULL' \
  "last_synced_at is nullable so 'never synced' is representable"

# The mirror holds the merchant's own address so the admin can show who the file
# was shared with. Nothing else about a customer belongs in this table — the
# sales rows it publishes are rendered per push and never stored here.
assert_not_contains "$A_LOG" "customer" "stores no customer data"
assert_not_contains "$A_LOG" "access_token" "stores no credentials — those are platform env vars"

# ── Scenario B: table present, index present (idempotency) ────────────────────
echo "Scenario B — sheet_mirrors already present (idempotency):"
FAKE_TABLE_EXISTS=1
FAKE_INDEX_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0051_sheet_mirrors
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "CREATE TABLE" "no CREATE TABLE on re-run"
assert_not_contains "$B_LOG" "ADD CONSTRAINT" "no index churn on re-run"

# ── Scenario C: table present but the unique key is gone ──────────────────────
# The silent-divergence case: nothing errors, and the store quietly acquires a
# second spreadsheet the next time a merchant presses Connect.
echo "Scenario C — sheet_mirrors present without its unique key:"
FAKE_TABLE_EXISTS=1
FAKE_INDEX_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0051_sheet_mirrors
C_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$C_LOG" "ADD CONSTRAINT \`sheet_mirrors_tenant_id_unique\` UNIQUE" \
  "restores the tenant unique key so a reconnect updates instead of duplicating"
assert_not_contains "$C_LOG" "CREATE TABLE" "does not recreate the existing table"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
