#!/bin/bash
# deploy/lib/pos-pairing-tokens-migration.test.sh — tests for
# migrate_0043_pos_pairing_tokens.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the information_schema probe from a
# scenario variable and records every mutating statement, so we can assert:
#   - a database without the table gets a CREATE TABLE carrying every column
#     server/posPairing.ts writes, plus the UNIQUE on `token`
#   - a database that already has it is a no-op
#
# Why the shape matters: `consumedAt` must be nullable, because single-use
# redemption is an UPDATE … WHERE consumedAt IS NULL and a NOT NULL column with
# a default would make every freshly minted token look already spent. The
# UNIQUE on `token` is what the single-row redemption lookup relies on.
#
#   run with:  bash deploy/lib/pos-pairing-tokens-migration.test.sh

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
echo "Scenario A — pos_pairing_tokens missing:"
FAKE_TABLE_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0043_pos_pairing_tokens
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`pos_pairing_tokens\`" "creates pos_pairing_tokens"
# Every column server/posPairing.ts reads or writes.
for col in id tenant_id token expiresAt consumedAt createdAt; do
  assert_contains "$A_LOG" "\`${col}\`" "creates pos_pairing_tokens.${col}"
done
assert_contains "$A_LOG" "CONSTRAINT \`pos_pairing_tokens_token_unique\` UNIQUE(\`token\`)" \
  "keeps the UNIQUE on token that redemption's single-row lookup relies on"
assert_matches "$A_LOG" '`consumedAt` +timestamp NULL' \
  "consumedAt is nullable — single-use redemption is UPDATE … WHERE consumedAt IS NULL"
assert_matches "$A_LOG" '`tenant_id` +int NOT NULL' \
  "every token belongs to exactly one store"
assert_matches "$A_LOG" '`token` +varchar\(64\) NOT NULL' \
  "token column holds a SHA-256 hex digest"
# The key is deliberately NOT here: redemption reads it from the encrypted
# tenant_secrets vault, so a dump of this table yields nothing usable.
assert_not_contains "$A_LOG" "api_key" "stores no POS key"
assert_not_contains "$A_LOG" "ciphertext" "stores no ciphertext either"

# ── Scenario B: table already present (idempotency) ───────────────────────────
echo "Scenario B — pos_pairing_tokens already present (idempotency):"
FAKE_TABLE_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0043_pos_pairing_tokens
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "CREATE TABLE" "no CREATE TABLE on re-run"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
