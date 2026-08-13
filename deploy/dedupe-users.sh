#!/bin/bash
# deploy/dedupe-users.sh — find, inspect, and remove duplicate user rows on a
# Docker deployment.
#
# WHY A SHELL SCRIPT AND NOT scripts/dedupe-users.ts
# The tsx script cannot run against a Docker deploy. The runner image copies
# only dist/, drizzle/ and drizzle.config.ts (see Dockerfile), so scripts/ and
# server/ are not in it; tsx is a devDependency and the runner installs with
# --prod, so it isn't there either; and the db service publishes no host port
# (internal network only), so a host checkout can't reach MySQL. This talks to
# the database the same way every migration in deploy/lib/db.sh does —
# `docker compose exec -T db mysql` — which needs nothing added to the image.
#
# WHY THIS EXISTS AT ALL
# `users.email` is not unique; `users.openId` is. Two rows on one address is a
# state the schema allows on purpose, and usually the right one: an owner
# running two stores has one row per tenant, and an unfinished signup leaves a
# `pending:<token>` row beside the real account. Neither should be deleted.
# The real duplicate is one person who signed in two ways (`google:<sub>` one
# day, a magic link the next), minting two openIds on the SAME tenant.
#
# SAFETY
# Read-only unless --delete is passed with an explicit id. Before deleting it
# prints the row and refuses if it is an unclaimed signup or the last admin of
# its tenant (that would lock the merchant out of their own store). A delete
# is not reversible — take a backup first:
#   docker compose exec -T db mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" \
#     "$MYSQL_DATABASE" > backup-$(date +%F).sql
#
#   Usage, from the repo root on the server (where docker-compose.yml and .env are):
#     bash deploy/dedupe-users.sh                  # survey: every duplicated address
#     bash deploy/dedupe-users.sh --email a@b.c    # the rows behind one address
#     bash deploy/dedupe-users.sh --delete 42      # remove exactly that row
#     bash deploy/dedupe-users.sh --delete 42 --force

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log()  { echo "==> $*"; }
ok()   { echo "  OK $*"; }
die()  { echo "FATAL: $*" >&2; exit 1; }

# ── Args ─────────────────────────────────────────────────────────────────────
EMAIL=""
DELETE_ID=""
FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --email)  EMAIL="${2:-}";     shift 2 ;;
    --delete) DELETE_ID="${2:-}"; shift 2 ;;
    --force)  FORCE=1;            shift ;;
    -h|--help) sed -n '1,36p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) die "Unknown argument: $1" ;;
  esac
done

if [ -n "$DELETE_ID" ] && ! [[ "$DELETE_ID" =~ ^[0-9]+$ ]]; then
  die "--delete needs a numeric user id, got '${DELETE_ID}'"
fi

# ── Credentials come from .env, same as update.sh ─────────────────────────────
[ -f "${REPO_ROOT}/.env" ] || die "No .env at ${REPO_ROOT}/.env — run this from the repo root on the server."
# shellcheck disable=SC1091
set -a; . "${REPO_ROOT}/.env"; set +a
: "${MYSQL_USER:?MYSQL_USER missing from .env}"
: "${MYSQL_PASSWORD:?MYSQL_PASSWORD missing from .env}"
: "${MYSQL_DATABASE:?MYSQL_DATABASE missing from .env}"

cd "${REPO_ROOT}" || die "Cannot cd to ${REPO_ROOT}"

# Same shape as deploy/lib/db.sh build_mysql_cmd: bounded connect time so a
# stuck database fails fast instead of hanging with no feedback.
MYSQL="docker compose exec -T db mysql --connect-timeout=10 -u${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE}"

# Run SQL, surfacing the real MySQL error rather than discarding it.
q() { # q SQL  → tab-separated rows, no header
  local out
  if ! out=$($MYSQL -sN -e "$1" 2>&1); then
    die "Query failed:
${out}"
  fi
  # mysql prints the password warning on stderr, which 2>&1 folds in; drop it.
  echo "$out" | grep -v "Using a password on the command line" || true
}

# SQL string literal escaping: single quotes and backslashes.
sql_quote() { printf "%s" "$1" | sed "s/\\\\/\\\\\\\\/g; s/'/''/g"; }

