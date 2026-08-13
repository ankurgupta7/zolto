#!/bin/bash
# deploy/dedupe-users.test.sh — tests for deploy/dedupe-users.sh
#
# Plain bash, no framework, same shape as deploy/lib/db.test.sh: runs the real
# script against a fake `docker` on PATH so no Docker or MySQL is required.
#
#   bash deploy/dedupe-users.test.sh
#
# What matters here is the refusals. The script deletes production user rows,
# and the two dangerous mistakes are deleting an unclaimed signup (abandons a
# store) and deleting a tenant's last admin (locks the merchant out). Both are
# asserted below, along with the escaping that keeps an email from being read
# as SQL.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${SCRIPT_DIR}/dedupe-users.sh"
FAILURES=0
PASSES=0

pass() { PASSES=$((PASSES + 1)); echo "  ok - $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "  NOT OK - $1"; }

assert_contains() {
  if [[ "$1" == *"$2"* ]]; then
    pass "$3"
  else
    fail "$3 (expected to find: $2)"
    echo "$1" | sed 's/^/    /'
  fi
}

assert_not_contains() {
  if [[ "$1" != *"$2"* ]]; then
    pass "$3"
  else
    fail "$3 (did NOT expect: $2)"
    echo "$1" | sed 's/^/    /'
  fi
}

# ── Fake repo root: .env + docker-compose.yml so the script's checks pass ─────
FAKE_ROOT="$(mktemp -d)"
FAKE_BIN_DIR="$(mktemp -d)"
FAKE_CALL_LOG="$(mktemp)"
trap 'rm -rf "${FAKE_ROOT}" "${FAKE_BIN_DIR}" "${FAKE_CALL_LOG}"' EXIT

mkdir -p "${FAKE_ROOT}/deploy"
cp "${TARGET}" "${FAKE_ROOT}/deploy/dedupe-users.sh"
cat > "${FAKE_ROOT}/.env" <<'ENV'
MYSQL_USER=zolto_user
MYSQL_PASSWORD=sekret
MYSQL_DATABASE=zolto
ENV
touch "${FAKE_ROOT}/docker-compose.yml"

# The fake mysql answers by matching the SQL it was handed, so one fixture can
# serve the several queries a single run makes (row lookup, then admin count).
cat > "${FAKE_BIN_DIR}/docker" <<'FAKE_DOCKER'
#!/bin/bash
echo "$@" >> "${FAKE_CALL_LOG}"
SQL="${*: -1}"
# DELETE first: it also ends in "FROM users WHERE id = …", so a looser branch
# above would swallow it.
case "$SQL" in
  *"DELETE FROM users"*)                         : ;;
  *"INDEX_NAME = 'users_openId_unique'"*)        echo "${FAKE_INDEX:-1}" ;;
  *"GROUP BY openId"*)                           echo "${FAKE_DUPE_OPENIDS:-0}" ;;
  *"SELECT COUNT(*) FROM users;"*)               echo "${FAKE_USER_COUNT:-3}" ;;
  *"GROUP BY LOWER(email) HAVING"*"d;")          echo "${FAKE_DUPE_EMAILS:-1}" ;;
  *"COUNT(*)"*"role IN ('admin','superadmin')"*) echo "${FAKE_OTHER_ADMINS:-1}" ;;
  *"SELECT tenant_id, role, openId"*)            printf '%s\n' "${FAKE_ROW:-}" ;;
  *"GROUP BY LOWER(email)"*)                     printf '%s\n' "${FAKE_SURVEY:-}" ;;
  *"COUNT(DISTINCT tenant_id)"*)                 echo "${FAKE_TENANTS:-1}" ;;
  *"COUNT(*)"*"openId NOT LIKE"*)                echo "${FAKE_REAL:-2}" ;;
  *"LEFT JOIN tenants"*)                         printf '%s\n' "${FAKE_INSPECT:-}" ;;
esac
exit 0
FAKE_DOCKER
chmod +x "${FAKE_BIN_DIR}/docker"

run() { # run [args…] → stdout+stderr, never aborts the harness
  ( cd "${FAKE_ROOT}" && PATH="${FAKE_BIN_DIR}:${PATH}" \
    FAKE_CALL_LOG="${FAKE_CALL_LOG}" \
    bash deploy/dedupe-users.sh "$@" 2>&1 )
}

echo "deploy/dedupe-users.sh"

# ── Refusals: the two deletions that would break a live store ────────────────
: > "${FAKE_CALL_LOG}"
OUT=$(FAKE_ROW=$'7\tadmin\tpending:tok-abc\ta@b.c' run --delete 5)
assert_contains "$OUT" "unclaimed signup" "refuses to delete a pending claim row"
assert_not_contains "$(cat "${FAKE_CALL_LOG}")" "DELETE FROM users" "…and issues no DELETE"

