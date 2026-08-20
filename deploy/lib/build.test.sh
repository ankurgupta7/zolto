#!/bin/bash
# deploy/lib/build.test.sh — tests for deploy/lib/build.sh
#
# Plain bash, no framework, same shape as db.test.sh: sources the real build.sh
# against a throwaway git repo and a fake `docker`, so no daemon, no image and
# no network are needed. Run with:
#
#   bash deploy/lib/build.test.sh
#
# What these protect: update.sh now SKIPS `docker compose build` when the
# fingerprint of the build context matches the label on the image the app
# container is running. That is only safe if two properties hold, and both are
# asserted below:
#
#   1. The fingerprint reacts to everything that can reach the image, and
#      ignores only what .dockerignore provably keeps out of the context —
#      so the exclude list here and .dockerignore must not drift apart.
#   2. Every uncertain case (no container, unlabelled image, unreadable git)
#      answers "rebuild". Skipping a needed build ships stale code; a spurious
#      build only costs time.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILURES=0
PASSES=0

pass() { PASSES=$((PASSES + 1)); echo "  ok - $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "  NOT OK - $1"; }

assert_eq() { # assert_eq actual expected description
  if [[ "$1" == "$2" ]]; then pass "$3"; else fail "$3 (expected '$2', got '$1')"; fi
}

assert_ne() { # assert_ne actual unexpected description
  if [[ "$1" != "$2" ]]; then pass "$3"; else fail "$3 (both were '$1')"; fi
}

assert_contains() { # assert_contains haystack needle description
  if [[ "$1" == *"$2"* ]]; then
    pass "$3"
  else
    fail "$3 (expected to find: $2)"
    echo "$1" | sed 's/^/    /'
  fi
}

log()  { echo "==> $*"; }
ok()   { echo "  OK $*"; }
warn() { echo "  WARN $*"; }
die()  { echo "FATAL: $*"; exit 1; }

# ── Fake `docker` on PATH ─────────────────────────────────────────────────────
# Driven by env vars so each test can describe a different host state:
#   FAKE_APP_CID    — container id `docker compose ps -q app` reports ("" = none)
#   FAKE_IMAGE_REF  — image that container runs
#   FAKE_LABEL      — value of the fingerprint label on that image
FAKE_BIN_DIR="$(mktemp -d)"
SANDBOX="$(mktemp -d)"
trap 'rm -rf "${FAKE_BIN_DIR}" "${SANDBOX}"' EXIT

cat > "${FAKE_BIN_DIR}/docker" <<'FAKE_DOCKER'
#!/bin/bash
case "$1 $2" in
  "compose ps")   printf '%s\n' "${FAKE_APP_CID:-}" ;;
  "inspect --format")
    # docker inspect --format '{{.Image}}' <cid>
    printf '%s\n' "${FAKE_IMAGE_REF:-sha256:deadbeef}" ;;
  "image inspect")
    # docker image inspect --format '{{index .Config.Labels "..."}}' <ref>
    if [ -z "${FAKE_LABEL+x}" ]; then printf '<no value>\n'; else printf '%s\n' "${FAKE_LABEL}"; fi ;;
  *) exit 0 ;;
esac
FAKE_DOCKER
chmod +x "${FAKE_BIN_DIR}/docker"
PATH="${FAKE_BIN_DIR}:${PATH}"

# shellcheck source=deploy/lib/build.sh
source "${REPO_ROOT}/deploy/lib/build.sh"

# ── A throwaway repo shaped like the real one ─────────────────────────────────
setup_repo() {
  rm -rf "${SANDBOX}/repo"
  mkdir -p "${SANDBOX}/repo"/{client/src,server,shared,docs,deploy/lib,tools}
  cd "${SANDBOX}/repo" || exit 1

  echo "export const App = 1" > client/src/App.tsx
  echo "export const api = 1" > server/index.ts
  echo "export const t = 1"   > shared/types.ts
  echo '{"name":"gwinn"}'     > package.json
  echo "lockfileVersion: 9"   > pnpm-lock.yaml
  echo "FROM node:22-alpine"  > Dockerfile
  echo "# readme"             > README.md
  echo "# planning"           > docs/plan.md
  echo "echo deploy"          > update.sh
  echo "echo lib"             > deploy/lib/db.sh
  echo "echo shot"            > tools/shoot.mjs
  echo "export const t = 1"   > server/index.test.ts
  printf 'node_modules\n.env\n' > .gitignore

  git init -q .
  git config user.email test@example.com
  git config user.name  Test
  git add -A
  git commit -qm "initial"
}

echo ""
echo "── source_fingerprint: what it notices ──────────────────────────────────"

setup_repo
BASE_FP="$(source_fingerprint)"

assert_eq "${#BASE_FP}" "64" "fingerprint is a sha256 digest"
assert_eq "$(source_fingerprint)" "$BASE_FP" "fingerprint is stable across calls with no changes"

