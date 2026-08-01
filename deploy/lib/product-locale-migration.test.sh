#!/bin/bash
# deploy/lib/product-locale-migration.test.sh — tests for
# migrate_0033_product_locales_de_fr.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the information_schema probes from
# scenario variables and records every mutating statement, so we can assert:
#   - a STALE database (EN/IT locales only) gets all four DE/FR ADD COLUMNs
#   - a HALF-MIGRATED database only gets the columns it is actually missing
#   - an UP-TO-DATE database is a no-op
#
# Regression target: drizzle/0007_product_locales.sql was never wired into
# update.sh, the authoritative migration path — only its Italian follow-up
# (0009 → update.sh 0028) was. Every storefront product query selects the
# columns drizzle/schema.ts declares, so on a database provisioned purely
# through update.sh the listing died with
#   ER_BAD_FIELD_ERROR: Unknown column 'nameDe' in 'field list'
#
#   run with:  bash deploy/lib/product-locale-migration.test.sh

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

# Columns the fake database already has, as a space-delimited list.
FAKE_EXISTING_COLS=""

fake_mysql() {
  local mode="$1"; shift
  local sql="$*"
  if [ "$mode" = "-se" ]; then
    if echo "$sql" | grep -q "information_schema.COLUMNS"; then
      local col
      col=$(echo "$sql" | sed -n "s/.*COLUMN_NAME='\([^']*\)'.*/\1/p")
      if [[ " ${FAKE_EXISTING_COLS} " == *" ${col} "* ]]; then echo 1; else echo 0; fi
    else
      echo ""
    fi
    return 0
  fi
  printf '%s\n' "$sql" >> "$MUT_LOG_FILE"
  return 0
}
MYSQL="fake_mysql"

# ── Scenario A: stale database (EN + IT locales, no DE/FR) ────────────────────
echo "Scenario A — stale database (no DE/FR locale columns):"
FAKE_EXISTING_COLS="nameEn descriptionEn nameIt descriptionIt"
: > "$MUT_LOG_FILE"
migrate_0033_product_locales_de_fr
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "ALTER TABLE \`products\` ADD \`nameDe\` varchar(255) NULL" "adds products.nameDe"
assert_contains "$A_LOG" "ALTER TABLE \`products\` ADD \`descriptionDe\` text NULL" "adds products.descriptionDe"
assert_contains "$A_LOG" "ALTER TABLE \`products\` ADD \`nameFr\` varchar(255) NULL" "adds products.nameFr"
assert_contains "$A_LOG" "ALTER TABLE \`products\` ADD \`descriptionFr\` text NULL" "adds products.descriptionFr"
assert_not_contains "$A_LOG" "UPDATE \`products\`" "no data backfill — locales are nullable"
assert_not_contains "$A_LOG" "ADD \`nameIt\`" "leaves the already-present Italian columns alone"

# ── Scenario B: half-migrated database (DE applied, FR not) ───────────────────
# A run interrupted between statements must resume, not re-issue what landed.
echo "Scenario B — half-migrated database (DE present, FR missing):"
FAKE_EXISTING_COLS="nameEn descriptionEn nameDe descriptionDe"
: > "$MUT_LOG_FILE"
migrate_0033_product_locales_de_fr
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "ADD \`nameDe\`" "does not re-add the existing nameDe"
assert_not_contains "$B_LOG" "ADD \`descriptionDe\`" "does not re-add the existing descriptionDe"
assert_contains "$B_LOG" "ADD \`nameFr\`" "still adds the missing nameFr"
assert_contains "$B_LOG" "ADD \`descriptionFr\`" "still adds the missing descriptionFr"

# ── Scenario C: up-to-date database (idempotency) ─────────────────────────────
echo "Scenario C — up-to-date database (idempotency):"
FAKE_EXISTING_COLS="nameEn descriptionEn nameDe descriptionDe nameFr descriptionFr nameIt descriptionIt"
: > "$MUT_LOG_FILE"
migrate_0033_product_locales_de_fr
C_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$C_LOG" "ALTER TABLE" "no statements at all on re-run"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
