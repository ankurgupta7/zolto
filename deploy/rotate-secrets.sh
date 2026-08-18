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
S3_BUCKET_OVERRIDE=""
KEEP_OLD=0
RESTART=0
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

  stripe-key        Create a fresh restricted Stripe API key scoped to what the
                    app actually calls (see STRIPE_KEY_PERMISSIONS in this
                    file), probe it, and write it to .env only if every probe
                    passes. It does NOT revoke the old key — roll that in the
                    Dashboard, which is the only thing that ends an exposure.

  stripe-webhooks   Replace both Stripe webhook endpoints and write their new
                    signing secrets to .env. The replacement is created before
                    the old one is deleted, so a failure leaves the live
                    endpoint working rather than leaving the URL bare.

  stripe            stripe-key followed by stripe-webhooks.

  s3-key            Mint a fresh Backblaze B2 application key scoped to
                    S3_BUCKET, prove it works by writing/reading/deleting an
                    object through the S3 API, write it to .env, then delete
                    the key it replaced. Non-interactive: safe from cron.
                    Needs B2_MASTER_KEY_ID / B2_MASTER_KEY in the environment.

Options:
  --env FILE        .env to read/write (default: .env)
  --bucket NAME     s3-key: bucket to scope the new key to
                    (default: S3_BUCKET from .env)
  --keep-old        s3-key: leave the previous key alive. Use when other
                    deployments still hold it; delete it by hand afterwards.
  --restart         s3-key: `docker compose up -d app` once .env is written,
                    so the running service picks the new key up.
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

  B2_MASTER_KEY_ID, B2_MASTER_KEY     s3-key: a B2 key with `writeKeys`, i.e.
                                      the master application key. Required.
                                      Deliberately NOT in .env — a deployment
                                      must not hold a credential that can mint
                                      further credentials.

Deliberately not automated:
  JWT_SECRET          rotating it invalidates every session; it is a one-line
                      `openssl rand -hex 32` plus a restart, and wants to be a
                      decision rather than a scheduled job.
  TENANT_SECRETS_KEY  it decrypts the tenant_secrets vault. Rotating it without
                      re-encrypting every row makes all stored tenant secrets
                      unrecoverable, so it needs a migration, not a new value.

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
#
# What the restricted key must be allowed to do, and who needs it. Every entry
# is <resource>|<probe path>|<what breaks without it>, where the probe is a
# harmless GET used after minting to prove the grant actually landed.
#
# This list is the whole reason the key is dangerous to change casually: it
# shipped as checkout_sessions + payment_intents alone, which silently omits
# Terminal — so a rotation produced a key that could take a QR payment but not
# mint a Tap to Pay connection token, and the Android till stopped working at
# the next restart with nothing in the rotation output to say why.
#
# Derived by inventorying `stripe.*` calls across server/ excluding tests:
#   checkout.sessions.create/retrieve, coupons.create, customers.create,
#   paymentIntents.create/list/retrieve, products.list,
#   terminal.connectionTokens.create, terminal.locations.create
# plus webhook_endpoints, which this script's own stripe-webhooks target needs.
# Re-derive it the same way before adding a Stripe call to the app.
STRIPE_KEY_PERMISSIONS=(
  "checkout_sessions|/checkout/sessions?limit=1|storefront checkout and the till's scan-to-pay QR"
  "payment_intents|/payment_intents?limit=1|Terminal card payments and TWINT"
  "terminal|/terminal/locations?limit=1|Tap to Pay: connection tokens and locations"
  "customers|/customers?limit=1|customer records attached to sales"
  "coupons|/coupons?limit=1|discount codes at checkout"
  "products|/products?limit=1|product lookups"
  "webhook_endpoints|/webhook_endpoints?limit=1|this script's own stripe-webhooks target"
)

# Proves the freshly minted key can actually reach everything the app uses,
# before it is allowed anywhere near .env.
#
# A GET is enough: every permission above is requested as `write`, and Stripe's
# write grant includes read, so a 403 here means the grant is missing entirely
# — the failure mode that matters. It does not prove write, and cannot without
# creating real objects.
verify_stripe_key_permissions() { # verify_stripe_key_permissions <key>
  local key="$1" entry resource probe why missing=()

  step "Checking the new key can reach everything the app uses"
  for entry in "${STRIPE_KEY_PERMISSIONS[@]}"; do
    IFS='|' read -r resource probe why <<<"$entry"
    if http_json GET "${STRIPE_API}${probe}" -u "${key}:" >/dev/null 2>&1; then
      ok "$resource"
    else
      missing+=("$resource — $why")
    fi
  done

  [ "${#missing[@]}" -eq 0 ] && return 0

  warn "The new key cannot reach:"
  local m
  for m in "${missing[@]}"; do echo "    - $m"; done
  return 1
}

