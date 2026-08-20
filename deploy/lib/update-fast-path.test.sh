#!/bin/bash
# deploy/lib/update-fast-path.test.sh — end-to-end tests for update.sh's fast path
#
# Runs the REAL update.sh, twice, inside a throwaway git repo against a fake
# `docker` and `crontab`. Nothing here touches a daemon, a database or a
# network. Run with:
#
#   bash deploy/lib/update-fast-path.test.sh
#
# Why an integration test and not just unit tests on build.sh/db.sh: the fast
# path is two conditionals wrapped around ~500 lines of migrations and a build
# step, and the failure modes live in the wiring, not the helpers —
#
#   - the `if … else … fi` around the migration block mis-nesting, so the
#     migrations silently never run;
#   - the fingerprint being recorded even when a migration died halfway, which
#     would make the next deploy skip a schema that was never finished;
#   - the second run "succeeding" by skipping work it should have done.
#
# So: run 1 is a cold host (no container, no deploy_state) and must do
# everything; run 2 changes nothing and must skip both; then each fast path is
# knocked out individually and must come back.

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
# Logs every invocation, then answers just enough for update.sh to run to
# completion. Behaviour is steered by env vars the tests set per run:
#   FAKE_APP_CID       — what `docker compose ps -q app` reports ("" = nothing up)
#   FAKE_IMAGE_LABEL   — fingerprint label on the running app image
#   FAKE_SCHEMA_FP     — value stored in deploy_state.schema_fingerprint
cat > "${FAKE_BIN}/docker" <<'FAKE_DOCKER'
#!/bin/bash
echo "$*" >> "${FAKE_DOCKER_LOG}"

# The SQL text is always the final argument of `docker compose exec … mysql -e`.
sql="${!#}"

case "$1 $2" in
  "info ")            exit 0 ;;
  "compose build")    exit 0 ;;
  "compose up")       exit 0 ;;
  "compose config")   echo "name: gwinn"; exit 0 ;;
  "container prune")  echo "0B"; exit 0 ;;
  "image prune")      echo "0B"; exit 0 ;;
  "builder prune")    echo "Total: 0B"; exit 0 ;;
  "network prune")    exit 0 ;;
  "image inspect")
    if [ -z "${FAKE_IMAGE_LABEL:-}" ]; then echo "<no value>"; else echo "${FAKE_IMAGE_LABEL}"; fi
    exit 0 ;;
  "inspect --format")
    echo "sha256:fakeimage"; exit 0 ;;
esac

if [ "$1 $2" = "compose ps" ]; then
  case "$*" in
    *"-q app")   printf '%s\n' "${FAKE_APP_CID:-}" ;;
    *"-q caddy") ;;                      # standalone profile not running
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

  # ── mysql ──
  case "$sql" in
    *"FROM \`deploy_state\`"*) printf '%s\n' "${FAKE_SCHEMA_FP:-}" ;;
    *"SELECT 1"*)              ;;
    *"IS_NULLABLE"*)           echo "YES" ;;
    # 0036 converted products.category to varchar on an up-to-date database.
    *"COLUMN_NAME='category'"*) echo "varchar(64)" ;;
    *"COLUMN_TYPE"*)
      # Report every enum as already-migrated so the migration block takes its
      # "already applied" branches, the way a real up-to-date database would.
      echo "enum('Necklaces','Sets','pro','upsert_images','twint_qr','superadmin','staff','customer')" ;;
    *"COUNT(*)"*)              echo "1" ;;
    *)                         ;;
  esac
  exit 0
fi

exit 0
FAKE_DOCKER
chmod +x "${FAKE_BIN}/docker"

# ── Fake `crontab` — no real crontab is touched ───────────────────────────────
cat > "${FAKE_BIN}/crontab" <<'FAKE_CRON'
#!/bin/bash
[ "${1:-}" = "-l" ] && { echo "0 2 * * 0 cd /srv/gwinn && ./deploy/backup.sh"; exit 0; }
cat > /dev/null
exit 0
FAKE_CRON
chmod +x "${FAKE_BIN}/crontab"

