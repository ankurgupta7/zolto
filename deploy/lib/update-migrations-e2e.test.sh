#!/bin/bash
# deploy/lib/update-migrations-e2e.test.sh — end-to-end test of update.sh's
# migration stream.
#
# Runs the REAL update.sh (like update-fast-path.test.sh, whose sandbox this
# mirrors) against a fake `docker` that impersonates a STALE database — every
# probe answers "missing" and every enum reports its oldest shape — and records
# each SQL statement the script sends. Nothing here touches a daemon, database
# or network. Run with:
#
#   bash deploy/lib/update-migrations-e2e.test.sh
#
# Why this exists on top of the per-migration unit tests: those call one
# migrate_* function at a time. What production runs is the whole block in
# sequence, and the bugs that reached production lived between the units —
# a migration authored in drizzle/*.sql but never invoked from update.sh at
# all (0007 → "Unknown column 'nameDe' in 'field list'", 0014 → magic-link
# sign-in writing to a nonexistent table). So: drive the full script and
# assert on the statement stream itself —
#
#   - a cold/stale database receives every product column the storefront
#     query selects (nameEn/De/Fr/It + descriptions) and every table the
#     server writes (magic_link_tokens included);
#   - the schema fingerprint is recorded strictly AFTER the last DDL, never
#     before (recording early would let a later deploy skip a half-applied
#     schema);
#   - an up-to-date database gets NO DDL from the same block (idempotency of
#     the set as wired, not of each helper in isolation).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILURES=0
PASSES=0

pass() { PASSES=$((PASSES + 1)); echo "  ok - $1"; }
fail() {
  FAILURES=$((FAILURES + 1))
  echo "  NOT OK - $1"
  [ -n "${2:-}" ] && printf '%s\n' "$2" | tail -25 | sed 's/^/      /'
}

assert_contains() { # assert_contains haystack needle description
  if [[ "$1" == *"$2"* ]]; then pass "$3"; else fail "$3 (expected: $2)" "$1"; fi
}

assert_not_contains() { # assert_not_contains haystack needle description
  if [[ "$1" != *"$2"* ]]; then pass "$3"; else fail "$3 (did NOT expect: $2)" "$1"; fi
}

SANDBOX="$(mktemp -d)"
trap 'rm -rf "${SANDBOX}"' EXIT

FAKE_BIN="${SANDBOX}/bin"
mkdir -p "${FAKE_BIN}"

# ── Fake `docker` ─────────────────────────────────────────────────────────────
# Same steering as update-fast-path.test.sh, plus FAKE_DB_STATE:
#   stale    — every existence probe answers 0/missing, every enum reports its
#              pre-migration shape, tenant_id columns are nullable: the oldest
#              database update.sh still supports.
#   current  — every probe answers 1/present, enums carry their final values:
#              a database the block has already fully migrated.
cat > "${FAKE_BIN}/docker" <<'FAKE_DOCKER'
#!/bin/bash
echo "$*" >> "${FAKE_DOCKER_LOG}"

sql="${!#}"

case "$1 $2" in
  "info ")            exit 0 ;;
  "compose build")    exit 0 ;;
  "compose up")       exit 0 ;;
  "compose config")   echo "name: zolto"; exit 0 ;;
  "container prune")  echo "0B"; exit 0 ;;
  "image prune")      echo "0B"; exit 0 ;;
  "builder prune")    echo "Total: 0B"; exit 0 ;;
  "network prune")    exit 0 ;;
  "image inspect")    echo "<no value>"; exit 0 ;;
  "inspect --format") echo "sha256:fakeimage"; exit 0 ;;
esac

if [ "$1 $2" = "compose ps" ]; then
  case "$*" in
    *"-q app")   ;;                      # nothing running: always a cold host
    *"-q caddy") ;;
    *"-q db")    echo "dbcid" ;;
    *--format*)  echo '{"Service":"app","State":"running","Health":"healthy"}' ;;
    *)           echo "NAME  STATUS" ;;
  esac
  exit 0
fi