rotate_stripe_key() {
  local live_key key_name response new_key backup entry resource perms=()

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

  for entry in "${STRIPE_KEY_PERMISSIONS[@]}"; do
    resource="${entry%%|*}"
    perms+=(-d "permissions[${resource}]=write")
  done

  if [ "$DRY_RUN" -eq 1 ]; then
    would "POST ${STRIPE_API}/api_keys (write on: $(
      printf '%s ' "${STRIPE_KEY_PERMISSIONS[@]%%|*}"
    ))"
    would "probe each of those with the new key before adopting it"
    would "write STRIPE_SECRET_KEY to $ENV_FILE"
    return 0
  fi

  response="$(http_json POST "${STRIPE_API}/api_keys" \
    -H "Stripe-Version: 2024-06-20" \
    -u "${live_key}:" \
    -d "name=${key_name}" \
    -d "type=restricted" \
    "${perms[@]}")" ||
    die "Stripe refused to create the key (see above)."

  new_key="$(printf '%s' "$response" | json_secret)"
  [ -n "$new_key" ] && [ "$new_key" != "null" ] ||
    die "Stripe returned success but no secret field:
${response}"

  ok "created $(mask_secret "$new_key")"

  # Refuse to adopt a key that cannot do the job. .env keeps the working key,
  # so the only cost of stopping here is a dead key left in the Dashboard —
  # far cheaper than a restart onto a key that cannot take a card.
  verify_stripe_key_permissions "$new_key" || die \
    "Not writing this key to $ENV_FILE — $ENV_FILE still holds the working one.
Delete $(mask_secret "$new_key") in the Stripe Dashboard (Developers → API keys),
grant the missing resources there, and re-run. If Stripe has renamed a
permission, fix STRIPE_KEY_PERMISSIONS at the top of this file."

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

  # Note the endpoints already at this URL, but do NOT delete them yet — see
  # below. Capturing the ids first is what makes the replacement safe to
  # create alongside them: only these ids are ever removed, so the new
  # endpoint cannot delete itself.
  existing="$(http_json GET "${STRIPE_API}/webhook_endpoints?limit=100" -u "${live_key}:")" ||
    die "could not list existing webhook endpoints."
  ids="$(printf '%s' "$existing" | json_endpoint_ids "$target")"

  args=(-d "url=${target}")
  local e
  for e in "${events[@]}"; do args+=(-d "enabled_events[]=${e}"); done

  # Create BEFORE deleting. Stripe allows several endpoints on one URL, so the
  # replacement can stand beside the old one for a moment — and if this POST
  # fails (a key without webhook_endpoints write, a typo'd PUBLIC_BASE_URL, a
  # network blip), the old endpoint is still there and still signing with the
  # secret .env still holds. Deleting first would turn any of those into an
  # outage with no webhook delivery at all until someone noticed.
  created="$(http_json POST "${STRIPE_API}/webhook_endpoints" -u "${live_key}:" "${args[@]}")" ||
    die "could not create the endpoint — the existing one at $target is untouched."
  secret="$(printf '%s' "$created" | json_secret)"
  [ -n "$secret" ] ||
    die "endpoint created but no signing secret came back:
${created}"

  ok "created endpoint, secret $(mask_secret "$secret")"
  set_env_var "$ENV_FILE" "$env_var" "$secret"
  ok "$env_var → $ENV_FILE"

  # Now retire the ones this replaced. A failure here leaves a duplicate
  # endpoint rather than none, which is noisy but harmless — the app ignores
  # deliveries it cannot verify and Stripe stops retrying eventually — so it
  # is a warning, not a died-halfway rotation.
  if [ -n "$ids" ]; then
    while IFS= read -r id; do
      [ -n "$id" ] || continue
      if http_json DELETE "${STRIPE_API}/webhook_endpoints/${id}" -u "${live_key}:" >/dev/null; then
        ok "removed old endpoint $id"
      else
        warn "could not delete old endpoint $id — remove it in the Dashboard,
    or it will keep delivering with a signing secret nothing holds any more."
      fi
    done <<<"$ids"
  fi
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

  # Keep in step with server/stripe.ts and server/pos.ts — enforced by
  # deploy/webhookEvents.test.ts.
  #
  # The Connect endpoint (/api/stripe/connect-webhook) is NOT rotated here: it
  # is configured once for the platform under Dashboard → Connect → Webhooks
  # rather than per deployment. It needs the union of both lists below, since a
  # connected store's storefront AND POS events all fire on its own account.
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

