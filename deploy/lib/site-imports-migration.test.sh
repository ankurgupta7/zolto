#!/bin/bash
# deploy/lib/site-imports-migration.test.sh — tests for migrate_0045_site_imports.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the information_schema probe from a
# scenario variable and records every mutating statement, so we can assert:
#   - a database without the table gets a CREATE TABLE carrying every column
#     server/db.ts's site-import helpers read or write
#   - a database that already has it is a no-op
#
# Why the shape matters: this table is where a payment turns into a write. The
# `status` enum is the idempotency key for both transitions — markSiteImportPaid
# only moves a row out of 'previewed', markSiteImportApplied only out of 'paid'
# — so if the enum loses a member or gains a wrong default, a replayed Stripe
# webhook silently imports a merchant's whole catalogue twice. `paid_at` and
# `applied_at` must be nullable, because a freshly previewed row has neither.
#
#   run with:  bash deploy/lib/site-imports-migration.test.sh

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
echo "Scenario A — site_imports missing:"
FAKE_TABLE_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0045_site_imports
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`site_imports\`" "creates site_imports"
# Every column the site-import helpers in server/db.ts touch.
for col in id tenant_id source_url status extraction product_count \
           stripe_session_id amount_cents currency paid_at applied_at \
           failure_reason createdAt; do
  assert_contains "$A_LOG" "\`${col}\`" "creates site_imports.${col}"
done

assert_matches "$A_LOG" '`tenant_id` +int NOT NULL' \
  "every import belongs to exactly one store — the scope on every read and write"

# The status ladder, member by member. Losing one silently breaks a transition
# guard rather than failing loudly.
for member in previewed paid applied failed; do
  assert_matches "$A_LOG" "enum\('previewed','paid','applied','failed'\)" \
    "status enum still carries '${member}'"
done
assert_contains "$A_LOG" "DEFAULT 'previewed'" \
  "a new row starts unpaid — nothing is importable until Stripe says so"

assert_matches "$A_LOG" '`paid_at` +timestamp NULL' \
  "paid_at is nullable — a previewed row has not been paid for"
assert_matches "$A_LOG" '`applied_at` +timestamp NULL' \
  "applied_at is nullable — a paid row has not been applied yet"
assert_matches "$A_LOG" '`extraction` +json' \
  "the extraction is stored, so the merchant gets the result they were shown"
assert_matches "$A_LOG" '`source_url` +varchar\(1024\) NOT NULL' \
  "source_url is wide enough for a real deep catalogue URL"
assert_matches "$A_LOG" '`product_count` +int NOT NULL DEFAULT 0' \
  "product_count defaults to zero rather than to NULL"

# This table records that a payment happened; it must never become a second
# copy of the card details Stripe holds.
assert_not_contains "$A_LOG" "card" "stores no card data"
assert_not_contains "$A_LOG" "api_key" "stores no keys"

# ── Scenario B: table already present (idempotency) ───────────────────────────
echo "Scenario B — site_imports already present (idempotency):"
FAKE_TABLE_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0045_site_imports
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "CREATE TABLE" "no CREATE TABLE on re-run"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
