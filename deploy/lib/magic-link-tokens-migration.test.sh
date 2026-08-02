#!/bin/bash
# deploy/lib/magic-link-tokens-migration.test.sh — tests for
# migrate_0034_magic_link_tokens.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the information_schema probe from a
# scenario variable and records every mutating statement, so we can assert:
#   - a database without the table gets a CREATE TABLE carrying every column
#     server/db.ts writes, plus the UNIQUE on `token`
#   - a database that already has it is a no-op
#
# Regression target: drizzle/0014_magic_link_tokens.sql was never wired into
# update.sh, the authoritative migration path, so passwordless sign-in
# (createMagicLinkToken / consumeMagicLinkToken in server/db.ts) wrote to a
# table that did not exist on a deployed database.
#
#   run with:  bash deploy/lib/magic-link-tokens-migration.test.sh

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
trap 'rm -f "${MUT_LOG_FILE}"' EXIT

FAKE_TABLE_EXISTS=0

fake_mysql() {
  local mode="$1"; shift
  local sql="$*"
  if [ "$mode" = "-se" ]; then
    if echo "$sql" | grep -q "information_schema.TABLES"; then
      echo "$FAKE_TABLE_EXISTS"
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
echo "Scenario A — magic_link_tokens missing:"
FAKE_TABLE_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0034_magic_link_tokens
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`magic_link_tokens\`" "creates magic_link_tokens"
# Every column server/db.ts reads or writes.
for col in id email token next expiresAt consumedAt createdAt; do
  assert_contains "$A_LOG" "\`${col}\`" "creates magic_link_tokens.${col}"
done
assert_contains "$A_LOG" "CONSTRAINT \`magic_link_tokens_token_unique\` UNIQUE(\`token\`)" \
  "keeps the UNIQUE on token that consumeMagicLinkToken relies on"
assert_contains "$A_LOG" "\`consumedAt\` timestamp NULL" \
  "consumedAt is nullable — an unconsumed token has no timestamp"

# ── Scenario B: table already present (idempotency) ───────────────────────────
echo "Scenario B — magic_link_tokens already present (idempotency):"
FAKE_TABLE_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0034_magic_link_tokens
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "CREATE TABLE" "no CREATE TABLE on re-run"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