# Real source: must change the fingerprint, tracked or not, committed or not.
echo "export const App = 2" > client/src/App.tsx
assert_ne "$(source_fingerprint)" "$BASE_FP" "an uncommitted edit to client source changes it"

git add -A && git commit -qm "app change"
COMMITTED_FP="$(source_fingerprint)"
assert_ne "$COMMITTED_FP" "$BASE_FP" "the same edit, committed, still differs from the baseline"

echo "export const helper = 1" > server/newFile.ts
assert_ne "$(source_fingerprint)" "$COMMITTED_FP" "a new untracked source file changes it"
rm server/newFile.ts
assert_eq "$(source_fingerprint)" "$COMMITTED_FP" "removing it again restores the fingerprint"

echo "lockfileVersion: 9.1" > pnpm-lock.yaml
assert_ne "$(source_fingerprint)" "$COMMITTED_FP" "a lockfile change changes it"
git checkout -q -- pnpm-lock.yaml

# .env is gitignored but IS in the build context: vite bakes VITE_* into the
# bundle, so a changed .env is a changed image.
echo "VITE_DEFAULT_TENANT_SLUG=demo" > .env
ENV_FP="$(source_fingerprint)"
assert_ne "$ENV_FP" "$COMMITTED_FP" "creating .env changes it (VITE_* is compiled into the bundle)"
echo "VITE_DEFAULT_TENANT_SLUG=other" > .env
assert_ne "$(source_fingerprint)" "$ENV_FP" "editing .env changes it"
rm .env

echo ""
echo "── source_fingerprint: what it ignores ──────────────────────────────────"

# Everything below is excluded from the build context by .dockerignore, so it
# cannot change the image — and must not force a rebuild.
NOW_FP="$(source_fingerprint)"

echo "# rewritten" > README.md
assert_eq "$(source_fingerprint)" "$NOW_FP" "a README edit does not change it"

echo "# more planning" > docs/plan.md
assert_eq "$(source_fingerprint)" "$NOW_FP" "a docs/ edit does not change it"

echo "echo deploy differently" > update.sh
assert_eq "$(source_fingerprint)" "$NOW_FP" "an update.sh edit does not change it"

echo "echo other" > deploy/lib/db.sh
assert_eq "$(source_fingerprint)" "$NOW_FP" "a deploy/lib edit does not change it"

echo "export const t = 2" > server/index.test.ts
assert_eq "$(source_fingerprint)" "$NOW_FP" "a test-file edit does not change it"

mkdir -p node_modules/left-pad
echo "junk" > node_modules/left-pad/index.js
assert_eq "$(source_fingerprint)" "$NOW_FP" "host node_modules does not change it"

echo ""
echo "── source_fingerprint outside a git checkout ────────────────────────────"

mkdir -p "${SANDBOX}/not-a-repo"
cd "${SANDBOX}/not-a-repo" || exit 1
NON_REPO_FP="$(source_fingerprint)"
NON_REPO_STATUS=$?
assert_eq "$NON_REPO_FP" "" "prints nothing outside a git checkout"
assert_ne "$NON_REPO_STATUS" "0" "signals failure outside a git checkout"

echo ""
echo "── app_rebuild_reason: uncertainty always means rebuild ─────────────────"

cd "${SANDBOX}/repo" || exit 1
FP="$(source_fingerprint)"

REASON="$(FAKE_APP_CID="" app_rebuild_reason "$FP")"
assert_contains "$REASON" "no app container is running" "no running container → rebuild"

REASON="$(FAKE_APP_CID="abc123" FAKE_IMAGE_REF="sha256:1" app_rebuild_reason "$FP")"
assert_contains "$REASON" "no source fingerprint" "unlabelled image → rebuild"

REASON="$(FAKE_APP_CID="abc123" FAKE_LABEL="unknown" app_rebuild_reason "$FP")"
assert_contains "$REASON" "no source fingerprint" "the Dockerfile's default 'unknown' label → rebuild"

REASON="$(FAKE_APP_CID="abc123" FAKE_LABEL="0000000000000000000000000000000000000000000000000000000000000000" \
  app_rebuild_reason "$FP")"
assert_contains "$REASON" "source changed" "fingerprint mismatch → rebuild"

REASON="$(FAKE_APP_CID="abc123" FAKE_LABEL="$FP" app_rebuild_reason "")"
assert_contains "$REASON" "fingerprint unavailable" "no computable fingerprint → rebuild"

echo ""
echo "── app_rebuild_reason: the one case that skips ──────────────────────────"

if REASON="$(FAKE_APP_CID="abc123" FAKE_LABEL="$FP" app_rebuild_reason "$FP")"; then
  fail "matching fingerprint should return non-zero (no rebuild needed), got reason: ${REASON}"
else
  pass "matching fingerprint → no rebuild"
  assert_eq "$REASON" "" "…and prints no reason"
fi

echo ""
echo "── .dockerignore and image_context_excludes() agree ─────────────────────"
# The whole fast path rests on this: build.sh may only ignore a path when
# .dockerignore keeps it out of the build context. If someone adds a pattern to
# one file and forgets the other, the fingerprint either misses a real change
# (stale image shipped) or thrashes on an irrelevant one.
cd "${REPO_ROOT}" || exit 1

