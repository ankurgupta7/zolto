#!/bin/bash
# deploy/tenant-admin.sh — show who owns a store, and promote a user to its admin.
#
# WHY THIS EXISTS
# Every adminProcedure rejects a caller who isn't role admin/superadmin with
# "You do not have required permission (10002)". On the "Connect Stripe" button
# that reads as a payments problem, and it is not. There are three distinct
# causes and they need different fixes:
#
#   1. The database has no users at all — usually a recreated volume. NOTHING
#      here can help; restore a backup instead. The listing warns about this.
#   2. A store exists with users but no admin: the owner signed in yet never
#      redeemed the signup claim token. The token lives in sessionStorage on the
#      MARKETING origin (zolto.ch), so it is lost if the owner lands on
#      <slug>.zolto.ch (a different origin) or in a new tab — likely on mobile.
#      `--promote` is the fix.
#   3. The session's user row is gone while the cookie survives, so ctx.user is
#      null. Signing out and back in re-creates it.
#
# Default is READ ONLY.
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

# Parse .env literally via the shared loader. NEVER `source` it: values like
# RESEND_FROM_EMAIL=Zolto <orders@zolto.ch> contain shell metacharacters and
# would be EXECUTED, not read — which is exactly why deploy/lib/env.sh exists
# (see its header). The older deploy/*.sh scripts still use the unsafe pattern.
# shellcheck source=lib/env.sh
. "$(dirname "$0")/lib/env.sh"
load_dotenv .env || {
  echo "ERROR: could not read .env" >&2
  exit 1
}

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
       COALESCE(SUM(u.role IN ('admin','superadmin')), 0) AS admins,
       COUNT(u.id) AS users
     FROM tenants t LEFT JOIN users u ON u.tenant_id = t.id
     GROUP BY t.id, t.slug, t.name, t.plan ORDER BY t.id;"
  echo

  TOTAL_TENANTS="$($MYSQL -N -s -e "SELECT COUNT(*) FROM tenants;" 2>/dev/null)"
  TOTAL_USERS="$($MYSQL -N -s -e "SELECT COUNT(*) FROM users;" 2>/dev/null)"
  echo "Totals: ${TOTAL_TENANTS:-?} store(s), ${TOTAL_USERS:-?} user(s)."
  echo

  # Distinguish the two very different empty states. Telling an operator "the
  # owner never redeemed the claim token" when the database simply has no users
  # would send them to fix the wrong thing.
  if [ "${TOTAL_USERS:-0}" = "0" ]; then
    cat <<'WARN'
⚠  There are NO users in this database at all.

That is not a claim-token problem — nothing exists to promote. Either no one
has ever signed in against this database, or its data is gone (a recreated
volume, a fresh `docker compose down -v`, a restore that did not happen).

STOP and check before creating anything on top of it:
  ls -la backups/                     # is there a backup to restore from?
  docker compose exec -T db mysql ... # or: bash deploy/inspect-db.sh
  ./deploy/recover-from-backup.sh     # restore path, if a backup exists

Writing new data first can make a recoverable database unrecoverable.
WARN
  else
    echo "A store showing admins = 0 but users > 0 means its owner signed in"
    echo "yet never redeemed the claim token. Fix with:"
    echo "  bash deploy/tenant-admin.sh <slug> --promote <email>"
    echo
    echo "A store showing users = 0 means nobody has ever signed in to it."
  fi
  exit 0
fi

SLUG_E="$(esc "$SLUG")"
TENANT_ID="$($MYSQL -N -s -e "SELECT id FROM tenants WHERE slug='${SLUG_E}' LIMIT 1;" 2>/dev/null)"
if [ -z "$TENANT_ID" ]; then
  echo "ERROR: no store with slug '${SLUG}' exists in this database." >&2
  echo "Stores that do exist:" >&2
  $MYSQL -N -s -e "SELECT slug FROM tenants ORDER BY id;" 2>/dev/null | sed 's/^/  - /' >&2
  echo "(If the store you expected is missing, the database may have been" >&2
  echo " reset — check backups/ before recreating it.)" >&2
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
