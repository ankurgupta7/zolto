#!/bin/bash
# deploy/lib/secrets.test.sh — tests for deploy/lib/secrets.sh
#
# Plain bash, no framework. Run with:
#
#   bash deploy/lib/secrets.test.sh
#
# These functions rotate live credentials, so the failure modes are expensive:
# a mangled .env takes the deployment down, and a secret pushed to the wrong
# place (or logged in full) is a leak. The network-facing functions are
# exercised against stubbed `gh` and `curl` binaries — $GH_BIN / $CURL_BIN
# exist for exactly this — so the assertions cover the arguments a real run
# would send without any of it leaving the machine.
#
# Regression target: the old rotation scripts wrote .env with
#   sed -i "s|^KEY=.*|KEY=$value|"
# which corrupts any value containing `&` (sed expands it to the whole match)
# or `|` (it terminates the s command). set_env_var must store values literally.

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
    fail "$3 (expected to find '$2' in '$1')"
  fi
}

assert_not_contains() { # assert_not_contains haystack needle description
  if [[ "$1" != *"$2"* ]]; then
    pass "$3"
  else
    fail "$3 (did NOT expect to find '$2' in '$1')"
  fi
}

# shellcheck source=deploy/lib/secrets.sh
source "${SCRIPT_DIR}/secrets.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ── read_env_var ──────────────────────────────────────────────────────────────
echo ""
echo "read_env_var:"

ENV_A="$WORK/a.env"
cat >"$ENV_A" <<'EOF'
# a comment
PLAIN=hello
QUOTED_DQ="double quoted"
QUOTED_SQ='single quoted'
  export EXPORTED=fromexport
PUBLIC_BASE_URL=https://zolto.ch
WITH_EQUALS=a=b=c
EMPTY=
FIRST=one
FIRST=two
EOF

assert_eq "$(read_env_var "$ENV_A" PLAIN)" "hello" "reads a plain value"
assert_eq "$(read_env_var "$ENV_A" QUOTED_DQ)" "double quoted" "strips double quotes"
assert_eq "$(read_env_var "$ENV_A" QUOTED_SQ)" "single quoted" "strips single quotes"
assert_eq "$(read_env_var "$ENV_A" EXPORTED)" "fromexport" "tolerates indentation and 'export '"
assert_eq "$(read_env_var "$ENV_A" PUBLIC_BASE_URL)" "https://zolto.ch" "reads a URL"
assert_eq "$(read_env_var "$ENV_A" WITH_EQUALS)" "a=b=c" "keeps '=' inside the value"
assert_eq "$(read_env_var "$ENV_A" EMPTY)" "" "an empty value reads as empty"
assert_eq "$(read_env_var "$ENV_A" FIRST)" "one" "first occurrence wins"
assert_eq "$(read_env_var "$ENV_A" ABSENT)" "" "a missing key reads as empty"
assert_eq "$(read_env_var "$WORK/nope.env" PLAIN)" "" "a missing file reads as empty"

# A key that is a prefix of another must not match it.
printf 'STRIPE_SECRET_KEY_OLD=nope\nSTRIPE_SECRET_KEY=yes\n' >"$WORK/prefix.env"
assert_eq "$(read_env_var "$WORK/prefix.env" STRIPE_SECRET_KEY)" "yes" \
  "a longer key is not mistaken for the one asked for"

# ── set_env_var ───────────────────────────────────────────────────────────────
echo ""
echo "set_env_var:"

ENV_B="$WORK/b.env"
cat >"$ENV_B" <<'EOF'
# keep me
KEEP_BEFORE=untouched
STRIPE_SECRET_KEY=sk_live_old
KEEP_AFTER=also untouched
EOF

set_env_var "$ENV_B" STRIPE_SECRET_KEY "rk_live_new"
assert_eq "$(read_env_var "$ENV_B" STRIPE_SECRET_KEY)" "rk_live_new" "replaces an existing value"
assert_eq "$(read_env_var "$ENV_B" KEEP_BEFORE)" "untouched" "leaves earlier lines alone"
assert_eq "$(read_env_var "$ENV_B" KEEP_AFTER)" "also untouched" "leaves later lines alone"
assert_contains "$(cat "$ENV_B")" "# keep me" "keeps comments"

