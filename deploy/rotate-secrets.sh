#!/usr/bin/env bash
# deploy/rotate-secrets.sh — one entry point for every credential rotation.
#
# Replaces deploy/rotate-stripe-keys.sh and deploy/rotate-stripe-webhooks.sh,
# and restores the CI fan-out that deploy/rotate-pos-key.sh used to do before
# it was retired in the multi-tenancy split (PR #34). All three did the same
# handful of things — read .env, call a REST API, write .env back, push a
# secret to CI — from three private copies of that plumbing. The copies now
# live in deploy/lib/secrets.sh and are covered by deploy/lib/secrets.test.sh.
#
#   bash deploy/rotate-secrets.sh pos-ci-key
#   bash deploy/rotate-secrets.sh stripe-key
#   bash deploy/rotate-secrets.sh stripe-webhooks
#   bash deploy/rotate-secrets.sh stripe          # both Stripe rotations
#
# Run --help for the full option list.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/secrets.sh
source "${SCRIPT_DIR}/lib/secrets.sh"

ENV_FILE=".env"
GITHUB_REPO="ankurgupta7/zolto"
POS_KEY=""
BASE_URL_OVERRIDE=""
DRY_RUN=0
STRIPE_API="https://api.stripe.com/v1"

usage() {
  cat <<'EOF'
Usage: bash deploy/rotate-secrets.sh <target> [options]

Targets:
  pos-ci-key        Fan the platform POS test key out to the POS apps' CI.
                    Zolto is multi-tenant: POS keys are per-tenant, generated
                    at signup and stored hashed, so there is no platform
                    POS_API_KEY in .env to rotate. The key CI builds use comes
                    from the superadmin UI (platform.rotatePosTestKey), which
                    reveals the plaintext exactly once. Mint it there, then
                    hand it to this command to reach every CI destination in
                    the same sitting — the old key is dead the moment it is
                    minted.

  stripe-key        Create a fresh restricted Stripe API key (checkout_sessions
                    + payment_intents only) and write it to .env.

  stripe-webhooks   Re-create both Stripe webhook endpoints and write their new
                    signing secrets to .env.

  stripe            stripe-key followed by stripe-webhooks.

Options:
  --env FILE        .env to read/write (default: .env)
  --key KEY         pos-ci-key: the plaintext key, instead of being prompted.
                    Prefer the prompt — an argument is visible to `ps` and
                    lands in your shell history.
  --repo OWNER/NAME pos-ci-key: GitHub repo to push secrets to
                    (default: ankurgupta7/zolto)
  --base-url URL    pos-ci-key: POS API base URL to publish and verify against
                    (default: PUBLIC_BASE_URL from .env)
  --dry-run         Print what would change; touch nothing.
  -h, --help        This text.

Credentials, all read from the environment rather than .env:
  CODEMAGIC_TOKEN, CODEMAGIC_APP_ID   pos-ci-key: enables the Codemagic push.
                                      Skipped with a warning when unset.

  These are operator credentials, not deployment config — the server never
  needs them, and scripts/migrate-tenant-secrets.mjs deletes them from .env as
  fossils. Export them for the run instead:
      CODEMAGIC_TOKEN=… CODEMAGIC_APP_ID=… bash deploy/rotate-secrets.sh pos-ci-key

  GitHub access comes from the `gh` CLI's own auth (`gh auth login`).
EOF
}

# ── Logging ───────────────────────────────────────────────────────────────────
step() { echo ""; echo "==> $1"; }
ok() { echo "  ✓ $1"; }
warn() { echo "  ⚠ $1" >&2; }
die() {
  echo "ERROR: $1" >&2
  exit 1
}
would() { echo "  · would $1"; }

# ── JSON extraction (jq when present, python3 otherwise) ──────────────────────
json_secret() {
  if command -v jq >/dev/null 2>&1; then
    jq -r '.secret // empty'
  else
    python3 -c 'import sys,json; print(json.load(sys.stdin).get("secret",""))'
  fi
}