: > "${FAKE_CALL_LOG}"
OUT=$(FAKE_ROW=$'7\tadmin\tgoogle:sub-1\ta@b.c' FAKE_OTHER_ADMINS=0 run --delete 5)
assert_contains "$OUT" "only admin left" "refuses to delete a tenant's last admin"
assert_not_contains "$(cat "${FAKE_CALL_LOG}")" "DELETE FROM users" "…and issues no DELETE"

# --force is the documented escape hatch; it has to actually work.
: > "${FAKE_CALL_LOG}"
OUT=$(FAKE_ROW=$'7\tadmin\tpending:tok-abc\ta@b.c' run --delete 5 --force)
assert_contains "$(cat "${FAKE_CALL_LOG}")" "DELETE FROM users" "--force overrides the refusals"

# ── The delete that should go through ────────────────────────────────────────
: > "${FAKE_CALL_LOG}"
OUT=$(FAKE_ROW=$'7\tstaff\tmagic:xyz\ta@b.c' run --delete 5)
assert_contains "$(cat "${FAKE_CALL_LOG}")" "DELETE FROM users" "deletes a non-admin duplicate"
assert_contains "$OUT" "Deleted user 5" "reports the deletion"

# A staff row is never a lockout risk, so the admin count is a query not worth
# making — assert we skip it rather than merely ignoring the answer.
assert_not_contains "$(cat "${FAKE_CALL_LOG}")" "role IN ('admin','superadmin')" \
  "skips the last-admin check for a non-admin row"

# ── Read-only by default ─────────────────────────────────────────────────────
: > "${FAKE_CALL_LOG}"
OUT=$(FAKE_SURVEY=$'2\ta@b.c' run)
assert_contains "$OUT" "2×  a@b.c" "survey lists duplicated addresses"
assert_not_contains "$(cat "${FAKE_CALL_LOG}")" "DELETE FROM users" "survey issues no DELETE"

: > "${FAKE_CALL_LOG}"
OUT=$(FAKE_SURVEY="" run)
assert_contains "$OUT" "No email address is held by more than one" "survey handles a clean database"

# ── Inspect, and the verdict it prints ───────────────────────────────────────
ROW1=$'1\t7\tKalakosh\tadmin\tgoogle:sub-1\tAda\ta@b.c\tgoogle\t2026-01-01 00:00\t2026-02-01 00:00'
ROW2=$'2\t7\tKalakosh\tadmin\tmagic:xyz\tAda\ta@b.c\tmagic\t2026-01-05 00:00\t2026-03-01 00:00'

OUT=$(FAKE_INSPECT="${ROW1}"$'\n'"${ROW2}" FAKE_REAL=2 FAKE_TENANTS=1 run --email a@b.c)
assert_contains "$OUT" "openId       google:sub-1" "inspect prints the openId that distinguishes rows"
assert_contains "$OUT" "Looks like a real duplicate" "two rows, one tenant → real duplicate"

OUT=$(FAKE_INSPECT="${ROW1}"$'\n'"${ROW2}" FAKE_REAL=2 FAKE_TENANTS=2 run --email a@b.c)
assert_contains "$OUT" "more than one store" "two rows, two tenants → not a duplicate"

PENDING=$'2\t7\tKalakosh\tadmin\tpending:tok\tAda\ta@b.c\tpending\t2026-01-05 00:00\t2026-03-01 00:00'
OUT=$(FAKE_INSPECT="${ROW1}"$'\n'"${PENDING}" FAKE_REAL=1 FAKE_TENANTS=1 run --email a@b.c)
assert_contains "$OUT" "unclaimed signup, not a duplicate" "flags the pending row inline"
assert_contains "$OUT" "Not a duplicate" "one real row → not a duplicate"

# ── --check: the openId constraint diagnostic ────────────────────────────────
: > "${FAKE_CALL_LOG}"
OUT=$(FAKE_INDEX=1 FAKE_DUPE_EMAILS=1 run --check)
assert_contains "$OUT" "users_openId_unique is present" "reports an intact constraint"
assert_contains "$OUT" "Safe to clean up" "…and says duplicates are the ordinary kind"
assert_not_contains "$(cat "${FAKE_CALL_LOG}")" "DELETE FROM users" "--check issues no DELETE"

# The constraint being gone is the case that changes what the operator should
# do, so it has to be unmissable — and it must exit non-zero.
OUT=$(FAKE_INDEX=0 run --check); RC=$?
assert_contains "$OUT" "MISSING" "reports a dropped constraint"
assert_contains "$OUT" "only defers the problem" "warns that deleting rows won't hold"
[ "$RC" -ne 0 ] && pass "…and exits non-zero" || fail "…and exits non-zero (got ${RC})"

