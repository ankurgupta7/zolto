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


# ── json_get ──────────────────────────────────────────────────────────────────
echo ""
echo "json_get:"

B2_AUTH_FIXTURE='{"accountId":"acc123","authorizationToken":"tok456","apiInfo":{"storageApi":{"apiUrl":"https://api003.backblazeb2.com","bucketId":null}}}'

assert_eq "$(printf '%s' "$B2_AUTH_FIXTURE" | json_get accountId)" "acc123" \
  "reads a top-level field"
assert_eq "$(printf '%s' "$B2_AUTH_FIXTURE" | json_get apiInfo.storageApi.apiUrl)" \
  "https://api003.backblazeb2.com" "reads a nested field by dotted path"
assert_eq "$(printf '%s' "$B2_AUTH_FIXTURE" | json_get apiInfo.storageApi.missing)" "" \
  "a missing leaf reads as empty"
assert_eq "$(printf '%s' "$B2_AUTH_FIXTURE" | json_get nope.deeper.still)" "" \
  "a missing branch reads as empty rather than erroring"
assert_eq "$(printf '%s' "$B2_AUTH_FIXTURE" | json_get apiInfo.storageApi.bucketId)" "" \
  "an explicit null reads as empty"
assert_eq "$(printf '%s' '{"buckets":[{"bucketId":"b-1"}]}' | json_get buckets.0.bucketId)" "b-1" \
  "indexes into an array"

# ── b2_authorize / b2_api (stubbed curl) ──────────────────────────────────────
echo ""
echo "b2_authorize / b2_api:"

STUB_STATUS=200 STUB_BODY="$B2_AUTH_FIXTURE" b2_authorize "masterid" "mastersecret" >/dev/null
B2_ARGS="$(cat "$STUB_ARGS")"
assert_contains "$B2_ARGS" "b2api/v3/b2_authorize_account" "authorizes against the v3 endpoint"
assert_contains "$B2_ARGS" "masterid:mastersecret" "sends the master key as basic auth"

STUB_STATUS=200 STUB_BODY='{"applicationKeyId":"k-new","applicationKey":"s-new"}' \
  b2_api "https://api003.backblazeb2.com/" "tok456" b2_create_key '{"accountId":"acc123"}' >/dev/null
CREATE_ARGS="$(cat "$STUB_ARGS")"
assert_contains "$CREATE_ARGS" "https://api003.backblazeb2.com/b2api/v3/b2_create_key" \
  "normalizes a trailing slash on the API URL"
assert_contains "$CREATE_ARGS" "Authorization: tok456" "sends the session token"
assert_contains "$CREATE_ARGS" '{"accountId":"acc123"}' "sends the body verbatim"

if STUB_STATUS=401 STUB_BODY='{"message":"not authorized to write keys"}' \
  b2_api "https://api003.backblazeb2.com" "tok" b2_create_key '{}' >/dev/null 2>"$WORK/b2err"; then
  fail "surfaces a rejected B2 request"
else
  pass "surfaces a rejected B2 request"
fi
assert_contains "$(cat "$WORK/b2err")" "not authorized to write keys" \
  "reports why B2 refused"

# ── s3_probe ──────────────────────────────────────────────────────────────────
echo ""
echo "s3_probe:"

# The stub records only the LAST invocation, so a fully successful probe leaves
# the DELETE behind — which is what proves the probe cleans up after itself.
STUB_STATUS=200 STUB_BODY='' \
  s3_probe "https://s3.eu-central-003.backblazeb2.com" "eu-central-003" "zolto-images" \
  "keyid" "keysecret" "_probe-1"
PROBE_ARGS="$(cat "$STUB_ARGS")"
assert_contains "$PROBE_ARGS" "https://s3.eu-central-003.backblazeb2.com/zolto-images/_probe-1" \
  "addresses the object path-style, as forcePathStyle does"
assert_contains "$PROBE_ARGS" "aws:amz:eu-central-003:s3" "signs with the bucket's region"
assert_contains "$PROBE_ARGS" "DELETE" "deletes the probe object last"
assert_contains "$PROBE_ARGS" "keyid:keysecret" "uses the key being verified, not the master"

if STUB_STATUS=403 STUB_BODY='<Error>AccessDenied</Error>' \
  s3_probe "https://s3.x.backblazeb2.com" "r" "b" "id" "sec" 2>/dev/null; then
  fail "fails when the new key cannot write"
else
  pass "fails when the new key cannot write"
fi

# ── rotate-secrets.sh s3-key (end to end, stubbed curl) ───────────────────────
echo ""
echo "rotate-secrets.sh s3-key:"