# ── Target: s3-key ────────────────────────────────────────────────────────────
#
# Order matters and is the whole safety story: mint → verify → write .env →
# delete the old key. Verification happens against the S3-compatible endpoint
# the app itself uses, so "it worked" means the deployment will work, not just
# that B2 accepted an auth header. Nothing is destroyed until that passes, and
# a failure anywhere before the write leaves the deployment on its current key.
rotate_s3_key() {
  local endpoint region bucket old_id
  local auth account_id api_url token buckets bucket_id
  local key_name created new_id new_secret backup probe

  endpoint="$(read_env_var "$ENV_FILE" S3_ENDPOINT)"
  region="$(read_env_var "$ENV_FILE" S3_REGION)"
  bucket="${S3_BUCKET_OVERRIDE:-$(read_env_var "$ENV_FILE" S3_BUCKET)}"
  old_id="$(read_env_var "$ENV_FILE" S3_ACCESS_KEY_ID)"

  [ -n "$endpoint" ] || die "S3_ENDPOINT not found in $ENV_FILE"
  [ -n "$bucket" ] || die "S3_BUCKET not found in $ENV_FILE (or pass --bucket)"
  [ -n "$region" ] || die "S3_REGION not found in $ENV_FILE"

  # A deployment still carrying .env.example's placeholders has no key to
  # rotate. Saying so beats an SSL handshake failure against a hostname that
  # was never meant to resolve.
  case "${endpoint}${old_id}" in
    *your_account_id* | *your_access_key* | *change_me*)
      die "S3 is not configured in $ENV_FILE — it still holds .env.example placeholders
(endpoint: ${endpoint}). This rotates an existing key; it does not do first-time
setup. Fill in the S3_* block, confirm uploads work, then rotate." ;;
  esac

  case "$endpoint" in
    *backblazeb2.com*) ;;
    *) die "S3_ENDPOINT is ${endpoint}.
Only Backblaze B2 key rotation is automated here — B2 is what this platform
deploys on. R2 and AWS mint credentials through their own APIs (Cloudflare
tokens, IAM), so each needs its own target rather than a pretend-generic one." ;;
  esac

  [ -n "${B2_MASTER_KEY_ID:-}" ] && [ -n "${B2_MASTER_KEY:-}" ] ||
    die "B2_MASTER_KEY_ID and B2_MASTER_KEY must be exported.
Only a key with the writeKeys capability can mint another; that is the master
application key, and it is read from the environment so .env never holds it."

  key_name="zolto-${bucket}-$(date -u +%Y%m%d%H%M%S)"

  step "Rotating the S3 key for bucket '$bucket'"
  echo "  endpoint:  $endpoint"
  echo "  current:   ${old_id:-<none in $ENV_FILE>}"
  echo "  new name:  $key_name"

  if [ "$DRY_RUN" -eq 1 ]; then
    would "authorize with B2_MASTER_KEY_ID $(mask_secret "${B2_MASTER_KEY_ID}")"
    would "create a key named $key_name scoped to '$bucket'"
    would "PUT/GET/DELETE a probe object with it via $endpoint"
    would "write S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY to $ENV_FILE"
    if [ "$KEEP_OLD" -eq 1 ]; then
      would "leave ${old_id:-the previous key} in place (--keep-old)"
    else
      would "delete the previous key ${old_id:-<none>}"
    fi
    [ "$RESTART" -eq 1 ] && would "docker compose up -d app"
    return 0
  fi

  # 1. Authorize.
  auth="$(b2_authorize "$B2_MASTER_KEY_ID" "$B2_MASTER_KEY")" ||
    die "B2 rejected the master key (see above)."
  account_id="$(printf '%s' "$auth" | json_get accountId)"
  api_url="$(printf '%s' "$auth" | json_get apiInfo.storageApi.apiUrl)"
  token="$(printf '%s' "$auth" | json_get authorizationToken)"
  [ -n "$account_id" ] && [ -n "$api_url" ] && [ -n "$token" ] ||
    die "B2 authorized but the response was not the shape expected:
