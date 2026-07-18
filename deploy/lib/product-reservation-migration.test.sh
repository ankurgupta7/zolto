#!/bin/bash
# deploy/lib/product-reservation-migration.test.sh — tests for
# migrate_0021_product_reservations.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the col_exists probe from a
# scenario variable and records every mutating statement, so we can assert:
#   - a FRESH database (columns absent) gets both ADD COLUMN statements
#   - an ALREADY-MIGRATED database (columns present) is a no-op
#
#   run with:  bash deploy/lib/product-reservation-migration.test.sh

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
    if echo "$sql" | grep -q "reserved_until" && echo "$sql" | grep -q "COUNT"; then
      echo "$FAKE_RESERVED_UNTIL_EXISTS"
    elif echo "$sql" | grep -q "reserved_token" && echo "$sql" | grep -q "COUNT"; then
      echo "$FAKE_RESERVED_TOKEN_EXISTS"
    else
      echo ""
    fi
    return 0
  fi
  printf '%s\n' "$sql" >> "$MUT_LOG_FILE"
  return 0
}
MYSQL="fake_mysql"

echo "Scenario A — fresh database (columns absent):"
FAKE_RESERVED_UNTIL_EXISTS=0
FAKE_RESERVED_TOKEN_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0021_product_reservations
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "ALTER TABLE \`products\` ADD \`reserved_until\` timestamp NULL" \
  "adds products.reserved_until"
assert_contains "$A_LOG" "ALTER TABLE \`products\` ADD \`reserved_token\` varchar(32) NULL" \
  "adds products.reserved_token"

echo "Scenario B — already migrated (idempotency):"
FAKE_RESERVED_UNTIL_EXISTS=1
FAKE_RESERVED_TOKEN_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0021_product_reservations
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "ALTER TABLE" "no re-ADD on re-run"

echo "Scenario C — partially migrated (only reserved_until present):"
FAKE_RESERVED_UNTIL_EXISTS=1
FAKE_RESERVED_TOKEN_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0021_product_reservations
C_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$C_LOG" "reserved_until\` timestamp" "does not re-add reserved_until"
assert_contains "$C_LOG" "ALTER TABLE \`products\` ADD \`reserved_token\` varchar(32) NULL" \
  "still adds the missing reserved_token"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