ROTATE="${SCRIPT_DIR}/../rotate-secrets.sh"

# A .env that still carries .env.example's placeholders has no key to rotate;
# saying so beats a TLS failure against a hostname that never existed.
cat >"$WORK/placeholder.env" <<'ENVEOF'
S3_BUCKET=zolto-images
S3_REGION=auto
S3_ENDPOINT=https://your_account_id.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=your_access_key
S3_SECRET_ACCESS_KEY=your_secret_key
ENVEOF
OUT="$(B2_MASTER_KEY_ID=m B2_MASTER_KEY=s bash "$ROTATE" s3-key \
  --env "$WORK/placeholder.env" 2>&1 || true)"
assert_contains "$OUT" "still holds .env.example placeholders" \
  "refuses an unconfigured deployment instead of failing at the network"

cat >"$WORK/s3.env" <<'ENVEOF'
KEEP_ME=untouched
S3_BUCKET=zolto-images
S3_REGION=eu-central-003
S3_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
S3_ACCESS_KEY_ID=oldkeyid
S3_SECRET_ACCESS_KEY=oldkeysecret
ENVEOF

OUT="$(B2_MASTER_KEY_ID=m B2_MASTER_KEY=s bash "$ROTATE" s3-key \
  --env "$WORK/s3.env" --dry-run 2>&1 || true)"
assert_contains "$OUT" "would create a key" "dry run says what it would create"
assert_eq "$(read_env_var "$WORK/s3.env" S3_ACCESS_KEY_ID)" "oldkeyid" \
  "dry run leaves .env alone"

# A non-B2 endpoint is refused rather than half-attempted.
cat >"$WORK/r2.env" <<'ENVEOF'
S3_BUCKET=zolto-images
S3_REGION=auto
S3_ENDPOINT=https://abc123.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=realkeyid
ENVEOF
OUT="$(B2_MASTER_KEY_ID=m B2_MASTER_KEY=s bash "$ROTATE" s3-key \
  --env "$WORK/r2.env" 2>&1 || true)"
assert_contains "$OUT" "Only Backblaze B2 key rotation is automated" \
  "refuses a provider it cannot mint keys for"

# Missing operator credentials must stop it before anything is created.
OUT="$(env -u B2_MASTER_KEY_ID -u B2_MASTER_KEY bash "$ROTATE" s3-key \
  --env "$WORK/s3.env" 2>&1 || true)"
assert_contains "$OUT" "B2_MASTER_KEY_ID and B2_MASTER_KEY must be exported" \
  "requires the key-minting credential up front"
assert_eq "$(read_env_var "$WORK/s3.env" S3_ACCESS_KEY_ID)" "oldkeyid" \
  "and changes nothing when it is absent"

# Full run against a scripted B2: authorize → list bucket → create → probe →
# write → delete. The stub answers each call by the endpoint in its arguments.
B2_STUB="$WORK/b2-stub"
cat >"$B2_STUB" <<'STUB'
#!/bin/bash
{ for a in "$@"; do printf '%s\n' "$a"; done; } >>"$STUB_CALLS"
out=""; prev=""; url=""
for a in "$@"; do
  [ "$prev" = "-o" ] && out="$a"
  case "$a" in https://*) url="$a" ;; esac
  prev="$a"
done
body='{}'
case "$url" in
  *b2_authorize_account*) body='{"accountId":"acc123","authorizationToken":"tok456","apiInfo":{"storageApi":{"apiUrl":"https://api003.backblazeb2.com"}}}' ;;
  *b2_list_buckets*)      body='{"buckets":[{"bucketId":"bucket-1","bucketName":"zolto-images"}]}' ;;
  *b2_create_key*)        body='{"applicationKeyId":"newkeyid","applicationKey":"newkeysecret"}' ;;
  *b2_delete_key*)        body='{"applicationKeyId":"oldkeyid"}' ;;
esac
[ -n "$out" ] && printf '%s' "$body" >"$out"
printf '200'
STUB
chmod +x "$B2_STUB"

# The real script probes for --aws-sigv4 support with `curl --help all`; the
# stub answers that too so the verification step runs.
cat >"$WORK/b2-stub-help" <<'STUB'
#!/bin/bash
if [ "$1" = "--help" ]; then echo "     --aws-sigv4 <provider1[:provider2...]>"; exit 0; fi
exec "$B2_STUB_INNER" "$@"
STUB
chmod +x "$WORK/b2-stub-help"

