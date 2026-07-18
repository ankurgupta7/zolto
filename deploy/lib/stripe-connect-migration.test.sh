#!/bin/bash
# deploy/lib/stripe-connect-migration.test.sh — tests for migrate_0020_stripe_connect.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the col_exists probe from a
# scenario variable and records every mutating statement, so we can assert:
#   - a FRESH database (column absent) gets the ADD COLUMN statement
#   - an ALREADY-MIGRATED database (column present) is a no-op
#
#   run with:  bash deploy/lib/stripe-connect-migration.test.sh

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
    if echo "$sql" | grep -q "information_schema.COLUMNS" && echo "$sql" | grep -q "COUNT"; then
      echo "$FAKE_COL_EXISTS"
    else
      echo ""
    fi
    return 0
  fi
  printf '%s\n' "$sql" >> "$MUT_LOG_FILE"
  return 0
}
MYSQL="fake_mysql"

echo "Scenario A — fresh database (column absent):"
FAKE_COL_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0020_stripe_connect
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "ALTER TABLE \`tenants\` ADD \`stripe_connected_account_id\` varchar(255) NULL" \
  "adds tenants.stripe_connected_account_id"

echo "Scenario B — already migrated (idempotency):"
FAKE_COL_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0020_stripe_connect
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "ALTER TABLE" "no re-ADD on re-run"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
