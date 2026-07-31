#!/bin/bash
# deploy/lib/caddy.test.sh — tests for deploy/lib/caddy.sh (reload_caddy)
#
# Plain bash, no framework. Run with:
#
#   bash deploy/lib/caddy.test.sh
#
# Regression target: `docker compose up -d` never reloads Caddy when only the
# bind-mounted Caddyfile changed, so Caddyfile edits silently did nothing for
# several deploys running. reload_caddy has to actually issue the reload when a
# bundled Caddy is running, skip quietly when one isn't (the shared-server
# setup, where another stack's Caddy owns 80/443), and report a failed reload
# loudly rather than letting a stale config pass for a successful deploy.
#
# `docker` is stubbed on PATH so no daemon, containers or network are involved.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILURES=0
PASSES=0

pass() { PASSES=$((PASSES + 1)); echo "  ok - $1"; }
fail() { FAILURES=$((FAILURES + 1)); echo "  NOT OK - $1"; }

assert_eq() { # assert_eq actual expected description
  if [[ "$1" == "$2" ]]; then
    pass "$3"
  else
    fail "$3 (expected '$2', got '$1')"
  fi
}

assert_contains() { # assert_contains haystack needle description
  if [[ "$1" == *"$2"* ]]; then
    pass "$3"
  else
    fail "$3 (expected to contain '$2', got '$1')"
  fi
}

# shellcheck source=deploy/lib/caddy.sh
source "${SCRIPT_DIR}/caddy.sh"

# ── Stub docker ───────────────────────────────────────────────────────────────
# Behaviour is driven by two files the stub reads at call time:
#   STUB_PS_OUTPUT   what `docker compose ps -q caddy` prints
#   STUB_EXEC_STATUS exit status for `docker compose exec ...` (0 = success)
# Every invocation is appended to STUB_CALLS so the test can assert on the
# command line actually issued.
STUB_DIR="$(mktemp -d)"
trap 'rm -rf "$STUB_DIR"' EXIT
export STUB_PS_OUTPUT="${STUB_DIR}/ps_output"
export STUB_EXEC_STATUS="${STUB_DIR}/exec_status"
export STUB_CALLS="${STUB_DIR}/calls"

cat >"${STUB_DIR}/docker" <<'STUB'
#!/bin/bash
printf '%s\n' "$*" >>"$STUB_CALLS"
case "$*" in
  *"ps -q caddy"*)
    cat "$STUB_PS_OUTPUT" 2>/dev/null
    exit 0
    ;;
  *"exec -T caddy"*)
    status=$(cat "$STUB_EXEC_STATUS" 2>/dev/null || echo 0)
    if [ "$status" -ne 0 ]; then
      echo "adapting config: Caddyfile:12 - unrecognized directive: bogus" >&2
    fi
    exit "$status"
    ;;
esac
exit 0
STUB
chmod +x "${STUB_DIR}/docker"
PATH="${STUB_DIR}:${PATH}"

reset_stub() {
  : >"$STUB_CALLS"
  printf '%s' "${1-}" >"$STUB_PS_OUTPUT"
  printf '%s' "${2:-0}" >"$STUB_EXEC_STATUS"
}

echo "reload_caddy"

# ── A bundled Caddy is running and reloads cleanly ────────────────────────────
reset_stub "abc123def456" 0
OUT=$(reload_caddy)
assert_eq "$?" "0" "returns 0 when the reload succeeds"
assert_eq "$OUT" "" "prints nothing on success"
assert_contains "$(cat "$STUB_CALLS")" "exec -T caddy caddy reload" \
  "actually issues a reload"
assert_contains "$(cat "$STUB_CALLS")" "--config /etc/caddy/Caddyfile" \
  "reloads the Caddyfile from its container path"

# ── No bundled Caddy (shared-server setup) ────────────────────────────────────
# The service is defined but sits behind the "standalone" profile, so
# `docker compose ps -q caddy` prints nothing.
reset_stub "" 0
OUT=$(reload_caddy)
assert_eq "$?" "2" "returns 2 when no bundled caddy is running"
assert_eq "$OUT" "" "prints nothing when skipping"
if grep -q "exec -T caddy" "$STUB_CALLS" 2>/dev/null; then
  fail "must not exec into a container that isn't running"
else
  pass "does not exec into a container that isn't running"
fi

# ── Reload fails (e.g. a broken Caddyfile) ────────────────────────────────────
# Caddy validates before applying, so it keeps serving the previous config —
# but the deploy must not report success.
reset_stub "abc123def456" 1
OUT=$(reload_caddy)
assert_eq "$?" "1" "returns 1 when the reload fails"
assert_contains "$OUT" "unrecognized directive" \
  "surfaces Caddy's error instead of swallowing it"

# ── Container path is overridable ─────────────────────────────────────────────
reset_stub "abc123def456" 0
CADDYFILE_CONTAINER_PATH=/custom/Caddyfile reload_caddy >/dev/null
assert_contains "$(cat "$STUB_CALLS")" "--config /custom/Caddyfile" \
  "honours CADDYFILE_CONTAINER_PATH"

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ] || exit 1
