#!/bin/bash
# deploy/lib/env.test.sh — tests for deploy/lib/env.sh (load_dotenv)
#
# Plain bash, no framework. Run with:
#
#   bash deploy/lib/env.test.sh
#
# Regression target: update.sh used to `source` .env, which executes it as
# shell. A value containing a shell metacharacter — `online (bot)`, `p@ss(word)`
# — aborted the whole deploy with "syntax error near unexpected token", and a
# value like `$(cmd)` / a backtick would have been *executed*. load_dotenv must
# parse values literally: preserve metacharacters, never evaluate them.

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

# shellcheck source=deploy/lib/env.sh
source "${SCRIPT_DIR}/env.sh"

# A canary file that load_dotenv must NEVER create. If a value like $(...) or a
# backtick were executed instead of stored, this file would appear.
CANARY="$(mktemp -u)"

TMP_ENV="$(mktemp)"
cat >"$TMP_ENV" <<EOF
# a full-line comment
   # an indented comment

MYSQL_USER=kalakosh
MYSQL_PASSWORD=p@ss(word)&more
DISCORD_STATUS=online (bot)
QUOTED_DQ="spaced value"
QUOTED_SQ='single quoted'
PADDED="  keep inner padding  "
INLINE_HASH=value#notacomment
URL=https://example.com/path?a=1&b=2
EMPTY=
  export EXPORTED=fromexport
SPACED_KEY = trimmed
CMDSUBST=\$(touch ${CANARY})
BACKTICK=\`touch ${CANARY}\`
DOLLAR_REF=\$HOME/literal
RESEND_FROM_EMAIL=Zolto <orders@zolto.ch>
1INVALID=skipme
BAD-KEY=skipmetoo
EOF

# Load into a subshell-free context so exported vars are visible to asserts.
load_dotenv "$TMP_ENV"

# ── Ordinary values ───────────────────────────────────────────────────────────
assert_eq "${MYSQL_USER:-}" "kalakosh" "plain value loads"

# ── The actual bug: shell metacharacters in values ────────────────────────────
assert_eq "${MYSQL_PASSWORD:-}" 'p@ss(word)&more' "parens + ampersand preserved literally"
assert_eq "${DISCORD_STATUS:-}" 'online (bot)' "unquoted value with space and parens preserved"

# ── Quote handling ────────────────────────────────────────────────────────────
assert_eq "${QUOTED_DQ:-}" "spaced value" "surrounding double quotes stripped"
assert_eq "${QUOTED_SQ:-}" "single quoted" "surrounding single quotes stripped"
assert_eq "${PADDED:-}" "  keep inner padding  " "whitespace inside quotes preserved"

# ── Values that must stay literal, not be interpreted ─────────────────────────
assert_eq "${INLINE_HASH:-}" "value#notacomment" "inline # stays part of value"
assert_eq "${URL:-}" "https://example.com/path?a=1&b=2" "url with & and = preserved"
assert_eq "${EMPTY-unset}" "" "empty value stays set-but-empty"
assert_eq "${EXPORTED:-}" "fromexport" "leading 'export ' tolerated"
assert_eq "${SPACED_KEY:-}" "trimmed" "whitespace around key tolerated"
assert_eq "${DOLLAR_REF:-}" '$HOME/literal' "\$VAR reference kept literal, not expanded"
# The real value that broke the deploy scripts in production. `source` read the
# `<` as an input redirect ("/dev/fd/63: line N: orders@zolto.ch: No such file
# or directory"); `export $(... | xargs)` word-split it into an invalid
# identifier and aborted under `set -e`.
assert_eq "${RESEND_FROM_EMAIL:-}" 'Zolto <orders@zolto.ch>' "angle brackets survive (redirect chars not interpreted)"

# ── The safety guarantee: no value was ever executed ──────────────────────────
assert_eq "${CMDSUBST:-}" '$(touch '"${CANARY}"')' "command substitution stored, not run"
assert_eq "${BACKTICK:-}" '`touch '"${CANARY}"'`' "backtick substitution stored, not run"
if [ -e "$CANARY" ]; then
  fail "SECURITY: a value was executed — canary file was created"
  rm -f "$CANARY"
else
  pass "no value was executed (canary file absent)"
fi

# ── Invalid keys are skipped, not exported ────────────────────────────────────
# (Can't reference $1INVALID / $BAD-KEY directly — they aren't valid var names —
#  so inspect the exported environment instead.)
ENV_DUMP="$(env)"
case "$ENV_DUMP" in
  *"1INVALID="*) fail "key starting with a digit should be skipped" ;;
  *) pass "key starting with a digit is skipped" ;;
esac
case "$ENV_DUMP" in
  *"BAD-KEY="* | *"BAD_KEY="*) fail "key with an invalid character should be skipped" ;;
  *) pass "key with an invalid character is skipped" ;;
esac

# ── Missing file returns non-zero ─────────────────────────────────────────────
if load_dotenv "/no/such/file/here" 2>/dev/null; then
  fail "missing file should return non-zero"
else
  pass "missing file returns non-zero"
fi

rm -f "$TMP_ENV"

echo ""
echo "  ${PASSES} passed, ${FAILURES} failed"
[ "$FAILURES" -eq 0 ]