set_env_var "$ENV_B" STRIPE_POS_WEBHOOK_SECRET "whsec_appended"
assert_eq "$(read_env_var "$ENV_B" STRIPE_POS_WEBHOOK_SECRET)" "whsec_appended" \
  "appends a key that was not there"

# The regression the shared helper exists for.
set_env_var "$ENV_B" TRICKY 'a&b|c/d\e'
assert_eq "$(read_env_var "$ENV_B" TRICKY)" 'a&b|c/d\e' \
  "stores & | / and backslash literally (sed would have mangled these)"

set_env_var "$ENV_B" POS_API_BASE_URL 'https://zolto.ch/api?a=1&b=2'
assert_eq "$(read_env_var "$ENV_B" POS_API_BASE_URL)" 'https://zolto.ch/api?a=1&b=2' \
  "stores a URL with a query string intact"

# A file whose last line has no newline must not get its last key glued to the
# appended one.
printf 'NO_TRAILING=newline' >"$WORK/c.env"
set_env_var "$WORK/c.env" ADDED "value"
assert_eq "$(read_env_var "$WORK/c.env" NO_TRAILING)" "newline" \
  "a file with no trailing newline keeps its last key"
assert_eq "$(read_env_var "$WORK/c.env" ADDED)" "value" \
  "and still gets the appended key"

# Rewriting must not multiply the file's line count.
before_lines="$(wc -l <"$ENV_B")"
set_env_var "$ENV_B" STRIPE_SECRET_KEY "rk_live_newer"
after_lines="$(wc -l <"$ENV_B")"
assert_eq "$after_lines" "$before_lines" "replacing a key does not add lines"

# ── backup_env_file ───────────────────────────────────────────────────────────
echo ""
echo "backup_env_file:"

BACKUP="$(backup_env_file "$ENV_B")"
if [ -f "$BACKUP" ]; then
  pass "creates the backup file"
else
  fail "creates the backup file (no file at '$BACKUP')"
fi
assert_eq "$(cat "$BACKUP")" "$(cat "$ENV_B")" "backup is a faithful copy"
assert_contains "$BACKUP" "$ENV_B.bak-" "backup path is the original plus a .bak- stamp"

# ── mask_secret ───────────────────────────────────────────────────────────────
echo ""
echo "mask_secret:"

# Deliberately not shaped like a real provider key: a convincing `sk_live_…`
# fixture trips GitHub's push protection, which cannot tell a test's invented
# value from a leaked one — and it is right not to try.
LONG_SECRET="EXAMPLE-NOT-A-REAL-KEY-tailmustnotappear"
MASKED="$(mask_secret "$LONG_SECRET")"
assert_eq "$MASKED" "EXAMPLE-NOT-..." "shows a 12-character prefix"
assert_not_contains "$MASKED" "tailmustnotappear" "never shows the tail of the secret"
assert_eq "$(mask_secret "short")" "********" "a short value is masked entirely"

# ── json_escape ───────────────────────────────────────────────────────────────
echo ""
echo "json_escape:"

assert_eq "$(json_escape 'plain')" 'plain' "leaves a plain value alone"
assert_eq "$(json_escape 'say "hi"')" 'say \"hi\"' "escapes double quotes"
assert_eq "$(json_escape 'back\slash')" 'back\\slash' "escapes backslashes"

# ── http_json (stubbed curl) ──────────────────────────────────────────────────
echo ""
echo "http_json:"

CURL_STUB="$WORK/curl-stub"
cat >"$CURL_STUB" <<'STUB'
#!/bin/bash
# Emulates the `curl -sS -o FILE -w '%{http_code}' ...` shape http_json uses.
# Records its arguments, writes $STUB_BODY to the -o file, prints $STUB_STATUS.
{ for a in "$@"; do printf '%s\n' "$a"; done; } >"$STUB_ARGS"
out=""
prev=""
for a in "$@"; do
  if [ "$prev" = "-o" ]; then out="$a"; fi
  prev="$a"
