#!/usr/bin/env bash
# .circleci/defer-to-github.test.sh — tests for defer-to-github.sh
#
# Plain bash, no framework. Builds a throwaway git repo for the path-diff
# logic and puts fake `curl` / `circleci-agent` executables on PATH, so no
# network and no CircleCI agent are needed.
#
# The thing under test decides whether a suite runs on CircleCI or is skipped
# because GitHub Actions already covered it. Getting that wrong in the "skip"
# direction means a merge lands with a suite silently never executed, so every
# ambiguous branch below is asserted to fall back to RUNNING.
#
#   run with:  bash .circleci/defer-to-github.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUT="${SCRIPT_DIR}/defer-to-github.sh"
# Each scenario runs in a subshell, so counters kept in shell variables would
# be discarded and the summary (and exit code) would always read zero. Tally
# through a file instead, which survives the subshell boundary.
RESULTS="$(mktemp)"

pass() { echo "P" >> "$RESULTS"; echo "  ok - $1"; }
fail() { echo "F" >> "$RESULTS"; echo "  NOT OK - $1"; }

assert_contains() {
  if [[ "$1" == *"$2"* ]]; then pass "$3"; else
    fail "$3 (expected to find: $2)"
    echo "$1" | sed 's/^/      /'
  fi
}
assert_eq() {
  if [[ "$1" == "$2" ]]; then pass "$3"; else
    fail "$3 (expected '$2', got '$1')"
  fi
}

WORK="$(mktemp -d)"
BIN="${WORK}/bin"
mkdir -p "$BIN"
trap 'rm -rf "${WORK}" "${RESULTS}"' EXIT

# ── Fake `circleci-agent`: records that `step halt` was called ───────────────
cat > "${BIN}/circleci-agent" <<'FAKE'
#!/usr/bin/env bash
if [ "${1:-}" = "step" ] && [ "${2:-}" = "halt" ]; then
  echo "HALTED" >> "${HALT_LOG}"
fi
exit 0
FAKE
chmod +x "${BIN}/circleci-agent"

# ── Fake `curl`: replays whatever JSON the scenario put in $FAKE_GH_JSON ─────
cat > "${BIN}/curl" <<'FAKE'
#!/usr/bin/env bash
printf '%s' "${FAKE_GH_JSON:-}"
exit 0
FAKE
chmod +x "${BIN}/curl"

export PATH="${BIN}:${PATH}"

# ── A real git repo, so the path-diff logic exercises real git ──────────────
REPO="${WORK}/repo"
mkdir -p "${REPO}/android" "${REPO}/server"
cd "${REPO}"
git init -q .
git config user.email t@t.test
git config user.name t
echo base > server/a.ts
git add -A && git commit -q -m base
BASE_SHA="$(git rev-parse HEAD)"

export CIRCLE_PROJECT_USERNAME=ankurgupta7
export CIRCLE_PROJECT_REPONAME=zolto
export GH_WAIT_SECONDS=0 # never sleep in tests

# run_sut <expected-exit-desc>; echoes combined output, sets $SUT_RC / $SUT_HALTED
run_sut() {
  HALT_LOG="${WORK}/halt.$$.log"
  : > "$HALT_LOG"
  export HALT_LOG
  set +e
  SUT_OUT="$(bash "$SUT" "$@" 2>&1)"
  SUT_RC=$?
  set -e
  SUT_HALTED=no
  [ -s "$HALT_LOG" ] && SUT_HALTED=yes
  return 0
}

echo "Scenario A — FORCE_CIRCLECI_FULL overrides everything:"
(
  export FORCE_CIRCLECI_FULL=1 GITHUB_TOKEN=t FAKE_GH_JSON='{"workflow_runs":[{"status":"completed","conclusion":"success"}]}'
  run_sut android-build.yml android/
  assert_eq "$SUT_RC" "0" "exits 0"
  assert_eq "$SUT_HALTED" "no" "does NOT halt — runs the suite here"
  assert_contains "$SUT_OUT" "FORCE_CIRCLECI_FULL" "says why"
)