# ── Survey ───────────────────────────────────────────────────────────────────
survey() {
  local rows
  rows=$(q "SELECT COUNT(*) AS c, LOWER(email)
            FROM users WHERE email IS NOT NULL
            GROUP BY LOWER(email) HAVING COUNT(*) > 1
            ORDER BY c DESC;")
  if [ -z "$rows" ]; then
    ok "No email address is held by more than one user row."
    return
  fi
  log "Addresses held by more than one row:"
  echo ""
  echo "$rows" | while IFS=$'\t' read -r c e; do
    printf '  %s×  %s\n' "$c" "$e"
  done
  echo ""
  echo "Inspect one with:  bash deploy/dedupe-users.sh --email <address>"
}

# ── Inspect ──────────────────────────────────────────────────────────────────
# Prints the fields that actually distinguish the rows — openId, tenant and
# sign-in dates — because the address alone cannot.
inspect() {
  local email_esc rows
  email_esc=$(sql_quote "$1")
  rows=$(q "SELECT u.id, u.tenant_id, COALESCE(t.name,'—'), u.role, u.openId,
                   COALESCE(u.name,'—'), COALESCE(u.email,'—'),
                   COALESCE(u.loginMethod,'—'),
                   DATE_FORMAT(u.createdAt,'%Y-%m-%d %H:%i'),
                   DATE_FORMAT(u.lastSignedIn,'%Y-%m-%d %H:%i')
            FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
            WHERE LOWER(u.email) = LOWER('${email_esc}')
            ORDER BY u.id;")
  [ -n "$rows" ] || die "No user rows with email $1"

  log "Rows for $1:"
  echo ""
  echo "$rows" | while IFS=$'\t' read -r id tid tname role openid name mail method created lastseen; do
    local flag=""
    case "$openid" in pending:*) flag="   <- unclaimed signup, not a duplicate" ;; esac
    printf '  id %s  %-10s tenant %s (%s)\n' "$id" "$role" "$tid" "$tname"
    printf '      openId       %s%s\n' "$openid" "$flag"
    printf '      name/email   %s <%s>\n' "$name" "$mail"
    printf '      loginMethod  %s\n' "$method"
    printf '      created      %s      last signed in  %s\n\n' "$created" "$lastseen"
  done

  # Verdict, computed in SQL so the shell doesn't have to re-parse the rows.
  local real tenants
  real=$(q "SELECT COUNT(*) FROM users
            WHERE LOWER(email)=LOWER('${email_esc}') AND openId NOT LIKE 'pending:%';")
  tenants=$(q "SELECT COUNT(DISTINCT tenant_id) FROM users
               WHERE LOWER(email)=LOWER('${email_esc}') AND openId NOT LIKE 'pending:%';")
  if [ "${real:-0}" -lt 2 ]; then
    echo "Not a duplicate: only one real account here (the rest are unclaimed signups)."
  elif [ "${tenants:-0}" -eq "${real:-0}" ]; then
    echo "Probably not a duplicate: one row per tenant — this address runs more than one store."
  else
    echo "Looks like a real duplicate: two rows on the same tenant, different openIds."
    echo "Keep the one whose openId matches how they sign in now (usually the more"
    echo "recent lastSignedIn), and delete the other with --delete <id>."
  fi
}

# ── Delete ───────────────────────────────────────────────────────────────────
remove() {
  local id="$1" row tid role openid mail
  row=$(q "SELECT tenant_id, role, openId, COALESCE(email,'—') FROM users WHERE id = ${id};")
  [ -n "$row" ] || die "No user with id ${id}"
  IFS=$'\t' read -r tid role openid mail <<< "$row"

  log "About to delete user ${id}: ${role} on tenant ${tid}, openId ${openid}, <${mail}>"

  if [ "$FORCE" -eq 0 ]; then
    case "$openid" in
      pending:*)
        die "User ${id} is an unclaimed signup (openId ${openid}), not a duplicate —
deleting it abandons a store nobody has claimed yet. Pass --force if you are sure." ;;
    esac
    if [ "$role" = "admin" ] || [ "$role" = "superadmin" ]; then
      local others
      others=$(q "SELECT COUNT(*) FROM users
                  WHERE tenant_id = ${tid} AND id <> ${id}
                    AND role IN ('admin','superadmin') AND openId NOT LIKE 'pending:%';")
      if [ "${others:-0}" -eq 0 ]; then
        die "User ${id} is the only admin left on tenant ${tid} — deleting it locks the
merchant out of their own store. Promote another user first, or pass --force."
      fi
    fi
  fi

  q "DELETE FROM users WHERE id = ${id};"
  ok "Deleted user ${id}."
  echo "  Note: audit_logs.user_id rows for this user now point at a missing user;"
  echo "  orders and POS history are tenant-scoped and are unaffected."
}

if [ -n "$DELETE_ID" ]; then
  remove "$DELETE_ID"
elif [ -n "$EMAIL" ]; then
  inspect "$EMAIL"
else
  survey
fi
