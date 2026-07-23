#!/bin/bash
# deploy/lib/env.test.sh — tests for deploy/lib/env.sh
#
# Plain bash, no framework: sources the real env.sh and exercises load_env
# against temporary .env fixtures. Run with:
#
#   bash deploy/lib/env.test.sh
#
# Regression target: update.sh used to `source` the .env, which *executes*
# every line. A value containing shell metacharacters — the real deployment's
#   RESEND_FROM_EMAIL=Kalakosh <orders@kalakosh.ch>
# being the culprit — made bash choke with
#   syntax error near unexpected token `newline'
# and aborted the whole deploy in pre-flight. These tests assert load_env
# parses such values literally and exports them intact.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Tallies live in files so counts survive the per-case subshells below.
PASS_FILE="$(mktemp)"
FAIL_FILE="$(mktemp)"
trap 'rm -f "$PASS_FILE" "$FAIL_FILE"' EXIT

pass() { echo x >> "$PASS_FILE"; echo "  ok - $1"; }
fail() { echo x >> "$FAIL_FILE"; echo "  NOT OK - $1"; }

assert_eq() { # assert_eq actual expected description
  if [[ "$1" == "$2" ]]; then
    pass "$3"
  else
    fail "$3 (expected '$2', got '$1')"
  fi
}

assert_unset() { # assert_unset varname description
  if [[ -z "${!1+x}" ]]; then
    pass "$2"
  else
    fail "$2 (expected '$1' to be unset, got '${!1}')"
  fi
}

# ── Load the code under test ──────────────────────────────────────────────────
# shellcheck source=/dev/null
source "${SCRIPT_DIR}/env.sh"

# Each test runs load_env in a subshell so exports don't leak between cases.
# pass/fail append to the shared tally files, so assertions inside a case still
# count toward — and can fail — the suite.
run_case() { # run_case <env-file-contents> <script-body>
  local contents="$1" body="$2" tmp
  tmp="$(mktemp)"
  printf '%s' "$contents" > "$tmp"
  (
    load_env "$tmp"
    eval "$body"
  )
  rm -f "$tmp"
}

echo "== load_env =="

# The exact value that broke the old `source`-based loader.
run_case 'RESEND_FROM_EMAIL=Kalakosh <orders@kalakosh.ch>
' '
  assert_eq "$RESEND_FROM_EMAIL" "Kalakosh <orders@kalakosh.ch>" "value with < > redirection chars preserved"
'

# A grab-bag of shell metacharacters that `source` would misinterpret.
run_case 'A=one two three
B=has(parens)and&ampersand;semicolon
C=pipe|and`backtick`and$dollar
D=trailing#hash not-a-comment
' '
  assert_eq "$A" "one two three"                         "spaces preserved"
  assert_eq "$B" "has(parens)and&ampersand;semicolon"    "parens/ampersand/semicolon preserved"
  assert_eq "$C" "pipe|and\`backtick\`and\$dollar"        "pipe/backtick/dollar preserved literally"
  assert_eq "$D" "trailing#hash not-a-comment"           "inline # kept (only full-line # is a comment)"
'

# Comments, blank lines, and leading whitespace (as in .env.example line 17).
run_case '# a comment
   # indented comment

 MYSQL_ROOT_PASSWORD=change_me
MYSQL_USER=kalakosh_user
' '
  assert_eq "$MYSQL_ROOT_PASSWORD" "change_me"    "leading-whitespace line parsed, key trimmed"
  assert_eq "$MYSQL_USER" "kalakosh_user"         "plain key/value parsed"
'

# Values with `=` in them, and empty values.
run_case 'DATABASE_URL=mysql://u:p@db:3306/name?opt=1
EMPTY=
' '
  assert_eq "$DATABASE_URL" "mysql://u:p@db:3306/name?opt=1" "= inside value kept (split on first = only)"
  assert_eq "$EMPTY" ""                                       "empty value allowed"
'

# Surrounding quotes are stripped (a single matching pair only).
run_case 'DQ="quoted value"
SQ='\''single quoted'\''
INNER=a"b"c
' '
  assert_eq "$DQ" "quoted value"    "surrounding double quotes stripped"
  assert_eq "$SQ" "single quoted"   "surrounding single quotes stripped"
  assert_eq "$INNER" "a\"b\"c"       "inner quotes left untouched"
'

# `export ` prefix and non-identifier / malformed lines.
run_case 'export EXPORTED=yes
1INVALID=skipped
no-equals-here
VALID=kept
' '
  assert_eq "$EXPORTED" "yes"   "export prefix stripped, value exported"
  assert_unset INVALID          "key starting with a digit is skipped"
  assert_eq "$VALID" "kept"     "valid line after a bad one still parsed"
'

# CRLF line endings must not smuggle a trailing \r into the value.
run_case "$(printf 'CRLF=value\r\nNEXT=ok\r\n')" '
  assert_eq "$CRLF" "value"  "trailing CR stripped from CRLF file"
  assert_eq "$NEXT" "ok"     "second CRLF line parsed"
'

# A missing file is a no-op, not an error.
if load_env "${SCRIPT_DIR}/does-not-exist.env"; then
  pass "missing file returns success (no-op)"
else
  fail "missing file returns success (no-op)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
PASSES="$(wc -l < "$PASS_FILE" | tr -d '[:space:]')"
FAILURES="$(wc -l < "$FAIL_FILE" | tr -d '[:space:]')"
echo ""
echo "== $PASSES passed, $FAILURES failed =="
[ "$FAILURES" -eq 0 ]
