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
#     bash deploy/tenant-admin.sh --superadmin <email> # grant platform ownership
#
# --promote sets role='admin' and attaches the user to that tenant. It only ever
# touches a user that already exists (they must have signed in at least once),
# and it never creates or deletes anyone.
#
# --superadmin grants PLATFORM ownership (role='superadmin'), which is a
# different thing from being the admin of a store and takes no slug. It exists
# because nothing else in the codebase ever sets that role: signup grants
# 'admin' via tenant.claimAdmin, and --promote above grants 'admin'. So the
# operator console at zolto.ch/platform, the cross-tenant metrics, and the
# all-stores Stripe sweep were unreachable by every real account — the code
# shipped, the role to use it did not. This is the one grant that must be made
# by hand on the server, deliberately: a superadmin reads every merchant's
# numbers and may act as any store's admin (server/_core/trpc.ts). Keep the
# list short and check it with the no-argument listing below.
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

# "No user with that email" is a dead end unless it also says which emails DO
# exist. Almost always the operator signed in through Google or Apple under a
# different address than the one they typed — so print the candidates instead
# of making them guess a second and third time.
suggest_emails() {
  local total
  total="$($MYSQL -N -s -e "SELECT COUNT(*) FROM users;" 2>/dev/null)"
  if [ "${total:-0}" = "0" ]; then
    echo "       There are NO users in this database at all, so there is nothing to" >&2
    echo "       promote. Sign up at https://zolto.ch/signup first. (If you expected" >&2
    echo "       accounts here, check backups/ before writing anything on top.)" >&2
    return
  fi
  echo "       Accounts that DO exist (${total}):" >&2
  # Order matters: `>&2` first duplicates stdout onto the CURRENT stderr, then
  # `2>/dev/null` silences only mysql's own chatter. Written the other way
  # round, stderr goes to /dev/null and stdout follows it there — printing the
  # header and then nothing at all.
  $MYSQL -N -s -e \
    "SELECT CONCAT('         ', COALESCE(email,'(no email)'), '  [', role, ']')
     FROM users ORDER BY FIELD(role,'superadmin','admin','staff','customer'), id
     LIMIT 40;" >&2 2>/dev/null
  if [ "${total:-0}" -gt 40 ]; then
    echo "         … and $((total - 40)) more." >&2
  fi
}

SLUG="${1:-}"
MODE="${2:-}"
EMAIL="${3:-}"

# ── Platform ownership ────────────────────────────────────────────────────────
# Handled before the slug lookup: superadmin is platform-wide and deliberately
# takes no store. The user keeps whatever tenant_id they already had — being
# the owner of Zolto and the admin of your own shop are not in conflict, and
# superadmin outranks admin everywhere the app checks (client/src/admin/nav.ts
# ROLE_RANK, server/_core/trpc.ts).
if [ "$SLUG" = "--superadmin" ]; then
  SA_EMAIL="${2:-}"
  if [ -z "$SA_EMAIL" ]; then
    echo "ERROR: --superadmin needs an email. Usage: $0 --superadmin <email>" >&2
    exit 1
  fi
  SA_EMAIL_E="$(esc "$SA_EMAIL")"
  # Case-insensitive: providers hand back addresses in whatever case the user
  # typed at signup, and nobody remembers which that was.
  SA_FOUND="$($MYSQL -N -s -e "SELECT COUNT(*) FROM users WHERE LOWER(email)=LOWER('${SA_EMAIL_E}');" 2>/dev/null)"
  if [ "${SA_FOUND:-0}" = "0" ]; then
    echo "ERROR: no user with email '${SA_EMAIL}'." >&2
    suggest_emails
    exit 1
  fi
  if [ "${SA_FOUND:-0}" != "1" ]; then
    echo "ERROR: ${SA_FOUND} users share '${SA_EMAIL}'. Refusing to guess." >&2
    exit 1
  fi

  echo "Granting PLATFORM ownership (superadmin) to ${SA_EMAIL}…"
  echo "They will be able to read every store's numbers and act as any store's admin."
  $MYSQL -e "UPDATE users SET role='superadmin' WHERE LOWER(email)=LOWER('${SA_EMAIL_E}');"

  echo
  echo "── Everyone who now owns the platform ──────────────────────────"
  $MYSQL -e "SELECT id, email, tenant_id FROM users WHERE role='superadmin' ORDER BY id;"
  echo
  echo "Done. Sign out and back in, then open https://zolto.ch/platform"
  exit 0
fi

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
There are NO users in this database at all, so there is nothing to promote —
this is not a claim-token problem. Just sign up again to create one.

While Zolto is in staging that is the expected state after a reset. If you did
NOT expect it on a database that held real accounts, stop and check before
writing anything on top:
  bash deploy/inspect-db.sh           # says whether rows were ever inserted
  ls -la backups/                     # is there a backup to restore from?
  ./deploy/recover-from-backup.sh     # restore path, if a backup exists
WARN
  else
    echo "A store showing admins = 0 but users > 0 means its owner signed in"
    echo "yet never redeemed the claim token. Fix with:"
    echo "  bash deploy/tenant-admin.sh <slug> --promote <email>"
    echo
    echo "A store showing users = 0 means nobody has ever signed in to it."
  fi

  # Who owns the platform itself. Shown unprompted because the usual reason
  # zolto.ch/platform looks empty is that this list is empty.
  echo
  echo "── Platform owners (superadmin) ────────────────────────────────"
  SA_COUNT="$($MYSQL -N -s -e "SELECT COUNT(*) FROM users WHERE role='superadmin';" 2>/dev/null)"
  if [ "${SA_COUNT:-0}" = "0" ]; then
    echo "None. The operator console at zolto.ch/platform will refuse everyone"
    echo "until somebody holds this role. Grant it with:"
    echo "  bash deploy/tenant-admin.sh --superadmin <email>"
  else
    $MYSQL -e "SELECT id, email, tenant_id FROM users WHERE role='superadmin' ORDER BY id;"
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
  # never invented here. Matched case-insensitively — see the superadmin path.
  FOUND="$($MYSQL -N -s -e "SELECT COUNT(*) FROM users WHERE LOWER(email)=LOWER('${EMAIL_E}');" 2>/dev/null)"
  if [ "${FOUND:-0}" = "0" ]; then
    echo "ERROR: no user with email '${EMAIL}'. They must sign in to Zolto once first," >&2
    echo "       so the account exists, then re-run this." >&2
    suggest_emails
    exit 1
  fi
  if [ "${FOUND:-0}" != "1" ]; then
    echo "ERROR: ${FOUND} users share '${EMAIL}'. Refusing to guess — inspect with:" >&2
    echo "       bash $0 ${SLUG}" >&2
    exit 1
  fi

  echo "Promoting ${EMAIL} to admin of '${SLUG}' (tenant ${TENANT_ID})…"
  $MYSQL -e "UPDATE users SET role='admin', tenant_id=${TENANT_ID} WHERE LOWER(email)=LOWER('${EMAIL_E}');"

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
