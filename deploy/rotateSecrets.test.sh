#!/bin/bash
# deploy/rotateSecrets.test.sh — tests for deploy/rotate-secrets.sh itself.
#
#   bash deploy/rotateSecrets.test.sh
#
# deploy/lib/secrets.test.sh covers the plumbing (read_env_var, set_env_var,
# http_json). This file covers the two decisions the rotation makes that can
# take payments down, by running the real script end to end against a stubbed
# `curl` ($CURL_BIN) and a throwaway .env. Nothing leaves the machine.
#
# 1. ORDER. rotate_one_webhook used to DELETE the endpoints at a URL and then
#    create the replacement. Every way that POST can fail — a key without
#    webhook_endpoints write, a typo'd PUBLIC_BASE_URL, a dropped connection —
#    left the URL with no endpoint at all, mid-rotation, with the old signing
#    secret already gone from Stripe. It now creates first and deletes after,
#    so a failed create is a no-op instead of an outage.
#
# 2. SCOPE. The restricted key was minted with checkout_sessions +
#    payment_intents only, which omits Terminal: rotations produced a key that
#    could take a QR payment but not mint a Tap to Pay connection token, and
#    the till died at the next restart with nothing in the output to say why.
#    The permission list now covers what the app actually calls, and the key is
#    probed before it is allowed into .env.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROTATE="$SCRIPT_DIR/rotate-secrets.sh"
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
assert_contains() { # assert_contains haystack needle description
  if [[ "$1" == *"$2"* ]]; then pass "$3"; else
    fail "$3 (expected to find '$2' in: $1)"
  fi
}
assert_not_contains() {
  if [[ "$1" != *"$2"* ]]; then pass "$3"; else
    fail "$3 (did not expect '$2' in: $1)"
  fi
}

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ── curl stub ─────────────────────────────────────────────────────────────────
# http_json calls: curl -sS -o TMP -w '%{http_code}' -X METHOD URL [extras...]
# so METHOD and URL sit at fixed offsets after -X. Logs one "METHOD URL" line
# per call to $STUB_LOG (order is the point of half these tests) plus every -d
# value, and answers from the rules below.
CURL_STUB="$WORK/curl-stub"
cat >"$CURL_STUB" <<'STUB'
#!/bin/bash
args=("$@")
method=""; url=""; out=""
for i in "${!args[@]}"; do
  case "${args[$i]}" in
    -o) out="${args[$((i + 1))]}" ;;
    -X) method="${args[$((i + 1))]}"; url="${args[$((i + 2))]}" ;;
    -d) printf 'd %s\n' "${args[$((i + 1))]}" >>"$STUB_LOG" ;;
  esac
done
printf '%s %s\n' "$method" "$url" >>"$STUB_LOG"

body='{}'
status=200
case "$method $url" in
  "POST "*"/api_keys")
    body='{"secret":"rk_test_minted"}'
    ;;
  "GET "*"/webhook_endpoints?limit=100")
    body='{"data":[{"id":"we_old_stripe","url":"https://example.test/api/stripe/webhook"},{"id":"we_old_pos","url":"https://example.test/api/pos/webhook"}]}'
    ;;
  "POST "*"/webhook_endpoints")
    if [ "${FAIL_CREATE:-0}" = 1 ]; then
      status=403; body='{"error":{"message":"no permission"}}'
    else
      body='{"secret":"whsec_freshly_created"}'
    fi
    ;;
  "DELETE "*) : ;;
  "GET "*)
    # Capability probes. DENY_PROBE is a substring of the path to refuse.
    if [ -n "${DENY_PROBE:-}" ] && [[ "$url" == *"$DENY_PROBE"* ]]; then
      status=403; body='{"error":{"message":"insufficient permissions"}}'
    fi
    ;;
esac
[ -n "$out" ] && printf '%s' "$body" >"$out"
printf '%s' "$status"
STUB
chmod +x "$CURL_STUB"
export CURL_BIN="$CURL_STUB"

new_env() { # new_env <path>
  cat >"$1" <<'ENV'
STRIPE_SECRET_KEY=sk_live_original
PUBLIC_BASE_URL=https://example.test
STRIPE_WEBHOOK_SECRET=whsec_old_stripe
STRIPE_POS_WEBHOOK_SECRET=whsec_old_pos
ENV
}

# ── stripe-webhooks: creates before it deletes ────────────────────────────────
echo ""
echo "stripe-webhooks ordering:"

ENV_FILE="$WORK/env-order"
export STUB_LOG="$WORK/log-order"
: >"$STUB_LOG"
new_env "$ENV_FILE"
bash "$ROTATE" stripe-webhooks --env "$ENV_FILE" >"$WORK/out-order" 2>&1