export STUB_CALLS="$WORK/b2-calls"
: >"$STUB_CALLS"
OUT="$(B2_MASTER_KEY_ID=masterid B2_MASTER_KEY=mastersecret \
  B2_STUB_INNER="$B2_STUB" CURL_BIN="$WORK/b2-stub-help" \
  bash "$ROTATE" s3-key --env "$WORK/s3.env" 2>&1 || true)"

assert_eq "$(read_env_var "$WORK/s3.env" S3_ACCESS_KEY_ID)" "newkeyid" \
  "writes the new key id to .env"
assert_eq "$(read_env_var "$WORK/s3.env" S3_SECRET_ACCESS_KEY)" "newkeysecret" \
  "writes the new secret to .env"
assert_eq "$(read_env_var "$WORK/s3.env" KEEP_ME)" "untouched" \
  "leaves unrelated keys alone"
CALLS="$(cat "$STUB_CALLS")"
assert_contains "$CALLS" "b2_create_key" "mints a key"
assert_contains "$CALLS" '"bucketId":"bucket-1"' "scopes the key to the bucket, not the account"
assert_contains "$CALLS" "b2_delete_key" "revokes the key it replaced"
assert_contains "$CALLS" '"applicationKeyId":"oldkeyid"' "revokes the OLD id, not the new one"
assert_not_contains "$OUT" "newkeysecret" "never prints the new secret"

# --keep-old must not revoke anything.
cat >"$WORK/s3b.env" <<'ENVEOF'
S3_BUCKET=zolto-images
S3_REGION=eu-central-003
S3_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
S3_ACCESS_KEY_ID=oldkeyid
S3_SECRET_ACCESS_KEY=oldkeysecret
ENVEOF
: >"$STUB_CALLS"
B2_MASTER_KEY_ID=masterid B2_MASTER_KEY=mastersecret \
  B2_STUB_INNER="$B2_STUB" CURL_BIN="$WORK/b2-stub-help" \
  bash "$ROTATE" s3-key --env "$WORK/s3b.env" --keep-old >/dev/null 2>&1 || true
assert_not_contains "$(cat "$STUB_CALLS")" "b2_delete_key" \
  "--keep-old leaves the previous key alive"
assert_eq "$(read_env_var "$WORK/s3b.env" S3_ACCESS_KEY_ID)" "newkeyid" \
  "--keep-old still installs the new key"

# A key that cannot complete the S3 round-trip must never reach .env, and the
# old one must survive — this is the ordering the whole target is built around.
FAIL_STUB="$WORK/b2-stub-failprobe"
cat >"$FAIL_STUB" <<'STUB'
#!/bin/bash
{ for a in "$@"; do printf '%s\n' "$a"; done; } >>"$STUB_CALLS"
out=""; prev=""; url=""
for a in "$@"; do
  [ "$prev" = "-o" ] && out="$a"
  case "$a" in https://*) url="$a" ;; esac
  prev="$a"
done
body='{}'; status=200
case "$url" in
  *b2_authorize_account*) body='{"accountId":"acc123","authorizationToken":"tok456","apiInfo":{"storageApi":{"apiUrl":"https://api003.backblazeb2.com"}}}' ;;
  *b2_list_buckets*)      body='{"buckets":[{"bucketId":"bucket-1"}]}' ;;
  *b2_create_key*)        body='{"applicationKeyId":"newkeyid","applicationKey":"newkeysecret"}' ;;
  *backblazeb2.com/zolto-images/*) body='<Error>AccessDenied</Error>'; status=403 ;;
esac
[ -n "$out" ] && printf '%s' "$body" >"$out"
printf '%s' "$status"
STUB
chmod +x "$FAIL_STUB"

cat >"$WORK/s3c.env" <<'ENVEOF'
S3_BUCKET=zolto-images
S3_REGION=eu-central-003
S3_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
S3_ACCESS_KEY_ID=oldkeyid
S3_SECRET_ACCESS_KEY=oldkeysecret
ENVEOF
: >"$STUB_CALLS"
OUT="$(B2_MASTER_KEY_ID=masterid B2_MASTER_KEY=mastersecret \
  B2_STUB_INNER="$FAIL_STUB" CURL_BIN="$WORK/b2-stub-help" \
  bash "$ROTATE" s3-key --env "$WORK/s3c.env" 2>&1 || true)"
assert_eq "$(read_env_var "$WORK/s3c.env" S3_ACCESS_KEY_ID)" "oldkeyid" \
  "a failed probe leaves the working key in .env"
assert_not_contains "$(cat "$STUB_CALLS")" "b2_delete_key" \
  "a failed probe never revokes the key still in use"
assert_contains "$OUT" "Nothing was changed" "and says so"
assert_contains "$OUT" "newkeyid" "naming the orphaned key so it can be cleaned up"

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