# ── A repo that looks like the deployed checkout, with a real origin ──────────
setup_repo() {
  rm -rf "${SANDBOX}/repo" "${SANDBOX}/origin.git"
  mkdir -p "${SANDBOX}/repo"
  cd "${SANDBOX}/repo" || exit 1

  # The pieces update.sh actually reads.
  cp "${REPO_ROOT}/update.sh" .
  cp "${REPO_ROOT}/Dockerfile" .
  cp "${REPO_ROOT}/.dockerignore" .
  mkdir -p deploy/lib client/src server
  cp "${REPO_ROOT}"/deploy/lib/{db.sh,env.sh,caddy.sh,build.sh} deploy/lib/
  echo "export const App = 1" > client/src/App.tsx
  echo "export const api = 1" > server/index.ts
  echo '{"name":"gwinn"}' > package.json
  printf '.env\nnode_modules\n' > .gitignore

  cat > .env <<'ENV'
MYSQL_USER=gwinn
MYSQL_PASSWORD=secret
MYSQL_DATABASE=gwinn
ENV

  git init -q -b main .
  git config user.email test@example.com
  git config user.name Test
  git add -A
  git commit -qm "deployed state"

  git init -q --bare "${SANDBOX}/origin.git"
  git remote add origin "${SANDBOX}/origin.git"
  git push -q -u origin main
}

# Runs update.sh in the sandbox and prints its combined output.
run_update() { # run_update [args...]
  cd "${SANDBOX}/repo" || exit 1
  : > "${FAKE_DOCKER_LOG}"
  PATH="${FAKE_BIN}:${PATH}" \
  FAKE_DOCKER_LOG="${FAKE_DOCKER_LOG}" \
  FAKE_APP_CID="${FAKE_APP_CID:-}" \
  FAKE_IMAGE_LABEL="${FAKE_IMAGE_LABEL:-}" \
  FAKE_SCHEMA_FP="${FAKE_SCHEMA_FP:-}" \
    bash update.sh "$@" 2>&1
}

FAKE_DOCKER_LOG="${SANDBOX}/docker.log"
export FAKE_DOCKER_LOG

setup_repo

echo ""
echo "── Run 1: cold host (nothing running, no recorded schema) ───────────────"

FAKE_APP_CID="" FAKE_IMAGE_LABEL="" FAKE_SCHEMA_FP=""
OUT1="$(run_update)"
LOG1="$(cat "${FAKE_DOCKER_LOG}")"

assert_contains "$OUT1" "Update complete" "the deploy completes"
assert_contains "$OUT1" "Applying database migrations" "migrations run when none are recorded"
assert_contains "$OUT1" "0000 users table" "…the block really executes, from the first migration"
assert_contains "$OUT1" "0032" "…through to the last"
assert_contains "$OUT1" "recorded schema fingerprint" "…and the applied set is recorded afterwards"
assert_contains "$OUT1" "no app container is running" "the image is rebuilt when nothing is up"
assert_contains "$LOG1" "compose build" "…so docker compose build is invoked"
assert_contains "$LOG1" "--build-arg SOURCE_FINGERPRINT=" "…with the source fingerprint baked in"
assert_not_contains "$LOG1" "compose build --no-cache" "a routine rebuild uses the layer cache"

