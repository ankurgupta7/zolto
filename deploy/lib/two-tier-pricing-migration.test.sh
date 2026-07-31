#!/bin/bash
# deploy/lib/two-tier-pricing-migration.test.sh — tests for migrate_0027_two_tier_pricing.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the information_schema probes from
# scenario variables and records every mutating statement, so we can assert:
#   - a STALE database (pre-pivot plan enum, no channel/fee columns) gets the
#     widen/remap/finalize + ADD COLUMN statements
#   - an UP-TO-DATE database is a no-op
#
# Regression target: drizzle/0008_two_tier_pricing.sql shipped the schema
# change but was never wired into update.sh, the authoritative migration
# path — so orders.channel and orders.platform_fee_rappen, which
# checkout.ts/billing.ts have referenced since the pivot, never existed on a
# database provisioned only through update.sh.
#
#   run with:  bash deploy/lib/two-tier-pricing-migration.test.sh

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
    elif echo "$sql" | grep -q "information_schema.COLUMNS"; then
      if echo "$sql" | grep -q "'channel'"; then
        echo "$FAKE_CHANNEL_EXISTS"
      elif echo "$sql" | grep -q "'platform_fee_rappen'"; then
        echo "$FAKE_FEE_COL_EXISTS"
      else
        echo 0
      fi
    else
      echo ""
    fi
    return 0
  fi
  printf '%s\n' "$sql" >> "$MUT_LOG_FILE"
  return 0
}
MYSQL="fake_mysql"

# ── Scenario A: stale database (pre-pivot plan enum, no channel/fee columns) ──
echo "Scenario A — stale database (pre-pivot plan enum, missing order columns):"
FAKE_PLAN_ENUM="enum('free','maker','studio','atelier')" FAKE_CHANNEL_EXISTS=0 FAKE_FEE_COL_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0027_two_tier_pricing
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "MODIFY \`plan\` enum('free','maker','studio','atelier','pro') NOT NULL DEFAULT 'free'" \
  "widens tenants.plan to the union of old+new values"
assert_contains "$A_LOG" "SET \`plan\`='pro' WHERE \`plan\`='maker'" "remaps maker→pro"
assert_contains "$A_LOG" "SET \`plan\`='pro' WHERE \`plan\`='studio'" "remaps studio→pro"
assert_contains "$A_LOG" "SET \`plan\`='pro' WHERE \`plan\`='atelier'" "remaps atelier→pro"
assert_contains "$A_LOG" "MODIFY \`plan\` enum('free','pro') NOT NULL DEFAULT 'free'" \
  "finalizes tenants.plan to free/pro"
assert_contains "$A_LOG" "ALTER TABLE \`orders\` ADD \`channel\` enum('web','agent') NOT NULL DEFAULT 'web'" \
  "adds orders.channel"
assert_contains "$A_LOG" "ALTER TABLE \`orders\` ADD \`platform_fee_rappen\` int NOT NULL DEFAULT 0" \
  "adds orders.platform_fee_rappen"

# ── Scenario B: up-to-date database (idempotency) ──────────────────────────────
echo "Scenario B — up-to-date database (idempotency):"
FAKE_PLAN_ENUM="enum('free','pro')" FAKE_CHANNEL_EXISTS=1 FAKE_FEE_COL_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0027_two_tier_pricing
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "MODIFY \`plan\`" "no plan enum rewrite on re-run"
assert_not_contains "$B_LOG" "UPDATE \`tenants\`" "no remap on re-run"
assert_not_contains "$B_LOG" "ADD \`channel\`" "no duplicate ADD COLUMN on re-run"
assert_not_contains "$B_LOG" "ADD \`platform_fee_rappen\`" "no duplicate ADD COLUMN on re-run"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
