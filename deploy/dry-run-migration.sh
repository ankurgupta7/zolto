#!/bin/bash
# deploy/dry-run-migration.sh — exercise migration 0019 against a COPY of the
# production database in a throwaway container. Never touches prod.
#
# It loads a mysqldump into a disposable MySQL container, runs
# migrate_0019_multitenant TWICE (to prove idempotency on real data), and
# verifies that:
#   - every tenant-scoped table ends with a NOT NULL tenant_id
#   - tenant #1 and its settings are seeded
#   - row counts are identical before and after (no data lost or duplicated)
# then tears the container down. Prints a PASS/FAIL report (no customer data).
#
#   Usage:  bash deploy/dry-run-migration.sh <dump.sql> [docker-image]
#     dump.sql       a mysqldump of the production DB (single DB, no --databases)
#     docker-image   MySQL image to test against (default: mysql:8.0).
#                    Match production — see `version` from deploy/inspect-db.sh
#                    (e.g. mysql:8.0, mysql:8.4, mariadb:10.11).
#
#   Make the dump on the server with, e.g.:
#     docker compose exec -T db mysqldump -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" \
#       "$MYSQL_DATABASE" > /tmp/kalakosh-dump.sql
#
set -uo pipefail

DUMP="${1:-}"
IMAGE="${2:-mysql:8.0}"

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "ERROR: pass a path to a mysqldump file. See usage at the top of this script." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker is required." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CTR="zolto-migration-dryrun-$$"
ROOT_PW="dryrunpw"
DB="dryrun"
FAILURES=0

pass() { echo "  PASS - $1"; }
failed() { FAILURES=$((FAILURES + 1)); echo "  FAIL - $1"; }

cleanup() { docker rm -f "$CTR" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "════════════════════════════════════════════════════════════════"
echo " Migration 0019 dry-run against a COPY (image: ${IMAGE})"
echo "════════════════════════════════════════════════════════════════"

echo "→ starting throwaway ${IMAGE} …"
docker run -d --name "$CTR" \
  -e MYSQL_ROOT_PASSWORD="$ROOT_PW" -e MYSQL_DATABASE="$DB" \
  "$IMAGE" >/dev/null

MYSQLC() { docker exec -i "$CTR" mysql -uroot -p"$ROOT_PW" "$@"; }

echo -n "→ waiting for MySQL to accept connections "
for i in $(seq 1 60); do
  if MYSQLC -e "SELECT 1" >/dev/null 2>&1; then echo " ready"; break; fi
  echo -n "."; sleep 2
  [ "$i" -lt 60 ] || { echo; echo "ERROR: container never became ready" >&2; exit 1; }
done

echo "→ loading dump into '${DB}' (stripping any CREATE DATABASE/USE lines) …"
# Route everything into the throwaway DB regardless of what the dump targets.
sed -E '/^\s*(CREATE DATABASE|USE )/Id' "$DUMP" | MYSQLC "$DB"

TABLES="users products product_images instagram_posts orders bulk_upload_logs pos_orders pos_order_items returns stripe_reconciliations"

# Capture BEFORE row counts.
declare -A BEFORE
for t in $TABLES; do
  BEFORE[$t]=$(MYSQLC -N -s "$DB" -e "SELECT COUNT(*) FROM \`$t\`;" 2>/dev/null || echo "MISSING")
done

# ── Run the migration against the copy, twice ────────────────────────────────
# Point db.sh's helpers at the throwaway container.
ok() { :; }
warn() { echo "    (warn) $*"; }
die() { echo "  MIGRATION ERROR: $*" >&2; MIGRATION_DIED=1; }
export MYSQL_DATABASE="$DB"
# shellcheck source=/dev/null
source "${REPO_ROOT}/deploy/lib/db.sh"
MYSQL="docker exec -i ${CTR} mysql -uroot -p${ROOT_PW} ${DB}"
POS_API_KEY="dryrun-pos-key"   # value irrelevant on a throwaway DB

MIGRATION_DIED=0
echo "→ running migrate_0019_multitenant (run 1) …"
t0=$(date +%s)
migrate_0019_multitenant
echo "→ running migrate_0019_multitenant (run 2 — idempotency) …"
migrate_0019_multitenant
t1=$(date +%s)
echo "   (both runs took $((t1 - t0))s)"

echo
echo "── Verification ────────────────────────────────────────────────"
[ "$MIGRATION_DIED" = "0" ] && pass "migration completed without errors" || failed "migration raised an error (see above)"

# tenant_id NOT NULL on every table; row counts preserved.
for t in $TABLES; do
  nullable=$(MYSQLC -N -s "$DB" -e "SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${DB}' AND TABLE_NAME='${t}' AND COLUMN_NAME='tenant_id';" 2>/dev/null)
  if [ "$nullable" = "NO" ]; then pass "${t}.tenant_id is NOT NULL"; else failed "${t}.tenant_id nullability = '${nullable:-absent}' (expected NO)"; fi

  after=$(MYSQLC -N -s "$DB" -e "SELECT COUNT(*) FROM \`$t\`;" 2>/dev/null || echo "MISSING")
  if [ "${BEFORE[$t]}" = "$after" ]; then
    pass "${t} row count preserved (${after})"
  else
    failed "${t} row count changed: ${BEFORE[$t]} → ${after}"
  fi

  orphans=$(MYSQLC -N -s "$DB" -e "SELECT COUNT(*) FROM \`$t\` WHERE tenant_id IS NULL OR tenant_id <> 1;" 2>/dev/null || echo "?")
  if [ "$orphans" = "0" ]; then pass "${t} rows all backfilled to tenant 1"; else failed "${t} has ${orphans} rows not on tenant 1"; fi
done

# Seed checks. (slug is configurable via SEED_TENANT_SLUG; default 'platform'.)
tcount=$(MYSQLC -N -s "$DB" -e "SELECT COUNT(*) FROM tenants WHERE id=1;" 2>/dev/null || echo 0)
seed_slug=$(MYSQLC -N -s "$DB" -e "SELECT slug FROM tenants WHERE id=1;" 2>/dev/null || echo "?")
[ "$tcount" = "1" ] && pass "tenant #1 seeded (slug='${seed_slug}')" || failed "tenant #1 not seeded (got ${tcount})"
scount=$(MYSQLC -N -s "$DB" -e "SELECT COUNT(*) FROM tenant_settings WHERE tenant_id=1;" 2>/dev/null || echo 0)
[ "$scount" = "1" ] && pass "tenant #1 settings seeded" || failed "tenant #1 settings not seeded (got ${scount})"
dupe=$(MYSQLC -N -s "$DB" -e "SELECT COUNT(*) FROM tenants;" 2>/dev/null || echo 0)
[ "$dupe" = "1" ] && pass "exactly one tenant row (no duplicate seed on 2nd run)" || failed "expected 1 tenant row, found ${dupe}"

echo
echo "════════════════════════════════════════════════════════════════"
if [ "$FAILURES" -eq 0 ]; then
  echo " ✅ DRY-RUN PASSED — migration is safe against this data copy."
else
  echo " ❌ DRY-RUN FAILED — ${FAILURES} check(s) failed. Do NOT deploy; share the output."
fi
echo "════════════════════════════════════════════════════════════════"
[ "$FAILURES" -eq 0 ]