json_endpoint_ids() { # json_endpoint_ids <url>   (list response on stdin)
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg u "$1" '.data[] | select(.url == $u) | .id'
  else
    python3 -c '
import sys, json
url = sys.argv[1]
for e in json.load(sys.stdin).get("data", []):
    if e.get("url") == url:
        print(e["id"])
' "$1"
  fi
}

# ── Target: pos-ci-key ────────────────────────────────────────────────────────
rotate_pos_ci_key() {
  local key="$POS_KEY" base_url

  if [ -z "$key" ]; then
    key="${POS_TEST_KEY:-}"
  fi
  if [ -z "$key" ]; then
    echo "Mint the key first: superadmin UI → rotate POS test key."
    echo "It is shown exactly once; paste it here (input hidden)."
    read -rsp "  Platform POS test key: " key
    echo ""
  fi
  [ -n "$key" ] || die "No key given — nothing to push."

  # generatePosApiKey() is randomBytes(32).toString("hex"). Anything else is a
  # paste accident (a truncated copy, or the hash instead of the plaintext),
  # and pushing it would leave every POS build authenticating with garbage.
  if ! [[ "$key" =~ ^[0-9a-f]{64}$ ]]; then
    die "That is not a POS API key: expected 64 hex characters, got ${#key}.
Copy the whole value the superadmin UI revealed."
  fi

  base_url="$BASE_URL_OVERRIDE"
  if [ -z "$base_url" ]; then
    base_url="$(read_env_var "$ENV_FILE" PUBLIC_BASE_URL)"
  fi
  base_url="${base_url%/}"

  step "Pushing $(mask_secret "$key") to CI"
  echo "  repo:      $GITHUB_REPO"
  echo "  base URL:  ${base_url:-<unknown — POS_API_BASE_URL will not be set>}"

  # 1. GitHub Actions (.github/workflows/ios-pos-build.yml reads both).
  if [ "$DRY_RUN" -eq 1 ]; then
    would "set GitHub secret POS_API_KEY on $GITHUB_REPO"
    [ -n "$base_url" ] && would "set GitHub secret POS_API_BASE_URL on $GITHUB_REPO"
  else
    command -v "${GH_BIN:-gh}" >/dev/null 2>&1 ||
      die "the gh CLI is required for the GitHub push. Install it and run 'gh auth login'."
    github_secret_set "$GITHUB_REPO" POS_API_KEY "$key"
    ok "GitHub secret POS_API_KEY → $GITHUB_REPO"
    if [ -n "$base_url" ]; then
      github_secret_set "$GITHUB_REPO" POS_API_BASE_URL "$base_url"
      ok "GitHub secret POS_API_BASE_URL → $GITHUB_REPO"
    else
      warn "PUBLIC_BASE_URL is blank in $ENV_FILE — POS_API_BASE_URL not set."
      warn "  The workflow's health check stays skipped until it is."
    fi
  fi

  # 2. Codemagic (signed device builds; the ios-pos-* workflows).
  if [ -z "${CODEMAGIC_APP_ID:-}" ] || [ -z "${CODEMAGIC_TOKEN:-}" ]; then
    warn "CODEMAGIC_APP_ID / CODEMAGIC_TOKEN not exported — skipping Codemagic."
    warn "  Signed device builds keep using the old key until you set it there."
  elif [ "$DRY_RUN" -eq 1 ]; then
    would "set Codemagic variable POS_API_KEY on app $CODEMAGIC_APP_ID"
  else
    codemagic_var_set "$CODEMAGIC_APP_ID" POS_API_KEY "$key"
    ok "Codemagic variable POS_API_KEY → app $CODEMAGIC_APP_ID"
  fi

  # 3. Prove the key the CI will now use is the key the server accepts.
  if [ "$DRY_RUN" -eq 1 ]; then
    would "verify the key against ${base_url:-<unknown>}/api/pos/health"
    return 0
  fi
  if [ -z "$base_url" ]; then
    warn "No base URL — skipping the live verification."
    return 0
  fi

  step "Verifying against ${base_url}/api/pos/health"
  if http_json GET "${base_url}/api/pos/health" -H "x-pos-key: ${key}" >/dev/null; then
    ok "the server accepts the new key"
  else
    warn "the server rejected the new key (or is unreachable)."
    warn "  The CI secrets are already updated. If the key is right, this is"
    warn "  the server not yet running the rotation — re-check before a build."
    return 1
  fi

  step "Done"
  echo "  The key is not stored anywhere by this script — it is unrecoverable."
  echo "  If it is lost, mint a new one and run this again."
}