OUT=$(FAKE_INDEX=0 FAKE_DUPE_OPENIDS=4 run --check)
assert_contains "$OUT" "4 openId(s) are already duplicated" "counts duplicated openIds to merge first"

# ── Input handling ───────────────────────────────────────────────────────────
OUT=$(run --delete abc)
assert_contains "$OUT" "numeric user id" "rejects a non-numeric --delete"

# An address is user-controlled text pasted into SQL; the quote has to survive.
: > "${FAKE_CALL_LOG}"
OUT=$(FAKE_INSPECT="${ROW1}" run --email "o'brien@b.c")
assert_contains "$(cat "${FAKE_CALL_LOG}")" "o''brien@b.c" "escapes a quote in the email"

OUT=$(run --nonsense)
assert_contains "$OUT" "Unknown argument" "rejects unknown flags"

# ── .env parsing: parsed, never executed ─────────────────────────────────────
# Regression target: this used to `. .env`, which executes the file. A value
# with $(…) or backticks ran as root, and `KEY= value` (legal to compose,
# which trims the space) made bash read the value as a command and print
# "command not found" on every invocation.
env_case() { # env_case <.env body> [args…] → stdout+stderr
  local body="$1"; shift
  local dir; dir="$(mktemp -d)"
  mkdir -p "${dir}/deploy" && cp "${TARGET}" "${dir}/deploy/dedupe-users.sh"
  printf '%s\n' "$body" > "${dir}/.env"
  touch "${dir}/docker-compose.yml"
  ( cd "$dir" && PATH="${FAKE_BIN_DIR}:${PATH}" FAKE_CALL_LOG="${FAKE_CALL_LOG}" \
    FAKE_SURVEY="" bash deploy/dedupe-users.sh "$@" 2>&1 )
  rm -rf "$dir"
}

BASE=$'MYSQL_USER=zolto_user\nMYSQL_PASSWORD=sekret\nMYSQL_DATABASE=zolto'

OUT=$(env_case "${BASE}"$'\nTENANT_SECRETS_KEY= 9aa5359e6149b7bb')
assert_not_contains "$OUT" "command not found" "a 'KEY= value' line is not run as a command"

# The dangerous one: sourcing would execute this.
: > "${FAKE_CALL_LOG}"
OUT=$(env_case "${BASE}"$'\nEVIL=$(touch /tmp/zolto-dedupe-pwned)')
assert_not_contains "$OUT" "command not found" "a \$(…) value produces no shell error"
if [ -e /tmp/zolto-dedupe-pwned ]; then
  fail "a \$(…) value in .env is NOT executed"
  rm -f /tmp/zolto-dedupe-pwned
else
  pass "a \$(…) value in .env is NOT executed"
fi

# Values still have to arrive intact, or the connection silently uses the wrong
# credentials — the failure this whole section exists to prevent.
: > "${FAKE_CALL_LOG}"
env_case $'MYSQL_USER = spaced\nMYSQL_PASSWORD="quo ted"\nMYSQL_DATABASE=zolto # inline' --check >/dev/null
CALLS=$(cat "${FAKE_CALL_LOG}")
assert_contains "$CALLS" "-uspaced"    "tolerates whitespace around ="
assert_contains "$CALLS" "-pquo ted"   "keeps a quoted value verbatim, quotes stripped"
assert_contains "$CALLS" " zolto "     "strips an inline comment from an unquoted value"

: > "${FAKE_CALL_LOG}"
env_case $'MYSQL_USER=first\nMYSQL_PASSWORD=p\nMYSQL_DATABASE=d\nMYSQL_USER=second' --check >/dev/null
assert_contains "$(cat "${FAKE_CALL_LOG}")" "-usecond" "last assignment wins, as in compose"

# A '#' inside a quoted password is part of the password, not a comment.
: > "${FAKE_CALL_LOG}"
env_case $'MYSQL_USER=u\nMYSQL_PASSWORD="pa#ss"\nMYSQL_DATABASE=d' --check >/dev/null
assert_contains "$(cat "${FAKE_CALL_LOG}")" "-ppa#ss" "keeps a # inside a quoted password"

OUT=$(env_case $'MYSQL_PASSWORD=p\nMYSQL_DATABASE=d')
assert_contains "$OUT" "MYSQL_USER missing" "names the missing variable"

# ── Missing .env is a clear error, not a confusing MySQL failure ──────────────
BARE="$(mktemp -d)"
mkdir -p "${BARE}/deploy" && cp "${TARGET}" "${BARE}/deploy/dedupe-users.sh"
OUT=$( cd "${BARE}" && PATH="${FAKE_BIN_DIR}:${PATH}" bash deploy/dedupe-users.sh 2>&1 )
assert_contains "$OUT" "No .env" "explains a missing .env"
rm -rf "${BARE}"

echo ""
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "${FAILURES}" -eq 0 ] || exit 1
