#!/usr/bin/env bash
# Generates a new POS_API_KEY and syncs ALL build secrets across all 6 destinations:
#   1. Local .env file (server)
#   2. GitHub secrets: ankurgupta7/Kalakosh-ch
#   3. GitHub secrets: ankurgupta7/kalakosh-pos-android
#   4. GitHub secrets: ankurgupta7/kalakosh-pos-ios
#   5. CircleCI: kalakosh-pos-android project env vars
#   6. Codemagic: kalakosh-pos-ios application environment variables
#
# Secrets synced per destination:
#
#   GitHub (all 3 repos)  POS_API_KEY
#   CircleCI (Android)    POS_API_KEY, POS_API_BASE_URL, STRIPE_PUBLISHABLE_KEY, STRIPE_LOCATION_ID
#   Codemagic (iOS)       POS_API_KEY
#
#   Note: iOS only needs POS_API_KEY at build time. POS_BASE_URL defaults to
#   https://kalakosh.ch in project.yml, and Stripe config (location ID, publishable
#   key) is fetched from the server at runtime via GET /api/pos/config — so those
#   values never need to be baked into the iOS IPA.
#
# Requirements:
#   - gh CLI installed and authenticated (with repo scope)
#   - CIRCLECI_TOKEN set in .env (for CircleCI API)
#   - CODEMAGIC_TOKEN set in .env (for Codemagic API)
#   - CODEMAGIC_APP_ID set in .env (for kalakosh-pos-ios)
#
# Usage: bash deploy/rotate-pos-key.sh [path/to/.env]

set -euo pipefail
ENV_FILE="${1:-.env}"

if ! command -v gh &>/dev/null; then
  echo "ERROR: gh (GitHub CLI) is required. Install it and run 'gh auth login'." >&2
  exit 1
fi

# ── 1. Read stable config values from .env ────────────────────────────────────
read_env() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed "s/^['\"]//;s/['\"]$//"; }

CIRCLECI_TOKEN="$(read_env CIRCLECI_TOKEN)"
CODEMAGIC_TOKEN="$(read_env CODEMAGIC_TOKEN)"
CODEMAGIC_APP_ID="$(read_env CODEMAGIC_APP_ID)"

# These are stable values read from .env — they are synced to CircleCI alongside
# the newly rotated POS_API_KEY so the Android build always has everything it needs.
STRIPE_PUBLISHABLE_KEY="$(read_env STRIPE_PUBLISHABLE_KEY)"
STRIPE_LOCATION_ID="$(read_env STRIPE_LOCATION_ID)"
POS_API_BASE_URL="$(read_env PUBLIC_BASE_URL)"
# Fall back to the canonical domain if PUBLIC_BASE_URL is blank
POS_API_BASE_URL="${POS_API_BASE_URL:-https://kalakosh.ch}"

# ── 2. Generate new POS_API_KEY ───────────────────────────────────────────────
NEW_KEY="$(openssl rand -hex 32)"
echo "Generated new POS_API_KEY: ${NEW_KEY:0:12}..."

# ── 3. Update local .env ──────────────────────────────────────────────────────
cp "$ENV_FILE" "$ENV_FILE.bak"
if grep -qE "^POS_API_KEY=" "$ENV_FILE"; then
  sed -i "s|^POS_API_KEY=.*|POS_API_KEY=$NEW_KEY|" "$ENV_FILE"
else
  echo "POS_API_KEY=$NEW_KEY" >> "$ENV_FILE"
fi
echo "✓ Updated local $ENV_FILE (backup saved as $ENV_FILE.bak)"

# ── 4. Update GitHub Secrets (POS_API_KEY only — the other three are stable  ──
#       config values that don't need to be rotated, but we still push them so  
#       all three repos are fully bootstrapped on first run)                    
update_github_secret() {
  local repo="$1" name="$2" value="$3"
  printf '%s' "$value" | gh secret set "$name" --repo "$repo"
  echo "  ✓ $name → $repo"
}