if [ "$1 $2" = "compose exec" ]; then
  case "$*" in
    *"dist/public/index.html"*) echo "assets/index-fake123.js"; exit 0 ;;
  esac

  if [ "${FAKE_DB_STATE}" = "stale" ]; then
    case "$sql" in
      *"FROM \`deploy_state\`"*) ;;      # nothing recorded → migrations run
      *"SELECT 1"*)              ;;
      *"IS_NULLABLE"*)           echo "YES" ;;
      *"COLUMN_TYPE"*)
        # The oldest shape every enum check knows: material categories
        # (0011), no 'upsert_images' (0018), old plan tiers (0023/0027),
        # no 'twint_qr' (0031), the baseline 'user' role (0032).
        echo "enum('Silver','Semi-Precious Gems','Pearls','user','admin','starter','maker','card','cash','twint','analyze','create')" ;;
      *"COUNT(*)"*)              echo "0" ;;
      *)                         ;;
    esac
  else
    case "$sql" in
      *"FROM \`deploy_state\`"*) ;;      # still unrecorded → block runs anyway
      *"SELECT 1"*)              ;;
      *"IS_NULLABLE"*)           echo "NO" ;;
      # 0036 converted products.category to varchar — an up-to-date database
      # no longer reports an enum for it.
      *"COLUMN_NAME='category'"*) echo "varchar(64)" ;;
      *"COLUMN_TYPE"*)
        echo "enum('Necklaces','Sets','free','pro','upsert_images','twint_qr','superadmin','staff','customer')" ;;
      # 0030 DROPS tenants.plan_price_override, so on an up-to-date database
      # that one existence probe answers "gone" while everything else exists.
      *"plan_price_override"*)   echo "0" ;;
      *"COUNT(*)"*)              echo "1" ;;
      *)                         ;;
    esac
  fi
  exit 0
fi

exit 0
FAKE_DOCKER
chmod +x "${FAKE_BIN}/docker"

cat > "${FAKE_BIN}/crontab" <<'FAKE_CRON'
#!/bin/bash
[ "${1:-}" = "-l" ] && { echo "0 2 * * 0 cd /srv/zolto && ./deploy/backup.sh"; exit 0; }
cat > /dev/null
exit 0
FAKE_CRON
chmod +x "${FAKE_BIN}/crontab"

# ── A repo that looks like the deployed checkout, with a real origin ──────────
mkdir -p "${SANDBOX}/repo"
cd "${SANDBOX}/repo" || exit 1
cp "${REPO_ROOT}/update.sh" .
cp "${REPO_ROOT}/Dockerfile" .
cp "${REPO_ROOT}/.dockerignore" .
mkdir -p deploy/lib client/src server
cp "${REPO_ROOT}"/deploy/lib/{db.sh,env.sh,caddy.sh,build.sh} deploy/lib/
echo "export const App = 1" > client/src/App.tsx
echo "export const api = 1" > server/index.ts
echo '{"name":"zolto"}' > package.json
printf '.env\nnode_modules\n' > .gitignore
cat > .env <<'ENV'
MYSQL_USER=zolto
MYSQL_PASSWORD=secret
MYSQL_DATABASE=zolto
ENV
git init -q -b main .
git config user.email test@example.com
git config user.name Test
git add -A
git commit -qm "deployed state"
git init -q --bare "${SANDBOX}/origin.git"
git remote add origin "${SANDBOX}/origin.git"
git push -q -u origin main

FAKE_DOCKER_LOG="${SANDBOX}/docker.log"
export FAKE_DOCKER_LOG

run_update() { # run_update DB_STATE
  cd "${SANDBOX}/repo" || exit 1
  : > "${FAKE_DOCKER_LOG}"
  PATH="${FAKE_BIN}:${PATH}" \
  FAKE_DOCKER_LOG="${FAKE_DOCKER_LOG}" \
  FAKE_DB_STATE="$1" \
    bash update.sh 2>&1
}

echo ""
echo "── A stale database receives the full statement stream ──────────────────"

OUT="$(run_update stale)"
LOG="$(cat "${FAKE_DOCKER_LOG}")"

assert_contains "$OUT" "Update complete" "the deploy completes"
assert_contains "$OUT" "Applying database migrations" "the migration block runs"