# ── Target: stripe-key ────────────────────────────────────────────────────────
rotate_stripe_key() {
  local live_key key_name response new_key backup

  live_key="$(read_env_var "$ENV_FILE" STRIPE_SECRET_KEY)"
  [ -n "$live_key" ] || die "STRIPE_SECRET_KEY not found in $ENV_FILE"
  case "$live_key" in
    sk_live_*) ;;
    *) die "STRIPE_SECRET_KEY is not a live key (got: $(mask_secret "$live_key")).
Restricted keys cannot mint further keys — this needs the live secret key." ;;
  esac

  key_name="zolto-$(date -u +%Y%m%d)"
  step "Creating restricted Stripe key '$key_name'"
  echo "  from $(mask_secret "$live_key")"

  if [ "$DRY_RUN" -eq 1 ]; then
    would "POST ${STRIPE_API}/api_keys (checkout_sessions + payment_intents, write)"
    would "write STRIPE_SECRET_KEY to $ENV_FILE"
    return 0
  fi

  response="$(http_json POST "${STRIPE_API}/api_keys" \
    -H "Stripe-Version: 2024-06-20" \
    -u "${live_key}:" \
    -d "name=${key_name}" \
    -d "type=restricted" \
    -d "permissions[checkout_sessions]=write" \
    -d "permissions[payment_intents]=write")" ||
    die "Stripe refused to create the key (see above)."

  new_key="$(printf '%s' "$response" | json_secret)"
  [ -n "$new_key" ] && [ "$new_key" != "null" ] ||
    die "Stripe returned success but no secret field:
${response}"

  ok "created $(mask_secret "$new_key")"

  backup="$(backup_env_file "$ENV_FILE")"
  set_env_var "$ENV_FILE" STRIPE_SECRET_KEY "$new_key"
  ok "STRIPE_SECRET_KEY → $ENV_FILE (backup: $backup)"
  echo "  Restart the service so it picks the new key up: ./update.sh"
}

# ── Target: stripe-webhooks ───────────────────────────────────────────────────
rotate_one_webhook() { # rotate_one_webhook <label> <path> <env_var> <event...>
  local label="$1" path="$2" env_var="$3"
  shift 3
  local events=("$@")
  local live_key="$STRIPE_LIVE_KEY" base_url="$STRIPE_BASE_URL"
  local target="${base_url}${path}"
  local existing ids created secret args=()

  step "$label — $target"

  if [ "$DRY_RUN" -eq 1 ]; then
    would "replace any endpoint at $target and write $env_var to $ENV_FILE"
    return 0
  fi

  # Drop endpoints already pointing at this URL so re-runs don't accumulate
  # duplicates, each delivering the same event.
  existing="$(http_json GET "${STRIPE_API}/webhook_endpoints?limit=100" -u "${live_key}:")" ||
    die "could not list existing webhook endpoints."
  ids="$(printf '%s' "$existing" | json_endpoint_ids "$target")"
  if [ -n "$ids" ]; then
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      http_json DELETE "${STRIPE_API}/webhook_endpoints/${id}" -u "${live_key}:" >/dev/null ||
        die "could not delete endpoint $id."
      ok "removed old endpoint $id"
    done <<<"$ids"
  fi

  args=(-d "url=${target}")
  local e
  for e in "${events[@]}"; do args+=(-d "enabled_events[]=${e}"); done

  created="$(http_json POST "${STRIPE_API}/webhook_endpoints" -u "${live_key}:" "${args[@]}")" ||
    die "could not create the endpoint."
  secret="$(printf '%s' "$created" | json_secret)"
  [ -n "$secret" ] ||
    die "endpoint created but no signing secret came back:
${created}"

  ok "created endpoint, secret $(mask_secret "$secret")"
  set_env_var "$ENV_FILE" "$env_var" "$secret"
  ok "$env_var → $ENV_FILE"
}

