#!/bin/bash
# deploy/lib/secrets.sh — shared plumbing for deploy/rotate-secrets.sh.
#
# Every rotation this repo has ever had (Stripe API key, Stripe webhook
# signing secrets, and the POS CI key that used to live in the now-retired
# deploy/rotate-pos-key.sh) does the same four things: read a value out of
# .env, call somebody's REST API, write a new value back into .env, and push
# a secret to a CI provider. Each script grew its own copy of all four, so a
# fix in one never reached the others. These are the one copy.
#
# Sourced (not executed) by deploy/rotate-secrets.sh, and exercised directly
# by deploy/lib/secrets.test.sh — every function here is pure enough to test
# without network access (see GH_BIN / CURL_BIN below).
#
# The `gh` and `curl` binaries are indirected through $GH_BIN and $CURL_BIN so
# the test suite can substitute stubs and assert on the exact arguments a real
# run would send.

# ── .env reading ──────────────────────────────────────────────────────────────
#
# Parsing rules deliberately match deploy/lib/env.sh's load_dotenv (leading
# `export ` tolerated, one layer of surrounding quotes stripped, CRLF
# tolerated, value taken literally and never evaluated). This reads a single
# key rather than exporting the whole file, because a rotation script shells
# out to `gh` and `curl` and there is no reason to hand those processes every
# secret the deployment owns.

