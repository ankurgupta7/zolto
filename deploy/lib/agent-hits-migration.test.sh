#!/bin/bash
# deploy/lib/agent-hits-migration.test.sh — tests for migrate_0048_agent_hits.
#
# Plain bash, no framework and no real DB. Sources db.sh and drives the
# migration with a fake $MYSQL that answers the information_schema probes from
# scenario variables and records every mutating statement.
#
# Why the shape matters, and why this test exists at all: server/db.ts
# recordAgentHit is an INSERT … ON DUPLICATE KEY UPDATE, and in MySQL that fires
# ONLY on a PRIMARY KEY or UNIQUE collision. `id` is autoincrement and never
# supplied, so `agent_hits_bucket` is the only thing standing between "one
# counter row per bucket" and "one row per request, forever, on /mcp" — an
# endpoint an AI agent can loop on. The failure is silent: the numbers still
# look plausible, the table just grows without bound.
#
# The two NOT NULL DEFAULTs are load-bearing for the same reason. MySQL treats
# NULLs as distinct in a UNIQUE index, so a nullable tenant_id (the platform
# surface) or mcp_tool (a non-MCP hit) would never collide with itself and those
# two cases would degrade to the same unbounded log.
#
#   run with:  bash deploy/lib/agent-hits-migration.test.sh

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
echo "Scenario A — agent_hits missing:"
FAKE_TABLE_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0048_agent_hits
A_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$A_LOG" "CREATE TABLE IF NOT EXISTS \`agent_hits\`" "creates agent_hits"

for col in id tenant_id day surface mcp_tool agent count createdAt updatedAt; do
  assert_contains "$A_LOG" "\`${col}\`" "creates agent_hits.${col}"
done

# The upsert key. Without it the whole table is a per-request log.
assert_contains "$A_LOG" \
  "CONSTRAINT \`agent_hits_bucket\` UNIQUE(\`tenant_id\`,\`day\`,\`surface\`,\`mcp_tool\`,\`agent\`)" \
  "the bucket UNIQUE key exists — it is what makes recordAgentHit an update"

# The two sentinel columns. NULL here would defeat the UNIQUE key above for the
# platform surface and for every non-MCP hit.
assert_matches "$A_LOG" '`tenant_id` +int NOT NULL DEFAULT 0' \
  "tenant_id is NOT NULL with a 0 sentinel — NULL would never collide in the key"
assert_matches "$A_LOG" "\`mcp_tool\` +varchar\(64\) NOT NULL DEFAULT ''" \
  "mcp_tool is NOT NULL with an empty sentinel — same reason"

assert_matches "$A_LOG" '`count` +int NOT NULL DEFAULT 0' \
  "count starts at zero rather than NULL, so the upsert can add to it"
assert_matches "$A_LOG" '`day` +varchar\(10\) NOT NULL' \
  "day is the UTC YYYY-MM-DD bucket key"

# This table answers "is anything reading my shop", never "who visited". It has
# no business holding anything that could identify one caller.
assert_not_contains "$A_LOG" "ip" "stores no IP address"
assert_not_contains "$A_LOG" "user_agent" "stores no raw User-Agent, only a label"

# ── Scenario B: table present, index present (idempotency) ────────────────────
echo "Scenario B — agent_hits already present (idempotency):"
FAKE_TABLE_EXISTS=1
FAKE_INDEX_EXISTS=1
: > "$MUT_LOG_FILE"
migrate_0048_agent_hits
B_LOG="$(cat "$MUT_LOG_FILE")"
assert_not_contains "$B_LOG" "CREATE TABLE" "no CREATE TABLE on re-run"
assert_not_contains "$B_LOG" "ADD CONSTRAINT" "no index churn on re-run"

# ── Scenario C: table present but the unique key is gone ──────────────────────
# The silent-corruption case: everything works, nothing errors, and the table
# grows a row per request instead of counting.
echo "Scenario C — agent_hits present without its unique key:"
FAKE_TABLE_EXISTS=1
FAKE_INDEX_EXISTS=0
: > "$MUT_LOG_FILE"
migrate_0048_agent_hits
C_LOG="$(cat "$MUT_LOG_FILE")"
assert_contains "$C_LOG" "ADD CONSTRAINT \`agent_hits_bucket\` UNIQUE" \
  "restores the bucket key so the upsert counts instead of accumulating"
assert_not_contains "$C_LOG" "CREATE TABLE" "does not recreate the existing table"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