echo "Scenario B — commit doesn't touch the filtered paths:"
(
  echo change > server/b.ts && git add -A && git commit -q -m "server only"
  export GITHUB_TOKEN=t FAKE_GH_JSON='{"workflow_runs":[]}'
  run_sut android-build.yml android/
  assert_eq "$SUT_RC" "0" "exits 0"
  assert_eq "$SUT_HALTED" "yes" "halts — nothing under android/ changed"
  assert_contains "$SUT_OUT" "no changes under" "names the paths"
)

echo "Scenario C — paths changed and GitHub already passed:"
(
  echo kt > android/App.kt && git add -A && git commit -q -m "android change"
  export CIRCLE_SHA1="$(git rev-parse HEAD)"
  export GITHUB_TOKEN=t FAKE_GH_JSON='{"workflow_runs":[{"status":"completed","conclusion":"success"}]}'
  run_sut android-build.yml android/
  assert_eq "$SUT_RC" "0" "exits 0"
  assert_eq "$SUT_HALTED" "yes" "halts — GitHub covered it"
  assert_contains "$SUT_OUT" "already ran" "says GitHub handled it"
)

echo "Scenario D — GitHub ran it and FAILED (badge must not go green):"
(
  export CIRCLE_SHA1="$(git rev-parse HEAD)"
  export GITHUB_TOKEN=t FAKE_GH_JSON='{"workflow_runs":[{"status":"completed","conclusion":"failure"}]}'
  run_sut android-build.yml android/
  assert_eq "$SUT_RC" "1" "exits 1 — mirrors the GitHub failure"
  assert_eq "$SUT_HALTED" "no" "does not halt-as-success"
)

echo "Scenario E — no GitHub run ever appears (the out-of-minutes case):"
(
  export CIRCLE_SHA1="$(git rev-parse HEAD)"
  export GITHUB_TOKEN=t FAKE_GH_JSON='{"workflow_runs":[]}'
  run_sut android-build.yml android/
  assert_eq "$SUT_RC" "0" "exits 0"
  assert_eq "$SUT_HALTED" "no" "runs here — this is the whole point"
  assert_contains "$SUT_OUT" "no GitHub run appeared" "names the reason"
)

echo "Scenario F — no GITHUB_TOKEN, so GitHub's state is unknowable:"
(
  export CIRCLE_SHA1="$(git rev-parse HEAD)"
  unset GITHUB_TOKEN
  export FAKE_GH_JSON='{"workflow_runs":[{"status":"completed","conclusion":"success"}]}'
  run_sut android-build.yml android/
  assert_eq "$SUT_RC" "0" "exits 0"
  assert_eq "$SUT_HALTED" "no" "fails safe by running, never by skipping"
  assert_contains "$SUT_OUT" "GITHUB_TOKEN is not set" "says why"
)

echo "Scenario G — GitHub reports 'skipped' (its own filter declined it):"
(
  export CIRCLE_SHA1="$(git rev-parse HEAD)"
  export GITHUB_TOKEN=t FAKE_GH_JSON='{"workflow_runs":[{"status":"completed","conclusion":"skipped"}]}'
  run_sut android-build.yml android/
  assert_eq "$SUT_RC" "0" "exits 0"
  assert_eq "$SUT_HALTED" "no" "runs here — skipped is not covered"
)

echo "Scenario H — a garbage/error API response is not read as success:"
(
  export CIRCLE_SHA1="$(git rev-parse HEAD)"
  export GITHUB_TOKEN=t FAKE_GH_JSON='{"message":"Bad credentials"}'
  run_sut android-build.yml android/
  assert_eq "$SUT_RC" "0" "exits 0"
  assert_eq "$SUT_HALTED" "no" "runs here rather than trusting an error body"
)

echo "Scenario I — no path filter given (job always considered relevant):"
(
  export CIRCLE_SHA1="$(git rev-parse HEAD)"
  export GITHUB_TOKEN=t FAKE_GH_JSON='{"workflow_runs":[{"status":"completed","conclusion":"success"}]}'
  run_sut e2e.yml
  assert_eq "$SUT_HALTED" "yes" "halts on GitHub success without consulting paths"
)

PASSES="$(grep -c '^P$' "$RESULTS" || true)"
FAILURES="$(grep -c '^F$' "$RESULTS" || true)"

echo
echo "──────────────────────────────────────────"
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
