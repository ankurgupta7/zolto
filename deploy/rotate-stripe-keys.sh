#!/usr/bin/env bash
# Reads the Stripe live secret key from .env, creates a new restricted API key
# via the Stripe API with only the permissions this app needs, then replaces
# STRIPE_SECRET_KEY in .env with the new restricted key.
#
# Required permissions granted to the restricted key:
#   checkout_sessions  write  — online checkout (routers.ts)
#   payment_intents    write  — POS terminal (pos.ts)
#
# Usage: bash deploy/rotate-stripe-keys.sh [path/to/.env]
set -euo pipefail

ENV_FILE="${1:-.env}"

# ── 1. Read live key ──────────────────────────────────────────────────────────
LIVE_KEY="$(grep -E '^STRIPE_SECRET_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2-)"

if [[ -z "$LIVE_KEY" ]]; then
  echo "ERROR: STRIPE_SECRET_KEY not found in $ENV_FILE" >&2; exit 1
fi
if [[ "$LIVE_KEY" != sk_live_* ]]; then
  echo "ERROR: STRIPE_SECRET_KEY does not look like a live key (got: ${LIVE_KEY:0:12}...)" >&2; exit 1
fi

echo "Read live key: ${LIVE_KEY:0:12}..."

# ── 2. Create restricted key via Stripe API ───────────────────────────────────
KEY_NAME="kalakosh-$(date -u +%Y%m%d)"

HTTP_STATUS=""
RESPONSE="$(curl -s -o /tmp/stripe_response.json -w "%{http_code}" -X POST https://api.stripe.com/v1/api_keys \
  -H "Stripe-Version: 2024-06-20" \
  -u "$LIVE_KEY:" \
  -d "name=$KEY_NAME" \
  -d "type=restricted" \
  -d "permissions[checkout_sessions]=write" \
  -d "permissions[payment_intents]=write")"
HTTP_STATUS="$RESPONSE"
RESPONSE="$(cat /tmp/stripe_response.json)"
rm -f /tmp/stripe_response.json

if [[ "$HTTP_STATUS" != "200" ]]; then
  echo "ERROR: Stripe API returned HTTP $HTTP_STATUS:" >&2
  echo "$RESPONSE" >&2
  exit 1
fi

# Parse the secret from the JSON response (jq preferred, python3 as fallback)
if command -v jq &>/dev/null; then
  NEW_KEY="$(echo "$RESPONSE" | jq -r '.secret // empty')"
else
  NEW_KEY="$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('secret',''))")"
fi

if [[ -z "$NEW_KEY" || "$NEW_KEY" == "null" ]]; then
  echo "ERROR: Stripe API returned 200 but no secret field. Response:" >&2
  echo "$RESPONSE" >&2; exit 1
fi

echo "Created restricted key: ${NEW_KEY:0:12}..."

# ── 3. Replace STRIPE_SECRET_KEY in .env (backup first) ──────────────────────
cp "$ENV_FILE" "$ENV_FILE.bak"
sed -i "s|^STRIPE_SECRET_KEY=.*|STRIPE_SECRET_KEY=$NEW_KEY|" "$ENV_FILE"

echo "Updated $ENV_FILE (backup saved as $ENV_FILE.bak)"
echo "Done. Restricted key '${KEY_NAME}' is now active in $ENV_FILE."
echo "Remember to restart your service so it picks up the new key."
