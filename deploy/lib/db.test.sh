#!/bin/bash
# deploy/lib/db.test.sh — tests for deploy/lib/db.sh
#
# Plain bash, no framework: sources the real db.sh and exercises it against a
# fake `docker` executable so no actual Docker/MySQL is required. Run with:
#
#   bash deploy/lib/db.test.sh
#
# Regression target: a migration blocked on a lock used to hang update.sh
# forever, and when a migration genuinely failed, the real MySQL error was
# discarded (2>/dev/null) leaving only "Migration failed: <label>" with no
# way to diagnose it. These tests assert the fix: every $MYSQL invocation
# carries a connect + lock-wait timeout, and a failed run_sql prints the
# real error.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILURES=0
PASSES=0

pass() { PASSES=$((PASSES + 1)); echo "  ok - $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "  NOT OK - $1"; }

assert_contains() { # assert_contains "haystack" "needle" "description"
  if [[ "$1" == *"$2"* ]]; then
    pass "$3"
  else
    fail "$3 (expected to find: $2)"
    echo "    --- actual output ---"
    echo "$1" | sed 's/^/    /'
    echo "    ---------------------"
  fi
}

assert_eq() { # assert_eq actual expected description
  if [[ "$1" == "$2" ]]; then
    pass "$3"
  else
    fail "$3 (expected '$2', got '$1')"
  fi
}

# ── log/ok/warn/die: mirror update.sh's definitions exactly ───────────────────
# (kept minimal and duplicated deliberately — these are stable one-liners; if
# update.sh's versions ever diverge meaningfully, pull them into a shared
# deploy/lib/log.sh alongside db.sh.)
log()  { echo "==> $*"; }
ok()   { echo "  OK $*"; }
warn() { echo "  WARN $*"; }
die()  { echo "FATAL: $*"; exit 1; }

# ── Fake `docker` on PATH so db.sh never touches a real Docker/MySQL ──────────
FAKE_BIN_DIR="$(mktemp -d)"
FAKE_CALL_LOG="$(mktemp)"
trap 'rm -rf "${FAKE_BIN_DIR}" "${FAKE_CALL_LOG}"' EXIT

cat > "${FAKE_BIN_DIR}/docker" <<'FAKE_DOCKER'
#!/bin/bash
# Records the full argv it was called with, then fakes a mysql response
# controlled by FAKE_DOCKER_MODE / FAKE_DOCKER_STDOUT / FAKE_DOCKER_STDERR.
echo "$@" >> "${FAKE_CALL_LOG}"

case "${FAKE_DOCKER_MODE:-success}" in
  success)
    [ -n "${FAKE_DOCKER_STDOUT:-}" ] && echo "${FAKE_DOCKER_STDOUT}"
    exit 0
    ;;
  fail)
    echo "${FAKE_DOCKER_STDERR:-simulated mysql error}" >&2
    exit 1
    ;;
esac
FAKE_DOCKER
chmod +x "${FAKE_BIN_DIR}/docker"

export PATH="${FAKE_BIN_DIR}:${PATH}"
export FAKE_CALL_LOG
# Marked for export up front so every later plain `FAKE_DOCKER_MODE=...`
# assignment (not just the inline VAR=val prefix form) reaches the forked
# fake `docker` process.
export FAKE_DOCKER_MODE FAKE_DOCKER_STDOUT FAKE_DOCKER_STDERR

# ── Fixture env vars (mirrors what update.sh loads from .env) ─────────────────
export MYSQL_USER="testuser"
export MYSQL_PASSWORD="testpass"
export MYSQL_DATABASE="testdb"

# shellcheck source=./db.sh
source "${SCRIPT_DIR}/db.sh"

reset_call_log() { : > "${FAKE_CALL_LOG}"; }

echo "build_mysql_cmd"
MYSQL="$(build_mysql_cmd)"
assert_contains "$MYSQL" "--connect-timeout=10" \
  "the mysql command sets a connection timeout"
assert_contains "$MYSQL" "-u${MYSQL_USER}" "the mysql command includes the configured user"
assert_contains "$MYSQL" "${MYSQL_DATABASE}" "the mysql command targets the configured database"

echo "run_sql: success"
FAKE_DOCKER_MODE=success
reset_call_log
OUTPUT=$(run_sql "0000 users table" "CREATE TABLE IF NOT EXISTS users (id int);" 2>&1)
STATUS=$?
assert_eq "$STATUS" "0" "run_sql exits 0 on success"
assert_contains "$OUTPUT" "0000 users table" "run_sql prints the step label on success"
assert_contains "$(cat "${FAKE_CALL_LOG}")" "lock_wait_timeout=15" \
  "every statement is prefixed with a lock-wait timeout"
assert_contains "$(cat "${FAKE_CALL_LOG}")" "innodb_lock_wait_timeout=15" \
  "every statement is prefixed with an innodb lock-wait timeout"

echo "run_sql: failure surfaces the real MySQL error (regression test)"
reset_call_log
OUTPUT=$(FAKE_DOCKER_MODE=fail FAKE_DOCKER_STDERR="ERROR 1205 (HY000): Lock wait timeout exceeded" \
  run_sql "0000 users table" "CREATE TABLE IF NOT EXISTS users (id int);" 2>&1)
STATUS=$?
assert_eq "$STATUS" "1" "run_sql exits non-zero on failure"
assert_contains "$OUTPUT" "Migration failed: 0000 users table" \
  "the failure message names the step"