# Normalise both sides: strip comments/blanks, and drop the `**/` prefix
# .dockerignore needs for a recursive match but a git pathspec does not.
DOCKERIGNORE_PATTERNS="$(sed 's/#.*//' .dockerignore | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
  | grep -v '^$' | sed 's|^\*\*/||' | sort -u)"
EXCLUDE_PATTERNS="$(image_context_excludes | sort -u)"

MISSING_FROM_BUILD_SH="$(comm -23 <(printf '%s\n' "$DOCKERIGNORE_PATTERNS") <(printf '%s\n' "$EXCLUDE_PATTERNS"))"
MISSING_FROM_DOCKERIGNORE="$(comm -13 <(printf '%s\n' "$DOCKERIGNORE_PATTERNS") <(printf '%s\n' "$EXCLUDE_PATTERNS"))"

# .dockerignore may legitimately hold MORE than build.sh (ignoring an extra path
# only makes the fingerprint conservative). The dangerous direction is the other
# one: build.sh ignoring something that IS in the build context.
if [ -z "$MISSING_FROM_DOCKERIGNORE" ]; then
  pass "every path build.sh ignores is also excluded by .dockerignore"
else
  fail "build.sh ignores paths that .dockerignore still ships to the build context:"
  printf '%s\n' "$MISSING_FROM_DOCKERIGNORE" | sed 's/^/      /'
fi

if [ -z "$MISSING_FROM_BUILD_SH" ]; then
  pass ".dockerignore and image_context_excludes() list the same paths"
else
  warn ".dockerignore excludes paths build.sh still fingerprints (safe, just slower):"
  printf '%s\n' "$MISSING_FROM_BUILD_SH" | sed 's/^/      /'
  pass "(conservative direction — not a failure)"
fi

# .env must NOT be ignored: the Vite build reads it.
if grep -qE '^\.env$' .dockerignore; then
  fail ".dockerignore excludes .env — VITE_* values would vanish from the bundle"
else
  pass ".dockerignore keeps .env in the build context"
fi

echo ""
echo "── Dockerfile stamps the label build.sh reads ───────────────────────────"
DOCKERFILE="$(cat "${REPO_ROOT}/Dockerfile")"
assert_contains "$DOCKERFILE" "ARG SOURCE_FINGERPRINT" "Dockerfile declares the SOURCE_FINGERPRINT build arg"
assert_contains "$DOCKERFILE" "LABEL ${IMAGE_FINGERPRINT_LABEL}=" "Dockerfile labels the image with it"

# The label must be the last thing in the runner stage. Declared any earlier, a
# changed fingerprint would invalidate the layers below it and every build would
# be cold again — the exact cost this change exists to remove.
LABEL_LINE=$(grep -n "^LABEL ${IMAGE_FINGERPRINT_LABEL}=" "${REPO_ROOT}/Dockerfile" | cut -d: -f1)
LAST_COPY_LINE=$(grep -n '^\(COPY\|RUN\) ' "${REPO_ROOT}/Dockerfile" | tail -1 | cut -d: -f1)
if [ -n "$LABEL_LINE" ] && [ -n "$LAST_COPY_LINE" ] && [ "$LABEL_LINE" -gt "$LAST_COPY_LINE" ]; then
  pass "the fingerprint label comes after every COPY/RUN (invalidates no cached layer)"
else
  fail "the fingerprint label must come after the last COPY/RUN (label at ${LABEL_LINE:-?}, last COPY/RUN at ${LAST_COPY_LINE:-?})"
fi

echo ""
echo "── update.sh wires it all up ────────────────────────────────────────────"
UPDATE_SH="$(cat "${REPO_ROOT}/update.sh")"
assert_contains "$UPDATE_SH" 'source "deploy/lib/build.sh"' "update.sh sources build.sh"
assert_contains "$UPDATE_SH" 'app_rebuild_reason' "update.sh asks whether a rebuild is needed"
assert_contains "$UPDATE_SH" '--build-arg "SOURCE_FINGERPRINT=' "update.sh passes the fingerprint to the build"

# The regression that started this: an unconditional cold build every deploy.
if grep -qE '^docker compose build --no-cache app' "${REPO_ROOT}/update.sh"; then
  fail "update.sh still runs an unconditional --no-cache build"
else
  pass "update.sh no longer hard-codes a cold rebuild"
fi

# …and its partner, which deleted the cache the next build would have reused.
if grep -qE '^BUILDER_PRUNE_OUTPUT=\$\(docker builder prune -a -f' "${REPO_ROOT}/update.sh"; then
  fail "update.sh still prunes the whole build cache unconditionally"
else
  pass "the full build-cache prune is now conditional on disk pressure"
fi

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "FAILED: ${FAILURES} failed, ${PASSES} passed"
  exit 1
fi
echo "PASSED: ${PASSES} assertions"
