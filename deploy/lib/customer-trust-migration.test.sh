#!/bin/bash
# deploy/lib/customer-trust-migration.test.sh — tests for migrate_0048_customer_trust.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the information_schema probes from
# scenario variables and records every mutating statement, so we can assert:
#   - a database with none of it gets both tenant_settings columns and all
#     three tables, carrying every column server/db.ts reads or writes
#   - a database that already has them is a complete no-op
#
# Why these shapes matter, in the order they would hurt:
#
#   discount_codes.redeemed_count NOT NULL DEFAULT 0 — the redemption limit is
#   enforced by a conditional UPDATE (`WHERE redeemed_count < max_redemptions`).
#   NULL there makes that comparison NULL, never true, and EVERY redemption of
#   a limited code is refused: a merchant's whole promotion silently stops
#   working with no error anywhere.
#
#   discount_redemptions.stripe_session_id UNIQUE — the idempotency key for
#   checkout.session.completed. Without it a replayed webhook records a second
#   redemption of the same code and pushes the count past what the merchant
#   authorised.
#
#   testimonials' unique index on (tenant_id, google_id) rather than google_id
#   alone — one person may legitimately have reviewed two different stores on
#   this platform, and a global index would make the second one un-enterable.
#
#   run with:  bash deploy/lib/customer-trust-migration.test.sh

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
FAKE_COL_EXISTS=0

fake_mysql() {
  local mode="$1"; shift
  local sql="$*"
  if [ "$mode" = "-se" ]; then
    if echo "$sql" | grep -q "information_schema.TABLES"; then
      echo "$FAKE_TABLE_EXISTS"
    elif echo "$sql" | grep -q "information_schema.COLUMNS"; then
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

# ── Scenario A: nothing present ───────────────────────────────────────────────
echo "Scenario A — no trust columns or tables yet:"
FAKE_TABLE_EXISTS=0
FAKE_COL_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0048_customer_trust
A_LOG="$(cat "$MUT_LOG_FILE")"

# ── Trustpilot columns on tenant_settings ────────────────────────────────────
assert_contains "$A_LOG" "ADD \`trustpilot_domain\` varchar(253)" \
  "adds trustpilot_domain, wide enough for a maximum-length DNS name"
assert_contains "$A_LOG" "ADD \`trustpilot_show_rating\` boolean NOT NULL DEFAULT true" \
  "adds trustpilot_show_rating, defaulting to shown"
assert_matches "$A_LOG" 'ADD `trustpilot_domain` varchar\(253\) NULL' \
  "trustpilot_domain is nullable — most stores have no Trustpilot profile"

# ── testimonials ─────────────────────────────────────────────────────────────
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`testimonials\`" "creates testimonials"
for col in id tenant_id author_name author_title author_photo_url google_id \
           quote rating source published sort_order createdAt updatedAt; do
  assert_contains "$A_LOG" "\`${col}\`" "creates testimonials.${col}"
done
assert_matches "$A_LOG" '`tenant_id` +int NOT NULL' \
  "every testimonial belongs to exactly one store — the scope on every read"
assert_matches "$A_LOG" '`quote` +text NOT NULL' \
  "a testimonial without words is not a testimonial"
assert_matches "$A_LOG" '`author_photo_url` +varchar\(1024\)' \
  "the customer's photo is optional — the storefront falls back to initials"
assert_matches "$A_LOG" '`google_id` +varchar\(64\)' \
  "the customer's Google id is optional too"
assert_contains "$A_LOG" "\`testimonials_tenant_google\` UNIQUE(\`tenant_id\`,\`google_id\`)" \
  "the same Google reviewer can't be entered twice for one store"
assert_matches "$A_LOG" "enum\('manual','google','trustpilot'\)" \
  "source records where the words came from"
assert_matches "$A_LOG" '`published` +boolean NOT NULL DEFAULT true' \
  "a newly added quote is live — the merchant typed it in to publish it"

# ── discount_codes ───────────────────────────────────────────────────────────
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`discount_codes\`" "creates discount_codes"
for col in id tenant_id code kind value currency campaign min_subtotal_rappen \
           max_redemptions redeemed_count starts_at expires_at active \
           created_by createdAt updatedAt; do
  assert_contains "$A_LOG" "\`${col}\`" "creates discount_codes.${col}"
done
assert_matches "$A_LOG" "enum\('percent','amount'\)" "kind carries both discount shapes"
assert_matches "$A_LOG" '`redeemed_count` +int NOT NULL DEFAULT 0' \
  "redeemed_count is NOT NULL — a NULL would refuse every redemption of a limited code"
assert_matches "$A_LOG" '`max_redemptions` +int,$' \
  "max_redemptions is nullable — NULL means unlimited"
assert_contains "$A_LOG" "\`discount_codes_tenant_code\` UNIQUE(\`tenant_id\`,\`code\`)" \
  "codes are unique per store, not platform-wide — two shops may both run WELCOME10"
assert_not_contains "$A_LOG" "\`discount_codes_code\` UNIQUE(\`code\`)" \
  "no global unique on code — that would let one store claim a word from all the others"
assert_matches "$A_LOG" '`starts_at` +timestamp NULL' \
  "starts_at is nullable — a code with no start date is live immediately"
assert_matches "$A_LOG" '`expires_at` +timestamp NULL' \
  "expires_at is nullable — a code with no end date never expires"
assert_matches "$A_LOG" '`active` +boolean NOT NULL DEFAULT true' \
  "a newly minted code works"

# ── discount_redemptions ─────────────────────────────────────────────────────
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`discount_redemptions\`" \
  "creates discount_redemptions"
for col in id tenant_id discount_code_id order_id stripe_session_id status \
           amount_off_rappen currency customer_email held_until confirmed_at createdAt; do
  assert_contains "$A_LOG" "\`${col}\`" "creates discount_redemptions.${col}"
done
assert_contains "$A_LOG" "\`discount_redemptions_stripe_session_id_unique\` UNIQUE(\`stripe_session_id\`)" \
  "one redemption per Stripe session — a replayed webhook can't double-count"
assert_matches "$A_LOG" "enum\('held','confirmed','released'\)" \
  "the hold ladder that stops a single-use code being spent twice mid-payment"
assert_contains "$A_LOG" "DEFAULT 'held'" \
  "a redemption starts as a hold — it is only confirmed once Stripe says paid"
assert_matches "$A_LOG" '`amount_off_rappen` +int NOT NULL' \
  "what actually came off is recorded as charged, not re-derived later"
assert_matches "$A_LOG" '`order_id` +int,$' \
  "order_id is nullable — a hold exists before the order is paid"

# None of these tables is a place for payment credentials.
assert_not_contains "$A_LOG" "card" "stores no card data"
assert_not_contains "$A_LOG" "api_key" "stores no keys"

# ── Scenario B: everything already present (idempotency) ─────────────────────
echo "Scenario B — columns and tables already present (idempotency):"
FAKE_TABLE_EXISTS=1
FAKE_COL_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0048_customer_trust
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "CREATE TABLE" "no CREATE TABLE on re-run"
assert_not_contains "$B_LOG" "ALTER TABLE" "no ALTER TABLE on re-run"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
