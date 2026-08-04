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
