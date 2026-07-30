#!/bin/bash
# deploy/tenant-admin.sh — show who owns a store, and promote a user to its admin.
#
# WHY THIS EXISTS
# Signup creates a *pending* admin row plus a one-time claim token, and the
# owner becomes admin only when the browser redeems it via tenant.claimAdmin
# (see server/routers/tenant.ts). The token is stashed in **sessionStorage on
# the marketing origin** (zolto.ch), so the claim is lost whenever the owner
# doesn't land back on zolto.ch/onboarding in the same tab — for example by
# going straight to <slug>.zolto.ch/admin, which is a *different origin*, or by
# OAuth returning in a new tab. Mobile Safari makes that more likely, not less.
#
# When that happens the owner is signed in but still role='customer', and every
# adminProcedure fails with "You do not have required permission (10002)" —
# including "Connect Stripe", which then looks like a payments problem.
#
# This script is the operator's way out. Default is READ ONLY.
#
#   Usage:
#     bash deploy/tenant-admin.sh                      # list stores + their users
#     bash deploy/tenant-admin.sh <slug>               # show one store's users
#     bash deploy/tenant-admin.sh <slug> --promote <email>
#
# --promote sets role='admin' and attaches the user to that tenant. It only ever
# touches a user that already exists (they must have signed in at least once),
# and it never creates or deletes anyone.
#
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

if [ ! -f .env ]; then
  echo "ERROR: .env not found in $(pwd). Run this from the repo root on the server." >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source <(grep -v '^\s*#' .env | grep -v '^\s*$')
set +a

: "${MYSQL_USER:?MYSQL_USER not set in .env}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD not set in .env}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE not set in .env}"

MYSQL="docker compose exec -T db mysql --connect-timeout=10 -u${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE}"

if ! $MYSQL -e "SELECT 1" >/dev/null 2>&1; then
  echo "ERROR: cannot reach the db container. Is 'docker compose up -d db' running?" >&2
  exit 1
fi

# Escape single quotes so an apostrophe in an email can't break (or inject into)
# the statement.
esc() { printf '%s' "$1" | sed "s/'/''/g"; }

SLUG="${1:-}"
MODE="${2:-}"
EMAIL="${3:-}"

if [ -z "$SLUG" ]; then
  echo "── Stores ──────────────────────────────────────────────────────"
  $MYSQL -e "SELECT t.id, t.slug, t.name, t.plan,
       SUM(u.role IN ('admin','superadmin')) AS admins,
       COUNT(u.id) AS users
     FROM tenants t LEFT JOIN users u ON u.tenant_id = t.id
     GROUP BY t.id, t.slug, t.name, t.plan ORDER BY t.id;"
  echo
  echo "A store showing admins = 0 cannot use ANY admin feature — its owner"
  echo "never redeemed the claim token. Fix with:"
  echo "  bash deploy/tenant-admin.sh <slug> --promote <email>"
  exit 0
fi

SLUG_E="$(esc "$SLUG")"
TENANT_ID="$($MYSQL -N -s -e "SELECT id FROM tenants WHERE slug='${SLUG_E}' LIMIT 1;" 2>/dev/null)"
if [ -z "$TENANT_ID" ]; then
  echo "ERROR: no store with slug '${SLUG}'." >&2
  exit 1
fi

if [ "$MODE" = "--promote" ]; then
  if [ -z "$EMAIL" ]; then
    echo "ERROR: --promote needs an email. Usage: $0 <slug> --promote <email>" >&2
    exit 1
  fi
  EMAIL_E="$(esc "$EMAIL")"
  # The user must already exist: role is granted to a real signed-in identity,
  # never invented here.
  FOUND="$($MYSQL -N -s -e "SELECT COUNT(*) FROM users WHERE email='${EMAIL_E}';" 2>/dev/null)"
  if [ "${FOUND:-0}" = "0" ]; then
    echo "ERROR: no user with email '${EMAIL}'. They must sign in to Zolto once first," >&2
    echo "       so the account exists, then re-run this." >&2
    exit 1
  fi
  if [ "${FOUND:-0}" != "1" ]; then
    echo "ERROR: ${FOUND} users share '${EMAIL}'. Refusing to guess — inspect with:" >&2
    echo "       bash $0 ${SLUG}" >&2
    exit 1
  fi

  echo "Promoting ${EMAIL} to admin of '${SLUG}' (tenant ${TENANT_ID})…"
  $MYSQL -e "UPDATE users SET role='admin', tenant_id=${TENANT_ID} WHERE email='${EMAIL_E}';"

  # Burn any still-pending claim row for this tenant so a stale token can't
  # later re-point ownership at somebody else.
  $MYSQL -e "DELETE FROM users WHERE tenant_id=${TENANT_ID} AND openId LIKE 'pending:%';"

  echo "Done. Have them sign out and back in, then retry Connect Stripe."
  echo
fi

echo "── Users for '${SLUG}' (tenant ${TENANT_ID}) ────────────────────"
$MYSQL -e "SELECT id, email, role, tenant_id,
     CASE WHEN openId LIKE 'pending:%' THEN 'PENDING CLAIM' ELSE 'signed in' END AS status
   FROM users WHERE tenant_id=${TENANT_ID} ORDER BY FIELD(role,'superadmin','admin','staff','customer'), id;"
echo
echo "── This store's Stripe Connect state ───────────────────────────"
$MYSQL -e "SELECT slug,
     CASE WHEN stripe_connected_account_id IS NULL THEN 'not linked'
          ELSE CONCAT('linked: ', stripe_connected_account_id) END AS connect
   FROM tenants WHERE id=${TENANT_ID};"
