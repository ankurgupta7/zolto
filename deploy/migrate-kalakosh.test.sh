#!/bin/bash
# deploy/migrate-kalakosh.test.sh — tests for deploy/migrate-kalakosh.sh
#
# Plain bash, no framework. Run with:
#
#   bash deploy/migrate-kalakosh.test.sh
#
# Two things are worth testing here and they need different treatment.
#
# `decide_action` is the branch that can DELETE a tenant's catalogue, so it is
# written as a pure function of five counts and tested directly — no database,
# no Docker, every combination cheap to enumerate. The bug it exists to prevent
# is real and was hit by hand: 158 products imported with zero photos, and a
# re-run silently did nothing because the importer matches by name and skips.
#
# The orchestration is exercised end to end against a stubbed `docker` ($DOCKER_BIN
# exists for exactly this), which asserts that a failed diagnostic stops the run
# BEFORE anything is written — the property the whole script is for.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILURES=0
PASSES=0

pass() {
  PASSES=$((PASSES + 1))
  echo "  ok - $1"
}
fail() {
  FAILURES=$((FAILURES + 1))
  echo "  NOT OK - $1"
}
assert_eq() {
  if [[ "$1" == "$2" ]]; then pass "$3"; else fail "$3 (expected '$2', got '$1')"; fi
}
assert_contains() {
  if [[ "$1" == *"$2"* ]]; then pass "$3"; else fail "$3 (expected to find '$2')"; fi
}
assert_not_contains() {
  if [[ "$1" != *"$2"* ]]; then pass "$3"; else fail "$3 (did NOT expect '$2')"; fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

MIGRATE="${SCRIPT_DIR}/migrate-kalakosh.sh"

# Pull in the pure helpers without running any orchestration.
MIGRATE_KALAKOSH_LIB_ONLY=1 . "$MIGRATE"

# ── is_placeholder ────────────────────────────────────────────────────────────
echo ""
echo "is_placeholder:"

for value in "" "your_access_key" "https://your_account_id.r2.cloudflarestorage.com" \
  "change_me_db_password" "your_secret_key"; do
  if is_placeholder "$value"; then
    pass "flags '${value:-<empty>}'"
  else
    fail "flags '${value:-<empty>}'"
  fi
done

for value in "0037871c25c6a230000000001" "https://s3.eu-central-003.backblazeb2.com" "zolto-images"; do
  if is_placeholder "$value"; then
    fail "accepts a real value '$value'"
  else
    pass "accepts a real value '$value'"
  fi
done

# ── decide_action ─────────────────────────────────────────────────────────────
echo ""
echo "decide_action (dest, src, dest_photos, src_photos, orders):"

assert_eq "$(decide_action 0 158 0 10 0)" "import" \
  "an empty tenant imports"
assert_eq "$(decide_action 158 158 10 10 0)" "nothing" \
  "a complete import needs nothing"
assert_eq "$(decide_action 158 158 10 10 42)" "nothing" \
  "orders do not matter when there is nothing to do"

# The exact state this run produced: everything imported, no photo landed.
assert_eq "$(decide_action 158 158 0 10 0)" "reimport" \
  "a photoless import is repaired, not left alone"
assert_eq "$(decide_action 158 158 3 10 0)" "reimport" \
  "a partially photographed import is also repaired"

# The guard that matters: never replace products an order references.
assert_eq "$(decide_action 158 158 0 10 1)" "blocked-orders" \
  "one order is enough to refuse the destructive path"
assert_eq "$(decide_action 158 158 0 10 99)" "blocked-orders" \
  "and stays refused for many"

assert_eq "$(decide_action 100 158 10 10 0)" "import" \
  "a short catalogue tops up rather than wiping"
assert_eq "$(decide_action 0 0 0 0 0)" "empty-source" \
  "an empty source is refused rather than treated as success"
assert_eq "$(decide_action 158 0 10 0 0)" "empty-source" \
  "an empty source never triggers a wipe of a populated tenant"

# A source with no photos at all must not look like a broken import forever.
assert_eq "$(decide_action 158 158 0 0 0)" "nothing" \
  "no photos anywhere is a complete migration, not a repair loop"

# ── Orchestration: diagnostics stop the run ───────────────────────────────────
echo ""
echo "diagnostics stop the run before anything is written:"

make_env() { # make_env <file> [s3_key] [s3_endpoint]
  cat >"$1" <<ENVEOF
MYSQL_USER=zolto_user
MYSQL_PASSWORD=pw
MYSQL_DATABASE=zolto
S3_BUCKET=zolto-images
S3_REGION=eu-central-003
S3_ENDPOINT=${3:-https://s3.eu-central-003.backblazeb2.com}
S3_ACCESS_KEY_ID=${2:-realkeyid}
S3_SECRET_ACCESS_KEY=realsecret
ENVEOF
}

# A docker stub scripted by $STUB_TENANT: it answers the ping, reports a
# network, and returns the tenant row (or nothing, for the no-tenant case).
DOCKER_STUB="$WORK/docker-stub"
cat >"$DOCKER_STUB" <<'STUB'
#!/bin/bash
{ printf '%s\n' "$*"; } >>"$STUB_CALLS"
case "$*" in
  *"SELECT 1;"*)                      echo "1" ;;
  *"FROM tenants WHERE slug"*)        printf '%s' "${STUB_TENANT:-}"; [ -n "${STUB_TENANT:-}" ] && echo "" ;;
  *"FROM tenants ORDER BY id"*)       echo "    1  platform  (free)" ;;
  *"compose ps -q db"*)               echo "dbcontainerid" ;;
  *inspect*NetworkSettings*)          echo "zolto_internal" ;;
  *"FROM tenant_categories"*)         echo "10" ;;
  *"ps -q --filter"*)                 echo "" ;;
  *"image inspect"*)                  exit 1 ;;
  *) echo "0" ;;