CALLS="$(grep -E '^(GET|POST|DELETE) ' "$STUB_LOG")"
FIRST_POST="$(grep -n 'POST .*/webhook_endpoints$' <<<"$CALLS" | head -1 | cut -d: -f1)"
FIRST_DELETE="$(grep -n 'DELETE ' <<<"$CALLS" | head -1 | cut -d: -f1)"
if [ -n "$FIRST_POST" ] && [ -n "$FIRST_DELETE" ] && [ "$FIRST_POST" -lt "$FIRST_DELETE" ]; then
  pass "creates the replacement endpoint before deleting the old one"
else
  fail "create must precede delete (POST at line ${FIRST_POST:-none}, DELETE at ${FIRST_DELETE:-none})"
fi

assert_contains "$CALLS" "DELETE https://api.stripe.com/v1/webhook_endpoints/we_old_stripe" \
  "still retires the old storefront endpoint"
assert_contains "$CALLS" "DELETE https://api.stripe.com/v1/webhook_endpoints/we_old_pos" \
  "still retires the old POS endpoint"
assert_contains "$(cat "$ENV_FILE")" "STRIPE_WEBHOOK_SECRET=whsec_freshly_created" \
  "writes the new storefront signing secret to .env"
assert_contains "$(cat "$ENV_FILE")" "STRIPE_POS_WEBHOOK_SECRET=whsec_freshly_created" \
  "writes the new POS signing secret to .env"

# The events are the whole reason a rotation is not a no-op; deploy/
# webhookEvents.test.ts pins the list against the handlers, this pins that the
# list actually reaches Stripe.
assert_contains "$(cat "$STUB_LOG")" "d enabled_events[]=checkout.session.completed" \
  "subscribes the new endpoints to the till's Checkout Session events"

# ── stripe-webhooks: a failed create must not have deleted anything ───────────
echo ""
echo "stripe-webhooks when Stripe refuses to create:"

ENV_FILE="$WORK/env-failcreate"
export STUB_LOG="$WORK/log-failcreate"
: >"$STUB_LOG"
new_env "$ENV_FILE"
FAIL_CREATE=1 bash "$ROTATE" stripe-webhooks --env "$ENV_FILE" >"$WORK/out-failcreate" 2>&1
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  pass "exits non-zero"
else
  fail "exits non-zero"
fi
assert_not_contains "$(cat "$STUB_LOG")" "DELETE " \
  "deletes NOTHING — the live endpoint survives a failed rotation"
assert_contains "$(cat "$ENV_FILE")" "STRIPE_WEBHOOK_SECRET=whsec_old_stripe" \
  ".env keeps the signing secret that still matches the live endpoint"
assert_contains "$(cat "$WORK/out-failcreate")" "untouched" \
  "says the existing endpoint was left alone"

# ── stripe-key: scope list ────────────────────────────────────────────────────
echo ""
echo "stripe-key permissions:"

ENV_FILE="$WORK/env-key"
export STUB_LOG="$WORK/log-key"
: >"$STUB_LOG"
new_env "$ENV_FILE"
bash "$ROTATE" stripe-key --env "$ENV_FILE" >"$WORK/out-key" 2>&1

REQUESTED="$(grep '^d permissions' "$STUB_LOG")"
assert_contains "$REQUESTED" "permissions[terminal]=write" \
  "asks for terminal — without it Tap to Pay cannot mint a connection token"
assert_contains "$REQUESTED" "permissions[webhook_endpoints]=write" \
  "asks for webhook_endpoints — without it stripe-webhooks cannot run on this key"
assert_contains "$REQUESTED" "permissions[checkout_sessions]=write" "still asks for checkout_sessions"
assert_contains "$REQUESTED" "permissions[payment_intents]=write" "still asks for payment_intents"
assert_contains "$(cat "$ENV_FILE")" "STRIPE_SECRET_KEY=rk_test_minted" \
  "adopts the key once every probe passes"

# ── stripe-key: refuses a key that cannot reach what the app uses ─────────────
echo ""
echo "stripe-key when a permission did not land:"

ENV_FILE="$WORK/env-key-denied"
export STUB_LOG="$WORK/log-key-denied"
: >"$STUB_LOG"
new_env "$ENV_FILE"
DENY_PROBE="/terminal/" bash "$ROTATE" stripe-key --env "$ENV_FILE" >"$WORK/out-denied" 2>&1
STATUS=$?

if [ "$STATUS" -ne 0 ]; then
  pass "exits non-zero"
else
  fail "exits non-zero"
fi
assert_contains "$(cat "$ENV_FILE")" "STRIPE_SECRET_KEY=sk_live_original" \
  ".env keeps the working key rather than adopting a crippled one"
assert_contains "$(cat "$WORK/out-denied")" "terminal" \
  "names the resource that failed, not just 'permission error'"
assert_contains "$(cat "$WORK/out-denied")" "Tap to Pay" \
  "says what breaks, so the operator knows what to grant"

# ── summary ───────────────────────────────────────────────────────────────────
echo ""
echo "  $PASSES passed, $FAILURES failed"
[ "$FAILURES" -eq 0 ] || exit 1