assert_contains "$OUTPUT" "Lock wait timeout exceeded" \
  "the underlying MySQL error is shown, not swallowed"

echo "col_exists / tbl_exists / idx_exists"
FAKE_DOCKER_MODE=success
FAKE_DOCKER_STDOUT="1"
reset_call_log
RESULT=$(col_exists products quantity)
assert_eq "$RESULT" "1" "col_exists reports 1 when the column is present"
assert_contains "$(cat "${FAKE_CALL_LOG}")" "lock_wait_timeout=15" \
  "col_exists also bounds its query with a lock-wait timeout"

FAKE_DOCKER_MODE=success FAKE_DOCKER_STDOUT="0"
RESULT=$(tbl_exists nonexistent_table)
assert_eq "$RESULT" "0" "tbl_exists reports 0 when the table is absent"

FAKE_DOCKER_MODE=fail FAKE_DOCKER_STDERR="connection refused"
RESULT=$(idx_exists products some_index)
assert_eq "$RESULT" "0" "idx_exists falls back to 0 (not a crash) when mysql itself fails"

# ── deploy_state: the migration fast path ─────────────────────────────────────
# update.sh skips its ~90 idempotent migration round trips when the recorded
# fingerprint matches the current one. The safety property is that every
# uncertain answer — no table yet, unreadable database, empty fingerprint —
# must come back as "not applied", so the migrations run rather than being
# silently skipped against a schema nobody has verified.
echo "deploy_state helpers"

FAKE_DOCKER_MODE=success
FAKE_DOCKER_STDOUT=""
reset_call_log
ensure_deploy_state_table
assert_contains "$(cat "${FAKE_CALL_LOG}")" "CREATE TABLE IF NOT EXISTS" \
  "ensure_deploy_state_table creates the table idempotently"
assert_contains "$(cat "${FAKE_CALL_LOG}")" "deploy_state" \
  "…and it is the deploy_state table"
assert_contains "$(cat "${FAKE_CALL_LOG}")" "lock_wait_timeout=15" \
  "…bounded by the same lock-wait timeout as every other statement"

FAKE_DOCKER_MODE=success FAKE_DOCKER_STDOUT="abc123def456"
RESULT=$(deploy_state_get schema_fingerprint)
assert_eq "$RESULT" "abc123def456" "deploy_state_get returns the stored value"

FAKE_DOCKER_MODE=success FAKE_DOCKER_STDOUT="  abc123  "
RESULT=$(deploy_state_get schema_fingerprint)
assert_eq "$RESULT" "abc123" "deploy_state_get strips the whitespace mysql pads output with"

FAKE_DOCKER_MODE=success FAKE_DOCKER_STDOUT=""
RESULT=$(deploy_state_get schema_fingerprint)
assert_eq "$RESULT" "" "an absent row reads as empty (so the migrations run)"

FAKE_DOCKER_MODE=fail FAKE_DOCKER_STDERR="ERROR 1146: Table 'deploy_state' doesn't exist"
RESULT=$(deploy_state_get schema_fingerprint)
assert_eq "$RESULT" "" "a failed read also reads as empty, never as a match"

FAKE_DOCKER_MODE=success FAKE_DOCKER_STDOUT=""
reset_call_log
deploy_state_set schema_fingerprint "deadbeef"
CALLS="$(cat "${FAKE_CALL_LOG}")"
assert_contains "$CALLS" "ON DUPLICATE KEY UPDATE" "deploy_state_set upserts rather than failing on re-deploy"
assert_contains "$CALLS" "deadbeef" "…writing the fingerprint it was given"

FAKE_DOCKER_MODE=fail FAKE_DOCKER_STDERR="disk full"
deploy_state_set schema_fingerprint "deadbeef"
assert_eq "$?" "0" "a failed write does not abort the deploy (worst case: a slow next run)"

echo "migrations_fingerprint"
FP_DIR="$(mktemp -d)"
printf 'migration one\n' > "${FP_DIR}/update.sh"
printf 'helper one\n'    > "${FP_DIR}/db.sh"

FP_A="$(migrations_fingerprint "${FP_DIR}/update.sh" "${FP_DIR}/db.sh")"
assert_eq "${#FP_A}" "64" "migrations_fingerprint is a sha256 digest"
assert_eq "$(migrations_fingerprint "${FP_DIR}/update.sh" "${FP_DIR}/db.sh")" "$FP_A" \
  "…stable when neither file changed"

printf 'migration two\n' > "${FP_DIR}/update.sh"
FP_B="$(migrations_fingerprint "${FP_DIR}/update.sh" "${FP_DIR}/db.sh")"
if [ "$FP_A" != "$FP_B" ]; then
  pass "a changed migration file changes the fingerprint (so migrations re-run)"
else
  fail "a changed migration file must change the fingerprint"
fi

printf 'helper two\n' > "${FP_DIR}/db.sh"
FP_C="$(migrations_fingerprint "${FP_DIR}/update.sh" "${FP_DIR}/db.sh")"
if [ "$FP_C" != "$FP_B" ]; then
  pass "a changed db.sh helper changes it too (migrate_* live there)"
else
  fail "a changed db.sh must change the fingerprint"
fi

RESULT="$(migrations_fingerprint "${FP_DIR}/does-not-exist.sh")"
assert_eq "$RESULT" "" "an unreadable file yields no fingerprint (update.sh then runs the migrations)"
rm -rf "${FP_DIR}"

echo ""
echo "${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