# The columns whose absence took the storefront down: every locale column the
# products SELECT names must be created on the oldest database the script
# supports. This is the runtime twin of deploy/schemaDrift.test.ts.
for col in "nameEn\` varchar(255)" "descriptionEn\` text" \
           "nameDe\` varchar(255)" "descriptionDe\` text" \
           "nameFr\` varchar(255)" "descriptionFr\` text" \
           "nameIt\` varchar(255)" "descriptionIt\` text"; do
  assert_contains "$LOG" "ALTER TABLE \`products\` ADD \`${col}" \
    "products gains ${col%%\`*}"
done

assert_contains "$LOG" "CREATE TABLE IF NOT EXISTS \`magic_link_tokens\`" \
  "magic_link_tokens is created"
assert_contains "$LOG" "ALTER TABLE \`products\` ADD \`reserved_until\`" \
  "the checkout-hold columns are created"
assert_contains "$LOG" "ALTER TABLE \`orders\` ADD \`platform_fee_rappen\`" \
  "the platform-fee column is created"
assert_contains "$OUT" "0033 add products.nameDe" "0033 reports each column it adds"
assert_contains "$OUT" "0034 magic_link_tokens table" "0034 reports the table it creates"
assert_contains "$LOG" "CREATE TABLE IF NOT EXISTS \`tenant_categories\`" \
  "tenant_categories is created"
assert_contains "$LOG" "MODIFY COLUMN \`category\` varchar(64)" \
  "products.category is converted to varchar"
assert_contains "$OUT" "0036 seed jewellery categories" \
  "0036 seeds the jewellery preset for existing tenants"
# 0041: the custom-domain uniqueness index. A stale database has no duplicate
# rows (the probe answers 0), so the index is created rather than skipped.
assert_contains "$LOG" "CREATE UNIQUE INDEX \`tenant_settings_public_domain_unique\`" \
  "tenant_settings.public_domain gains its unique index"

# Ordering: the fingerprint INSERT must be the last mutating statement — a
# fingerprint recorded before the final DDL would let the next deploy skip a
# half-applied schema.
FP_LINE="$(printf '%s\n' "$LOG" | grep -n "INSERT INTO \`deploy_state\`" | head -1 | cut -d: -f1)"
LAST_DDL_LINE="$(printf '%s\n' "$LOG" | grep -n -E "ALTER TABLE|CREATE UNIQUE INDEX|CREATE TABLE IF NOT EXISTS \`(magic_link_tokens|rate_limit_windows)\`" | tail -1 | cut -d: -f1)"
if [ -n "$FP_LINE" ] && [ -n "$LAST_DDL_LINE" ] && [ "$FP_LINE" -gt "$LAST_DDL_LINE" ]; then
  pass "the schema fingerprint is recorded after the last DDL (line ${FP_LINE} > ${LAST_DDL_LINE})"
else
  fail "expected the fingerprint INSERT (line ${FP_LINE:-none}) after the last DDL (line ${LAST_DDL_LINE:-none})"
fi

echo ""
echo "── An up-to-date database gets no DDL from the same block ───────────────"

OUT2="$(run_update current)"
LOG2="$(cat "${FAKE_DOCKER_LOG}")"

assert_contains "$OUT2" "Update complete" "the deploy completes"
assert_contains "$OUT2" "0033 products.nameDe already exists" "0033 takes its already-applied branch"
assert_contains "$OUT2" "0034 magic_link_tokens already exists" "0034 takes its already-applied branch"
assert_contains "$OUT2" "0036 products.category already varchar" "0036 takes its already-applied branch"
assert_not_contains "$LOG2" "ALTER TABLE \`products\`" "no products DDL is re-issued"
assert_not_contains "$LOG2" "ALTER TABLE \`orders\`" "no orders DDL is re-issued"
assert_not_contains "$LOG2" "ALTER TABLE \`users\`" "no users DDL is re-issued"
assert_not_contains "$LOG2" "ALTER TABLE \`tenants\`" "no tenants DDL is re-issued"
assert_contains "$OUT2" "0041 tenant_settings.public_domain already unique" \
  "0041 takes its already-applied branch"
assert_not_contains "$LOG2" "CREATE UNIQUE INDEX" "no unique index is re-created"
assert_contains "$LOG2" "INSERT INTO \`deploy_state\`" "the fingerprint is still recorded"

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "FAILED: ${FAILURES} failed, ${PASSES} passed"
  exit 1
fi
echo "PASSED: ${PASSES} assertions"