esac
exit 0
STUB
chmod +x "$DOCKER_STUB"
export STUB_CALLS="$WORK/docker-calls"

# 1. No tenant → refuse, and say how to create one properly.
make_env "$WORK/a.env"
: >"$STUB_CALLS"
OUT="$(DOCKER_BIN="$DOCKER_STUB" STUB_TENANT="" \
  bash "$MIGRATE" --env "$WORK/a.env" --diagnose 2>&1)"
assert_contains "$OUT" "no tenant with slug 'kalakosh'" "refuses when the tenant is missing"
assert_contains "$OUT" "signup" "points at signup rather than an INSERT"
assert_not_contains "$(cat "$STUB_CALLS")" "DELETE FROM products" \
  "and writes nothing on the way out"

# 2. Placeholder S3 → refuse, naming the real consequence.
make_env "$WORK/b.env" "your_access_key" "https://your_account_id.r2.cloudflarestorage.com"
: >"$STUB_CALLS"
OUT="$(DOCKER_BIN="$DOCKER_STUB" STUB_TENANT="6 free" \
  bash "$MIGRATE" --env "$WORK/b.env" --diagnose 2>&1)"
assert_contains "$OUT" "still holds .env.example placeholders" \
  "refuses an unconfigured storage layer"
assert_contains "$OUT" "would still report zero failures" \
  "explains that the import would otherwise look successful"

# 3. Missing .env → refuse before touching Docker.
: >"$STUB_CALLS"
OUT="$(DOCKER_BIN="$DOCKER_STUB" bash "$MIGRATE" --env "$WORK/nope.env" --diagnose 2>&1)"
assert_contains "$OUT" "does not exist" "refuses a missing .env"
assert_eq "$(wc -l <"$STUB_CALLS" | tr -d ' ')" "0" "without invoking docker at all"

# 4. --diagnose never creates the scratch container or builds an image.
make_env "$WORK/c.env"
: >"$STUB_CALLS"
DOCKER_BIN="$DOCKER_STUB" STUB_TENANT="6 free" \
  bash "$MIGRATE" --env "$WORK/c.env" --diagnose >/dev/null 2>&1
CALLS="$(cat "$STUB_CALLS")"
assert_not_contains "$CALLS" "run -d --name" "--diagnose starts no scratch container"
assert_not_contains "$CALLS" "build --target" "--diagnose builds no image"
assert_not_contains "$CALLS" "DELETE FROM" "--diagnose deletes nothing"

# 5. The unsafe .env read the script exists to replace must not reappear.
#    Comments may name it; only executable lines are checked.
UNSAFE_SOURCE="$(grep -vE '^[[:space:]]*#' "$MIGRATE" | grep -cE 'set -a|^[[:space:]]*\. .*\.env|source .*\.env' || true)"
assert_eq "$UNSAFE_SOURCE" "0" \
  "never sources .env (a value with backticks would execute)"
assert_contains "$(cat "$MIGRATE")" "load_dotenv" "uses the literal parser instead"

# 6. The source is addressed by IP, not by a name Docker's DNS may not hold.
assert_contains "$(cat "$MIGRATE")" 'KALAKOSH_DATABASE_URL="mysql://root:${SCRATCH_PASSWORD}@${SRC_IP}' \
  "connects to the scratch source by IP"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "──────────────────────────────────────────"
if [ "$FAILURES" -eq 0 ]; then
  echo "  $PASSES passed, 0 failed"
  exit 0
else
  echo "  $PASSES passed, $FAILURES failed"
  exit 1
fi