# Pull the values the run just recorded, exactly as a real host would have.
RECORDED_FP="$(printf '%s\n' "$LOG1" | grep -o "VALUES ('schema_fingerprint', '[a-f0-9]*'" | head -1 | grep -o "[a-f0-9]\{64\}")"
BUILT_FP="$(printf '%s\n' "$LOG1" | grep -o -- "--build-arg SOURCE_FINGERPRINT=[a-f0-9]*" | head -1 | cut -d= -f2)"

if [ ${#RECORDED_FP} -eq 64 ]; then
  pass "the recorded schema fingerprint is a sha256 digest"
else
  fail "expected a 64-char schema fingerprint in the INSERT, got '${RECORDED_FP}'" "$LOG1"
fi
if [ ${#BUILT_FP} -eq 64 ]; then
  pass "the image is stamped with a sha256 source fingerprint"
else
  fail "expected a 64-char source fingerprint on the build, got '${BUILT_FP}'" "$LOG1"
fi

echo ""
echo "── Run 2: nothing changed — both fast paths engage ──────────────────────"

FAKE_APP_CID="appcid" FAKE_IMAGE_LABEL="$BUILT_FP" FAKE_SCHEMA_FP="$RECORDED_FP"
OUT2="$(run_update)"
LOG2="$(cat "${FAKE_DOCKER_LOG}")"

assert_contains "$OUT2" "Update complete" "the deploy still completes"
assert_contains "$OUT2" "schema already at" "migrations are skipped"
assert_not_contains "$OUT2" "0000 users table" "…and genuinely do not run"
assert_contains "$OUT2" "already built from this source" "the rebuild is skipped"
assert_not_contains "$LOG2" "compose build" "…so docker never builds"
assert_contains "$OUT2" "Schema   unchanged" "the summary reports the schema was skipped"
assert_contains "$OUT2" "Image    skipped" "the summary reports the build was skipped"
assert_contains "$OUT2" "keeping the build cache warm" "the layer cache survives for the next deploy"
assert_not_contains "$LOG2" "builder prune -a" "…the whole cache is not wiped on a healthy disk"

# The point of the exercise: a no-op deploy should be a handful of docker calls,
# not ~90. The old script ran the full migration set plus a cold build every time.
CALLS1=$(printf '%s\n' "$LOG1" | grep -c .)
CALLS2=$(printf '%s\n' "$LOG2" | grep -c .)
if [ "$CALLS2" -lt $((CALLS1 / 4)) ]; then
  pass "a no-op deploy makes far fewer docker calls (${CALLS2} vs ${CALLS1})"
else
  fail "expected the no-op deploy to be much cheaper (${CALLS2} calls vs ${CALLS1})"
fi

echo ""
echo "── Source changes: the rebuild comes back ───────────────────────────────"

echo "export const App = 2" > "${SANDBOX}/repo/client/src/App.tsx"
FAKE_APP_CID="appcid" FAKE_IMAGE_LABEL="$BUILT_FP" FAKE_SCHEMA_FP="$RECORDED_FP"
OUT3="$(run_update)"
LOG3="$(cat "${FAKE_DOCKER_LOG}")"

assert_contains "$OUT3" "source changed since the running image was built" "an edited component forces a rebuild"
assert_contains "$LOG3" "compose build" "…docker builds again"
assert_contains "$OUT3" "schema already at" "…while the schema fast path still holds"
git -C "${SANDBOX}/repo" checkout -q -- client/src/App.tsx

echo ""
echo "── A docs-only change stays on the fast path ────────────────────────────"

mkdir -p "${SANDBOX}/repo/docs"
echo "# notes" > "${SANDBOX}/repo/docs/notes.md"
echo "# readme" > "${SANDBOX}/repo/README.md"
OUT4="$(run_update)"
assert_contains "$OUT4" "already built from this source" "docs and README edits do not trigger a build"
rm -f "${SANDBOX}/repo/docs/notes.md" "${SANDBOX}/repo/README.md"

echo ""
echo "── A changed migration set re-runs the migrations ───────────────────────"

FAKE_SCHEMA_FP="0000000000000000000000000000000000000000000000000000000000000000"
OUT5="$(run_update)"
assert_contains "$OUT5" "Applying database migrations" "a fingerprint mismatch re-runs every migration"
assert_contains "$OUT5" "0000 users table" "…starting from the first one"
FAKE_SCHEMA_FP="$RECORDED_FP"

echo ""
echo "── A database with no deploy_state re-runs the migrations ───────────────"
# The restored-backup / swapped-volume case: the code is unchanged but the
# database is not the one that was migrated. Nothing recorded ⇒ migrate.

FAKE_SCHEMA_FP=""
OUT6="$(run_update)"
assert_contains "$OUT6" "Applying database migrations" "an unrecorded database is migrated, not trusted"
FAKE_SCHEMA_FP="$RECORDED_FP"

echo ""
echo "── Flags still force the slow path ──────────────────────────────────────"

OUT7="$(run_update --force-migrations)"
assert_contains "$OUT7" "0000 users table" "--force-migrations re-runs them despite a matching fingerprint"
assert_contains "$OUT7" "already built from this source" "…without forcing a pointless rebuild"

OUT8="$(run_update --rebuild)"
LOG8="$(cat "${FAKE_DOCKER_LOG}")"
assert_contains "$OUT8" "forced" "--rebuild forces the build"
assert_contains "$LOG8" "compose build" "…and docker builds"
assert_not_contains "$LOG8" "--no-cache" "…still using the layer cache"

OUT9="$(run_update --full)"
LOG9="$(cat "${FAKE_DOCKER_LOG}")"
assert_contains "$LOG9" "compose build --build-arg SOURCE_FINGERPRINT=" "--full builds"
assert_contains "$LOG9" "--no-cache" "…cold"
assert_contains "$OUT9" "0000 users table" "…re-runs every migration"
assert_contains "$LOG9" "builder prune -a" "…and sweeps the build cache"
assert_contains "$OUT9" "the next build will be cold" "…saying so out loud"

OUT10="$(run_update --skip-build)"
LOG10="$(cat "${FAKE_DOCKER_LOG}")"
assert_contains "$OUT10" "deploying whatever image is already present" "--skip-build says what it is doing"
assert_not_contains "$LOG10" "compose build" "…and never builds"

echo ""
echo "── A failed migration must NOT be recorded as applied ───────────────────"
# The dangerous regression: if the fingerprint were written unconditionally,
# a deploy that died mid-migration would convince every later deploy that the
# schema was complete. Make the very first migration fail and assert nothing
# gets recorded.

cat > "${FAKE_BIN}/docker" <<'FAILING_DOCKER'
#!/bin/bash
echo "$*" >> "${FAKE_DOCKER_LOG}"
sql="${!#}"
case "$1 $2" in
  "info ") exit 0 ;;
esac
if [ "$1 $2" = "compose ps" ]; then
  case "$*" in *"-q app") printf '%s\n' "${FAKE_APP_CID:-}" ;; esac
  exit 0
fi
if [ "$1 $2" = "compose exec" ]; then
  case "$sql" in
    *"FROM \`deploy_state\`"*) printf '%s\n' "${FAKE_SCHEMA_FP:-}"; exit 0 ;;
    *"SELECT 1"*)              exit 0 ;;
    *"CREATE TABLE IF NOT EXISTS \`deploy_state\`"*) exit 0 ;;
    *"CREATE TABLE IF NOT EXISTS \`users\`"*)
      echo "ERROR 1114 (HY000): The table 'users' is full" >&2; exit 1 ;;
  esac
  exit 0
fi
exit 0
FAILING_DOCKER
chmod +x "${FAKE_BIN}/docker"

FAKE_SCHEMA_FP="" FAKE_APP_CID=""
OUT11="$(run_update)"
LOG11="$(cat "${FAKE_DOCKER_LOG}")"

assert_contains "$OUT11" "Migration failed: 0000 users table" "a failing migration still aborts the deploy"
assert_contains "$OUT11" "table 'users' is full" "…surfacing the real MySQL error"
assert_not_contains "$LOG11" "INSERT INTO \`deploy_state\`" "…and records NO schema fingerprint"
assert_not_contains "$LOG11" "compose build" "…and never reaches the build"

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "FAILED: ${FAILURES} failed, ${PASSES} passed"
  exit 1
fi
echo "PASSED: ${PASSES} assertions"