${auth}"
  ok "authorized account ${account_id}"

  # 2. Resolve the bucket id — a key scoped to one bucket cannot touch another,
  #    which is the difference between rotating a credential and handing out a
  #    new master.
  buckets="$(b2_api "$api_url" "$token" b2_list_buckets \
    "{\"accountId\":\"$(json_escape "$account_id")\",\"bucketName\":\"$(json_escape "$bucket")\"}")" ||
    die "could not list bucket '$bucket' (see above)."
  bucket_id="$(printf '%s' "$buckets" | json_get buckets.0.bucketId)"
  [ -n "$bucket_id" ] || die "B2 has no bucket named '$bucket' on account ${account_id}."
  ok "bucket '$bucket' → ${bucket_id}"

  # 3. Mint. Capabilities are exactly what server/storage.ts exercises:
  #    storagePut writes, the /uploads proxy and signed URLs read, and delete
  #    is needed for the probe to clean up after itself.
  created="$(b2_api "$api_url" "$token" b2_create_key \
    "{\"accountId\":\"$(json_escape "$account_id")\",\"keyName\":\"$(json_escape "$key_name")\",\"bucketId\":\"$(json_escape "$bucket_id")\",\"capabilities\":[\"listBuckets\",\"listFiles\",\"readFiles\",\"writeFiles\",\"deleteFiles\"]}")" ||
    die "B2 refused to create the key (see above)."
  new_id="$(printf '%s' "$created" | json_get applicationKeyId)"
  new_secret="$(printf '%s' "$created" | json_get applicationKey)"
  [ -n "$new_id" ] && [ -n "$new_secret" ] ||
    die "B2 returned success but no key material:
${created}"
  ok "created $(mask_secret "$new_id")"

  # 4. Prove it before anything is destroyed.
  probe="_rotation-probe-$(date -u +%Y%m%d%H%M%S)"
  if ! curl_supports_sigv4; then
    warn "this curl has no --aws-sigv4, so the new key cannot be verified."
    warn "  Leaving the old key alive; delete it once uploads are confirmed:"
    warn "    B2 console → App Keys → ${old_id:-<the previous key>}"
    KEEP_OLD=1
  else
    step "Verifying $(mask_secret "$new_id") against ${endpoint}"
    if s3_probe "$endpoint" "$region" "$bucket" "$new_id" "$new_secret" "$probe"; then
      ok "wrote, read and deleted ${probe}"
    else
      die "the new key could not complete an S3 round-trip. Nothing was changed.
$ENV_FILE still holds the working key. The unused key ${new_id} was created and
should be deleted: B2 console → App Keys."
    fi
  fi

  # 5. Write.
  backup="$(backup_env_file "$ENV_FILE")"
  set_env_var "$ENV_FILE" S3_ACCESS_KEY_ID "$new_id"
  set_env_var "$ENV_FILE" S3_SECRET_ACCESS_KEY "$new_secret"
  ok "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY → $ENV_FILE (backup: $backup)"

  # 6. Retire the old one. Skipped when it is the master key: that would lock
  #    every future rotation out of its own credential.
  if [ -z "$old_id" ]; then
    warn "no previous S3_ACCESS_KEY_ID was in $ENV_FILE — nothing to delete."
  elif [ "$old_id" = "$new_id" ]; then
    warn "the previous key id matches the new one — not deleting it."
  elif [ "$old_id" = "${B2_MASTER_KEY_ID}" ]; then
    warn "the deployment was using the MASTER key. It is not deleted here, but"
    warn "  it should never have been in .env — revoke it in the B2 console"
    warn "  once you have confirmed nothing else uses it."
  elif [ "$KEEP_OLD" -eq 1 ]; then
    echo "  · keeping the previous key ${old_id} (--keep-old)"
  else
    step "Deleting the previous key ${old_id}"
    if b2_api "$api_url" "$token" b2_delete_key \
      "{\"applicationKeyId\":\"$(json_escape "$old_id")\"}" >/dev/null; then
      ok "revoked"
    else
      warn "B2 would not delete ${old_id}. The new key is live and in $ENV_FILE;"
      warn "  remove the old one by hand: B2 console → App Keys."
    fi
  fi

  # 7. Make the running service use it.
  if [ "$RESTART" -eq 1 ]; then
    step "Restarting the app"
    if docker compose up -d app; then
      ok "app recreated with the new key"
    else
      warn "the restart failed — .env is correct, the service is not yet using it."
      return 1
    fi
  else
    echo ""
    echo "  .env is updated; the running service still holds the old key."
    echo "  Pick it up with:  docker compose up -d app   (or ./update.sh)"
  fi
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
    --bucket)
      S3_BUCKET_OVERRIDE="${2:-}"
      shift 2
      ;;
    --keep-old)
      KEEP_OLD=1
      shift
      ;;
    --restart)
      RESTART=1
      shift
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
  stripe-key | stripe-webhooks | stripe | s3-key)
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
  s3-key) rotate_s3_key ;;
  *) die "unknown target: $TARGET (try --help)" ;;
esac
