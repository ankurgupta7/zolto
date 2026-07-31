#!/bin/bash
# deploy/lib/storage-quota-migration.test.sh — tests for migrate_0026_storage_objects.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the tbl_exists / idx_exists probes
# from scenario variables and records every mutating statement, so we can
# assert:
#   - a FRESH database gets both the CREATE TABLE and the index
#   - an ALREADY-MIGRATED database is a complete no-op (idempotency — update.sh
#     runs every migration on every deploy)
#   - a HALF-MIGRATED database (table created, index missing — e.g. a deploy
#     interrupted between the two statements) gets only the index
#
#   run with:  bash deploy/lib/storage-quota-migration.test.sh

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
    if echo "$sql" | grep -q "information_schema.TABLES"; then
      echo "$FAKE_TBL_EXISTS"
    elif echo "$sql" | grep -q "information_schema.STATISTICS"; then
      echo "$FAKE_IDX_EXISTS"
    else
      echo ""
    fi
    return 0
  fi
  printf '%s\n' "$sql" >> "$MUT_LOG_FILE"
  return 0
}
MYSQL="fake_mysql"

echo "Scenario A — fresh database (table and index absent):"
FAKE_TBL_EXISTS=0
FAKE_IDX_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0026_storage_objects
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`storage_objects\`" \
  "creates storage_objects"
assert_contains "$A_LOG" "\`tenant_id\`   int NOT NULL" \
  "ledger rows are tenant-scoped"
assert_contains "$A_LOG" "\`bytes\`       int NOT NULL" \
  "records a byte count per object"
assert_contains "$A_LOG" "\`storage_key\` varchar(512) NOT NULL" \
  "records the S3 key so a delete can release the quota"
assert_contains "$A_LOG" "CREATE INDEX \`storage_objects_tenant_idx\`" \
  "indexes tenant_id — the quota read is SUM(bytes) WHERE tenant_id = ?"

echo "Scenario B — already migrated (idempotency):"
FAKE_TBL_EXISTS=1
FAKE_IDX_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0026_storage_objects
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "CREATE TABLE" "no re-CREATE on re-run"
assert_not_contains "$B_LOG" "CREATE INDEX" "no re-INDEX on re-run"

echo "Scenario C — half migrated (table present, index missing):"
# A deploy interrupted between the two statements. The next run must finish the
# job rather than skipping the index because the table already exists.
FAKE_TBL_EXISTS=1
FAKE_IDX_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0026_storage_objects
C_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$C_LOG" "CREATE TABLE" "does not re-create the existing table"
assert_contains "$C_LOG" "CREATE INDEX \`storage_objects_tenant_idx\`" \
  "still adds the missing index"

echo "Scenario D — no data migration:"
# Objects written before this migration were never measured. Inventing sizes
# for them would charge merchants for photos we never metered.
FAKE_TBL_EXISTS=0
FAKE_IDX_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0026_storage_objects
D_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$D_LOG" "INSERT INTO \`storage_objects\`" "seeds no rows"
assert_not_contains "$D_LOG" "UPDATE" "touches no existing data"

rm -f "$MUT_LOG_FILE"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
