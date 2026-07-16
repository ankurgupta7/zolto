#!/usr/bin/env bash
# Rotates Stripe webhook signing secrets via the Stripe API.
#
# Unlike API keys — which can only be created in the Dashboard — webhook
# signing secrets ARE returned by the API when you create a webhook endpoint
# (POST /v1/webhook_endpoints -> .secret). This script:
#   1. Reads STRIPE_SECRET_KEY and PUBLIC_BASE_URL from .env
#   2. For each of the app's two webhooks, deletes any existing endpoints
#      pointing at the same URL (so duplicates don't pile up), then creates a
#      fresh endpoint and captures its signing secret
#   3. Writes the new secrets back into .env (STRIPE_WEBHOOK_SECRET and
#      STRIPE_POS_WEBHOOK_SECRET), keeping a .bak backup
#
# The app's webhooks (see server/stripe.ts and server/pos.ts):
#   /api/stripe/webhook  -> checkout.session.completed,
#                           checkout.session.async_payment_succeeded,
#                           checkout.session.async_payment_failed,
#                           checkout.session.expired
#   /api/pos/webhook     -> payment_intent.succeeded
#
# Usage: bash deploy/rotate-stripe-webhooks.sh [path/to/.env]
set -euo pipefail

ENV_FILE="${1:-.env}"
API="https://api.stripe.com/v1/webhook_endpoints"

if ! command -v jq &>/dev/null; then
  echo "ERROR: jq is required. Install it (e.g. apt-get install jq) and retry." >&2
  exit 1
fi

# ── Read config ───────────────────────────────────────────────────────────────
read_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed "s/^['\"]//;s/['\"]$//"; }

LIVE_KEY="$(read_env STRIPE_SECRET_KEY)"
BASE_URL="$(read_env PUBLIC_BASE_URL)"

if [[ -z "$LIVE_KEY" ]]; then
  echo "ERROR: STRIPE_SECRET_KEY not found in $ENV_FILE" >&2; exit 1
fi
if [[ "$LIVE_KEY" != sk_live_* && "$LIVE_KEY" != sk_test_* && "$LIVE_KEY" != rk_* ]]; then
  echo "ERROR: STRIPE_SECRET_KEY does not look like a Stripe secret key (got: ${LIVE_KEY:0:8}...)" >&2; exit 1
fi
if [[ -z "$BASE_URL" ]]; then
  echo "ERROR: PUBLIC_BASE_URL is blank in $ENV_FILE — it's required to register webhook URLs." >&2; exit 1
fi
BASE_URL="${BASE_URL%/}"   # strip trailing slash

# ── Stripe API wrapper (visible errors, no silent -f failures) ────────────────
stripe_api() {
  # usage: stripe_api METHOD URL [extra curl args...]
  local method="$1" url="$2"; shift 2
  local status body tmp
  tmp="$(mktemp)"
  status="$(curl -s -o "$tmp" -w '%{http_code}' -X "$method" "$url" -u "$LIVE_KEY:" "$@")"
  body="$(cat "$tmp")"; rm -f "$tmp"
  if [[ "$status" != "200" ]]; then
    echo "ERROR: Stripe API $method $url returned HTTP $status:" >&2
    echo "$body" >&2
    return 1
  fi
  printf '%s' "$body"
}

# ── Rotate one webhook ────────────────────────────────────────────────────────
rotate_webhook() {
  local label="$1" path="$2" env_var="$3"; shift 3
  local events=("$@")
  local target="$BASE_URL$path"

  echo "── $label  ($target) ──"

  # Delete existing endpoints with the same URL so duplicates don't accumulate.
  local existing ids
  existing="$(stripe_api GET "$API?limit=100")"
  ids="$(echo "$existing" | jq -r --arg u "$target" '.data[] | select(.url == $u) | .id')"
  if [[ -n "$ids" ]]; then
    while IFS= read -r id; do
      [[ -z "$id" ]] && continue
      echo "  deleting old endpoint $id"
      stripe_api DELETE "$API/$id" >/dev/null
    done <<< "$ids"
  fi

  # Build the -d enabled_events[]=... argument list.
  local args=(-d "url=$target") e
  for e in "${events[@]}"; do args+=(-d "enabled_events[]=$e"); done

  # Create the fresh endpoint and capture its signing secret.
  local created secret
  created="$(stripe_api POST "$API" "${args[@]}")"
  secret="$(echo "$created" | jq -r '.secret // empty')"
  if [[ -z "$secret" ]]; then
    echo "ERROR: endpoint created but no signing secret returned:" >&2
    echo "$created" >&2; exit 1
  fi
  echo "  created endpoint, secret ${secret:0:12}..."

  # Write the secret into .env (replace existing line or append).
  if grep -qE "^$env_var=" "$ENV_FILE"; then
    sed -i "s|^$env_var=.*|$env_var=$secret|" "$ENV_FILE"
  else
    echo "$env_var=$secret" >> "$ENV_FILE"
  fi
}

# ── Run ───────────────────────────────────────────────────────────────────────
echo "Using key ${LIVE_KEY:0:12}...  base URL $BASE_URL"
cp "$ENV_FILE" "$ENV_FILE.bak"
echo "Backed up $ENV_FILE -> $ENV_FILE.bak"

rotate_webhook "Checkout webhook" "/api/stripe/webhook" "STRIPE_WEBHOOK_SECRET" \
  checkout.session.completed \
  checkout.session.async_payment_succeeded \
  checkout.session.async_payment_failed \
  checkout.session.expired

rotate_webhook "POS webhook" "/api/pos/webhook" "STRIPE_POS_WEBHOOK_SECRET" \
  payment_intent.succeeded

echo "Done. Updated STRIPE_WEBHOOK_SECRET and STRIPE_POS_WEBHOOK_SECRET in $ENV_FILE."
echo "Restart your service so it picks up the new signing secrets."