echo "Updating GitHub secrets..."
for repo in "ankurgupta7/Kalakosh-ch" "ankurgupta7/kalakosh-pos-android" "ankurgupta7/kalakosh-pos-ios"; do
  update_github_secret "$repo" "POS_API_KEY" "$NEW_KEY"
done

# Android repos also need the three stable secrets for the secrets.xml build step
for repo in "ankurgupta7/kalakosh-pos-android"; do
  update_github_secret "$repo" "POS_API_BASE_URL"       "$POS_API_BASE_URL"
  [[ -n "$STRIPE_PUBLISHABLE_KEY" ]] && update_github_secret "$repo" "STRIPE_PUBLISHABLE_KEY" "$STRIPE_PUBLISHABLE_KEY"
  [[ -n "$STRIPE_LOCATION_ID"     ]] && update_github_secret "$repo" "STRIPE_LOCATION_ID"     "$STRIPE_LOCATION_ID"
done
echo "✓ GitHub secrets updated"

# ── 5. Update CircleCI (kalakosh-pos-android) ─────────────────────────────────
# Helper: upsert a CircleCI project env var (POST; if 409 conflict, DELETE then POST)
circleci_upsert() {
  local slug="$1" name="$2" value="$3"
  local base="https://circleci.com/api/v2/project/${slug}/envvar"
  local payload
  payload="$(printf '{"name":"%s","value":"%s"}' "$name" "$value")"
  local status
  status="$(curl -s -o /dev/null -w "%{http_code}" -X POST "$base" \
    -H "Circle-Token: $CIRCLECI_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$payload")"
  if [[ "$status" == "409" ]]; then
    curl -s -X DELETE "$base/$name" -H "Circle-Token: $CIRCLECI_TOKEN" >/dev/null
    curl -s -X POST "$base" \
      -H "Circle-Token: $CIRCLECI_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$payload" >/dev/null
  fi
  echo "  ✓ $name"
}

if [[ -n "$CIRCLECI_TOKEN" ]]; then
  echo "Updating CircleCI environment variables..."
  SLUG="github/ankurgupta7/kalakosh-pos-android"
  circleci_upsert "$SLUG" "POS_API_KEY"            "$NEW_KEY"
  circleci_upsert "$SLUG" "POS_API_BASE_URL"       "$POS_API_BASE_URL"
  [[ -n "$STRIPE_PUBLISHABLE_KEY" ]] && circleci_upsert "$SLUG" "STRIPE_PUBLISHABLE_KEY" "$STRIPE_PUBLISHABLE_KEY"
  [[ -n "$STRIPE_LOCATION_ID"     ]] && circleci_upsert "$SLUG" "STRIPE_LOCATION_ID"     "$STRIPE_LOCATION_ID"
  echo "✓ CircleCI updated"
else
  echo "⚠ CIRCLECI_TOKEN not set in $ENV_FILE — skipping CircleCI."
  echo "  Add CIRCLECI_TOKEN to $ENV_FILE and re-run to sync automatically."
fi

# ── 6. Update Codemagic (kalakosh-pos-ios — POS_API_KEY only) ─────────────────
if [[ -n "$CODEMAGIC_TOKEN" && -n "$CODEMAGIC_APP_ID" ]]; then
  echo "Updating Codemagic environment variable..."
  curl -sf -X POST "https://api.codemagic.io/apps/${CODEMAGIC_APP_ID}/variables" \
    -H "Content-Type: application/json" \
    -H "x-auth-token: $CODEMAGIC_TOKEN" \
    -d "{
      \"environment\": {
        \"variables\": {
          \"POS_API_KEY\": \"$NEW_KEY\"
        }
      }
    }" >/dev/null
  echo "✓ Codemagic updated"
else
  echo "⚠ CODEMAGIC_TOKEN or CODEMAGIC_APP_ID not set in $ENV_FILE — skipping Codemagic."
  echo "  Add them to $ENV_FILE and re-run to sync automatically."
fi

echo ""
echo "Done! POS_API_KEY rotated and all secrets synced."
echo "Restart the web server to pick up the new key: ./update.sh"