# read_env_var <file> <key>
# Prints the value of <key>, or nothing if the file or key is absent.
read_env_var() {
  local file="$1" key="$2" line stripped val

  [ -f "$file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    stripped=${line#"${line%%[![:space:]]*}"}
    stripped=${stripped#export }
    case "$stripped" in
      "$key"=*) ;;
      *) continue ;;
    esac

    val=${stripped#*=}
    # Strip one layer of matching surrounding quotes.
    case "$val" in
      \"*\") val=${val#\"}; val=${val%\"} ;;
      \'*\') val=${val#\'}; val=${val%\'} ;;
    esac
    printf '%s' "$val"
    return 0
  done <"$file"
}

# ── .env writing ──────────────────────────────────────────────────────────────

# backup_env_file <file>
# Copies <file> to <file>.bak-YYYYmmdd-HHMMSS and prints the backup path.
backup_env_file() {
  local file="$1" backup
  backup="${file}.bak-$(date -u +%Y%m%d-%H%M%S)"
  cp "$file" "$backup"
  printf '%s' "$backup"
}

# set_env_var <file> <key> <value>
# Replaces every `KEY=` assignment with KEY=<value>, appending it if the key is
# absent. Rewrites the file line by line rather than with `sed -i s|^KEY=.*|…|`,
# which is how the old scripts did it and which silently corrupts any value
# containing `&` (sed expands it to the whole match) or `|` (it ends the s
# command). Stripe keys happen to be alphanumeric, so the bug never fired —
# but a base URL with a query string or a generated password would hit it.
set_env_var() {
  local file="$1" key="$2" value="$3"
  local tmp line stripped found=0

  tmp="$(mktemp)"
  while IFS= read -r line || [ -n "$line" ]; do
    stripped=${line%$'\r'}
    stripped=${stripped#"${stripped%%[![:space:]]*}"}
    stripped=${stripped#export }
    case "$stripped" in
      "$key"=*)
        printf '%s=%s\n' "$key" "$value" >>"$tmp"
        found=1
        ;;
      *) printf '%s\n' "$line" >>"$tmp" ;;
    esac
  done <"$file"

  if [ "$found" -eq 0 ]; then
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
  fi

  cat "$tmp" >"$file"
  rm -f "$tmp"
}

# ── formatting ────────────────────────────────────────────────────────────────

# mask_secret <value>
# Prints a short identifying prefix, never the whole secret. Rotation scripts
# log what they did; they must not log what they rotated.
mask_secret() {
  local value="$1"
  if [ "${#value}" -le 12 ]; then
    printf '%s' "********"
  else
    printf '%s...' "${value:0:12}"
  fi
}

# json_escape <value>
# Escapes a value for embedding in a JSON string literal.
json_escape() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//\"/\\\"}
  value=${value//$'\n'/\\n}
  value=${value//$'\r'/\\r}
  value=${value//$'\t'/\\t}
  printf '%s' "$value"
}

# ── HTTP ──────────────────────────────────────────────────────────────────────

# http_json <method> <url> [curl args...]
# Prints the response body on 2xx. On anything else, prints the status and the
# body to stderr and returns 1 — the old scripts used `curl -sf … >/dev/null`,
# which threw away the provider's explanation of what went wrong.
http_json() {
  local method="$1" url="$2"
  shift 2
  local tmp status body

  tmp="$(mktemp)"
  if ! status="$("${CURL_BIN:-curl}" -sS -o "$tmp" -w '%{http_code}' -X "$method" "$url" "$@")"; then
    rm -f "$tmp"
    echo "ERROR: $method $url — the request could not be made." >&2
    return 1
  fi
  body="$(cat "$tmp")"
  rm -f "$tmp"

  case "$status" in
    2*) printf '%s' "$body" ;;
    *)
      echo "ERROR: $method $url returned HTTP $status:" >&2
      echo "$body" >&2
      return 1
      ;;
  esac
}

# ── CI destinations ───────────────────────────────────────────────────────────

# github_secret_set <repo> <name> <value>
# The value goes in on stdin, never as an argv element — arguments are visible
# to any other process on the box via `ps`.
github_secret_set() {
  local repo="$1" name="$2" value="$3"
  printf '%s' "$value" | "${GH_BIN:-gh}" secret set "$name" --repo "$repo" >/dev/null
}

# codemagic_var_set <app_id> <name> <value>
# Requires CODEMAGIC_TOKEN in the environment. Codemagic has no CLI, so this is
# the REST API; unlike the old script the response is checked, so a rejected
# request is reported instead of being mistaken for success.
codemagic_var_set() {
  local app_id="$1" name="$2" value="$3"
  local payload

  if [ -z "${CODEMAGIC_TOKEN:-}" ]; then
    echo "ERROR: CODEMAGIC_TOKEN is not set in the environment." >&2
    return 1
  fi

  payload="$(printf '{"environment":{"variables":{"%s":"%s"}}}' \
    "$(json_escape "$name")" "$(json_escape "$value")")"

  http_json POST "https://api.codemagic.io/apps/${app_id}/variables" \
    -H "Content-Type: application/json" \
    -H "x-auth-token: ${CODEMAGIC_TOKEN}" \
    -d "$payload" >/dev/null
}

# ── JSON reading ──────────────────────────────────────────────────────────────

# json_get <dotted.path>   (JSON on stdin)
# Prints the value at <dotted.path>, or nothing when any segment is missing.
# The rotation targets read nested provider responses (B2 buries its API URL at
# apiInfo.storageApi.apiUrl), and a bespoke grep per field is how the old
# scripts ended up mis-parsing one.
json_get() {
  if command -v jq >/dev/null 2>&1; then
    # A numeric segment has to become a number: getpath indexes an array with
    # 0, and dies on the string "0". Provider responses nest lists (B2 returns
    # buckets[]), so paths must be able to walk into one.
    jq -r --arg p "$1" '
      getpath($p | split(".") | map(if test("^[0-9]+$") then tonumber else . end))
      // empty' 2>/dev/null
  else
    python3 -c '
import sys, json
doc = json.load(sys.stdin)
for part in sys.argv[1].split("."):
    if isinstance(doc, list):
        try:
            doc = doc[int(part)]
        except (ValueError, IndexError):
            doc = None
    elif isinstance(doc, dict):
        doc = doc.get(part)
    else:
        doc = None
    if doc is None:
        break
print("" if doc is None else doc)
' "$1"
  fi
}

# ── Backblaze B2 (S3 application keys) ────────────────────────────────────────
#
# The S3-compatible API cannot mint its own credentials, so key rotation goes
# through B2's native API. That needs a key with the `writeKeys` capability —
# in practice the master application key, which is why it is read from the
# environment (B2_MASTER_KEY_ID / B2_MASTER_KEY) and never from .env: the
# deployment must not hold a credential that can create further credentials.

B2_API_ROOT="${B2_API_ROOT:-https://api.backblazeb2.com}"

# b2_authorize <key_id> <key>
# Prints the b2_authorize_account response. accountId, the storage API URL and
# the authorization token are read out of it with json_get.
b2_authorize() {
  http_json GET "${B2_API_ROOT}/b2api/v3/b2_authorize_account" -u "${1}:${2}"
}

# b2_api <api_url> <token> <endpoint> <json_body>
b2_api() {
  http_json POST "${1%/}/b2api/v3/${3}" \
    -H "Authorization: ${2}" \
    -H "Content-Type: application/json" \
    --data-binary "${4}"
}

# ── S3 round-trip probe ───────────────────────────────────────────────────────

# curl_supports_sigv4
# --aws-sigv4 landed in curl 7.75 (2021). Without it the probe cannot run and
# the caller must decide whether to rotate unverified.
curl_supports_sigv4() {
  "${CURL_BIN:-curl}" --help all 2>/dev/null | grep -q -- '--aws-sigv4'
}

# s3_probe <endpoint> <region> <bucket> <key_id> <secret> [object_key]
# Writes, reads back and deletes one small object through the S3-compatible
# API — the same three operations server/storage.ts performs. Proving the new
# credential works on the path the app actually uses is what makes it safe to
# delete the old one; a b2_list_buckets call would only prove it authenticates.
s3_probe() {
  local endpoint="$1" region="$2" bucket="$3" id="$4" secret="$5"
  local object="${6:-_rotation-probe}"
  local url="${endpoint%/}/${bucket}/${object}"
  local sig="aws:amz:${region}:s3"

  http_json PUT "$url" --aws-sigv4 "$sig" -u "${id}:${secret}" \
    --data-binary 'rotation probe' >/dev/null || return 1
  http_json GET "$url" --aws-sigv4 "$sig" -u "${id}:${secret}" >/dev/null || return 1
  http_json DELETE "$url" --aws-sigv4 "$sig" -u "${id}:${secret}" >/dev/null || return 1
}