rotate_stripe_webhooks() {
  local backup

  STRIPE_LIVE_KEY="$(read_env_var "$ENV_FILE" STRIPE_SECRET_KEY)"
  STRIPE_BASE_URL="$(read_env_var "$ENV_FILE" PUBLIC_BASE_URL)"
  STRIPE_BASE_URL="${STRIPE_BASE_URL%/}"

  [ -n "$STRIPE_LIVE_KEY" ] || die "STRIPE_SECRET_KEY not found in $ENV_FILE"
  case "$STRIPE_LIVE_KEY" in
    sk_live_* | sk_test_* | rk_*) ;;
    *) die "STRIPE_SECRET_KEY does not look like a Stripe secret key (got: $(mask_secret "$STRIPE_LIVE_KEY"))" ;;
  esac
  [ -n "$STRIPE_BASE_URL" ] ||
    die "PUBLIC_BASE_URL is blank in $ENV_FILE — webhook URLs are built from it."

  if [ "$DRY_RUN" -eq 0 ]; then
    backup="$(backup_env_file "$ENV_FILE")"
    echo "Backed up $ENV_FILE → $backup"
  fi

  # Keep in step with server/stripe.ts and server/pos.ts.
  rotate_one_webhook "Checkout webhook" "/api/stripe/webhook" "STRIPE_WEBHOOK_SECRET" \
    checkout.session.completed \
    checkout.session.async_payment_succeeded \
    checkout.session.async_payment_failed \
    checkout.session.expired

  rotate_one_webhook "POS webhook" "/api/pos/webhook" "STRIPE_POS_WEBHOOK_SECRET" \
    payment_intent.succeeded \
    checkout.session.completed \
    checkout.session.async_payment_succeeded \
    checkout.session.async_payment_failed \
    checkout.session.expired

  step "Done"
  echo "  Restart the service so it picks the new signing secrets up: ./update.sh"
}

# ── Arguments ─────────────────────────────────────────────────────────────────
TARGET=""
while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --key)
      POS_KEY="${2:-}"
      shift 2
      ;;
    --repo)
      GITHUB_REPO="${2:-}"
      shift 2
      ;;
    --base-url)
      BASE_URL_OVERRIDE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    -*) die "unknown option: $1 (try --help)" ;;
    *)
      [ -z "$TARGET" ] || die "more than one target given: '$TARGET' and '$1'"
      TARGET="$1"
      shift
      ;;
  esac
done

[ -n "$TARGET" ] || {
  usage
  exit 1
}

# Every target except pos-ci-key reads and rewrites .env; pos-ci-key only reads
# it, and only for PUBLIC_BASE_URL.
case "$TARGET" in
  stripe-key | stripe-webhooks | stripe)
    [ -f "$ENV_FILE" ] || die "$ENV_FILE does not exist (pass --env to point elsewhere)."
    ;;
esac

[ "$DRY_RUN" -eq 1 ] && echo "DRY RUN — nothing will be changed."

case "$TARGET" in
  pos-ci-key) rotate_pos_ci_key ;;
  stripe-key) rotate_stripe_key ;;
  stripe-webhooks) rotate_stripe_webhooks ;;
  stripe)
    rotate_stripe_key
    rotate_stripe_webhooks
    ;;
  *) die "unknown target: $TARGET (try --help)" ;;
esac