done
[ -n "$out" ] && printf '%s' "${STUB_BODY:-}" >"$out"
printf '%s' "${STUB_STATUS:-200}"
STUB
chmod +x "$CURL_STUB"
export CURL_BIN="$CURL_STUB"
export STUB_ARGS="$WORK/curl-args"

RESULT="$(STUB_STATUS=200 STUB_BODY='{"secret":"whsec_abc"}' \
  http_json GET "https://example.test/thing" -H "x-test: 1" 2>"$WORK/err")"
assert_eq "$RESULT" '{"secret":"whsec_abc"}' "returns the body on 200"
assert_contains "$(cat "$STUB_ARGS")" "https://example.test/thing" "passes the URL through"
assert_contains "$(cat "$STUB_ARGS")" "x-test: 1" "passes extra curl arguments through"

STUB_STATUS=201 RESULT="$(STUB_STATUS=201 STUB_BODY='{"ok":true}' http_json POST "https://example.test/x")"
assert_eq "$RESULT" '{"ok":true}' "treats any 2xx as success"

if STUB_STATUS=402 STUB_BODY='{"error":"card_declined"}' \
  http_json POST "https://example.test/x" >"$WORK/out" 2>"$WORK/err"; then
  fail "returns non-zero on a 4xx"
else
  pass "returns non-zero on a 4xx"
fi
assert_contains "$(cat "$WORK/err")" "402" "reports the status code on failure"
assert_contains "$(cat "$WORK/err")" "card_declined" \
  "reports the provider's error body instead of swallowing it"

# ── github_secret_set (stubbed gh) ────────────────────────────────────────────
echo ""
echo "github_secret_set:"

GH_STUB="$WORK/gh-stub"
cat >"$GH_STUB" <<'STUB'
#!/bin/bash
{ for a in "$@"; do printf '%s\n' "$a"; done; } >"$STUB_GH_ARGS"
cat >"$STUB_GH_STDIN"
STUB
chmod +x "$GH_STUB"
export GH_BIN="$GH_STUB"
export STUB_GH_ARGS="$WORK/gh-args"
export STUB_GH_STDIN="$WORK/gh-stdin"

github_secret_set "ankurgupta7/zolto" "POS_API_KEY" "deadbeef123"
GH_ARGS="$(cat "$STUB_GH_ARGS")"
assert_contains "$GH_ARGS" "secret" "invokes 'gh secret set'"
assert_contains "$GH_ARGS" "POS_API_KEY" "passes the secret name"
assert_contains "$GH_ARGS" "ankurgupta7/zolto" "passes the repo"
assert_eq "$(cat "$STUB_GH_STDIN")" "deadbeef123" "sends the value on stdin"
assert_not_contains "$GH_ARGS" "deadbeef123" \
  "never puts the secret in argv, where ps would expose it"

# ── codemagic_var_set (stubbed curl) ──────────────────────────────────────────
echo ""
echo "codemagic_var_set:"

if (
  unset CODEMAGIC_TOKEN
  codemagic_var_set "app123" "POS_API_KEY" "abc" 2>/dev/null
); then
  fail "refuses to run without CODEMAGIC_TOKEN"
else
  pass "refuses to run without CODEMAGIC_TOKEN"
fi

export CODEMAGIC_TOKEN="cm-token-xyz"
STUB_STATUS=200 STUB_BODY='{}' codemagic_var_set "app123" "POS_API_KEY" "deadbeef123"
CM_ARGS="$(cat "$STUB_ARGS")"
assert_contains "$CM_ARGS" "https://api.codemagic.io/apps/app123/variables" \
  "posts to the app's variables endpoint"
assert_contains "$CM_ARGS" "x-auth-token: cm-token-xyz" "sends the auth token header"
assert_contains "$CM_ARGS" '"POS_API_KEY":"deadbeef123"' "sends the variable in the payload"

if STUB_STATUS=401 STUB_BODY='{"error":"bad token"}' \
  codemagic_var_set "app123" "POS_API_KEY" "abc" 2>"$WORK/err"; then
  fail "surfaces a rejected Codemagic request"
else
  pass "surfaces a rejected Codemagic request"
fi
assert_contains "$(cat "$WORK/err")" "bad token" \
  "reports why Codemagic refused instead of reporting success"

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
