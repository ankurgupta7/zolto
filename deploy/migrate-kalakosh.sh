#!/usr/bin/env bash
# deploy/migrate-kalakosh.sh — diagnose, repair and run the Kalakosh → Zolto
# catalogue migration in one pass.
#
# WHY THIS EXISTS
# The migration itself is one command (scripts/import-kalakosh-live-catalog.ts).
# Getting to the point where that command does the right thing took a dozen
# manual steps, and every one of them failed silently in a way that looked like
# success:
#
#   - `set -a; . .env` executed a secret as a shell command. .env is data;
#     deploy/lib/env.sh parses it without evaluating it.
#   - The destination tenant did not exist, so the importer refused — but only
#     after the operator had already staged everything else.
#   - The scratch source container was on the right network yet unresolvable by
#     name, so mysql2 died with EAI_AGAIN. Addressing it by IP sidesteps
#     Docker's embedded DNS entirely.
#   - S3 still held .env.example's placeholders, so all 158 products imported
#     with no photo and the run still reported "0 failed". Ten uploads failed;
#     the catalogue was already written by then.
#   - Re-running does not repair that: products are matched by name and skipped,
#     so a photoless import stays photoless until the rows are removed.
#
# Every one of those is a precondition that can be checked BEFORE anything is
# written. That is what this script is: diagnostics first, and a run only if
# the diagnostics say the run will do what the operator expects.
#
#   bash deploy/migrate-kalakosh.sh --diagnose      # read-only report
#   bash deploy/migrate-kalakosh.sh                 # diagnose, then migrate
#   bash deploy/migrate-kalakosh.sh --reimport      # also replace a bad import
#   bash deploy/migrate-kalakosh.sh --rotate-keys   # …then rotate the S3 key
#
# Nothing here creates a tenant or invents credentials. Those need a human
# decision, so the script stops and says exactly which one is missing.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}/.." || exit 1

# shellcheck source=deploy/lib/env.sh
. "${SCRIPT_DIR}/lib/env.sh"

# ── Options ───────────────────────────────────────────────────────────────────
ENV_FILE=".env"
TENANT_SLUG="kalakosh"
DUMP_PATH=""
SCRATCH_NAME="kalakosh-src"
SCRATCH_PASSWORD="temp"
IMAGE_TAG="zolto-migrate"
LOG_FILE="/tmp/kalakosh-migration-$(date -u +%Y%m%d-%H%M%S).log"
DIAGNOSE_ONLY=0
REIMPORT=0
ROTATE_KEYS=0
KEEP_SCRATCH=0
ASSUME_YES=0

DOCKER_BIN="${DOCKER_BIN:-docker}"

usage() {
  cat <<'EOF'
Usage: bash deploy/migrate-kalakosh.sh [options]

Runs eight diagnostics, then migrates the Kalakosh catalogue into this
deployment's tenant if — and only if — they all pass.

  1  .env is readable and parses without being executed
  2  the destination database answers
  3  the destination tenant exists and has categories
  4  a source catalogue is available (scratch container, dump, or live stack)
  5  the plan's product cap can hold the source catalogue
  6  S3 is configured (not .env.example placeholders)
  7  a real S3 write/read/delete round-trip succeeds
  8  the source's photos are reachable

Then it decides what to do from the destination's current state:

  empty tenant                    → import
  already holds the whole source  → nothing to do
  imported, but photos missing    → offer to replace (needs --reimport)
  tenant has orders               → refuse to replace anything

Options:
  --diagnose        Report and stop. Writes nothing, creates nothing.
  --reimport        Permit replacing an existing photoless import. Only ever
                    acts when the tenant has no orders of any kind.
  --rotate-keys     After a successful migration, rotate the S3 key via
                    deploy/rotate-secrets.sh s3-key.
  --dump PATH       Source dump: a backup-*.tar.gz or a plain .sql. Default is
                    the newest tarball in ../Kalakosh-ch/backups or ./backups;
                    failing that, a live dump from the Kalakosh stack.
  --tenant SLUG     Destination tenant slug (default: kalakosh).
  --env FILE        .env to read (default: .env).
  --keep-scratch    Leave the scratch source container running afterwards.
  --yes             Do not prompt before replacing an existing import.
  -h, --help        This text.

Exit codes:
  0  migration ran, or nothing needed doing
  1  a diagnostic failed — nothing was written
  2  the migration ran but did not fully succeed (see the log)
EOF
}

# ── Logging ───────────────────────────────────────────────────────────────────
step() {
  echo ""
  echo "==> $1"
}
ok() { echo "  ✓ $1"; }
info() { echo "  · $1"; }
warn() { echo "  ⚠ $1" >&2; }
die() {
  echo "" >&2
  echo "BLOCKED: $1" >&2
  exit 1
}

# ── Pure decision logic (unit-tested in migrate-kalakosh.test.sh) ─────────────

# is_placeholder <value>
# True when a value is still whatever .env.example shipped. A deployment
# carrying these is unconfigured, which is a different problem from a
# misconfigured one and deserves a different message.
is_placeholder() {
  case "${1:-}" in
    "") return 0 ;;
    *your_account_id* | *your_access_key* | *your_secret_key* | *change_me* | *your_bucket*)
      return 0
      ;;
    *) return 1 ;;
  esac
}

# decide_action <dest_products> <src_products> <dest_photos> <src_photos> <dest_orders>
# Prints the one thing worth doing. Kept separate from everything that touches
# the world so the branch that can destroy data is testable without a database.
decide_action() {
  local dest="${1:-0}" src="${2:-0}" dest_photos="${3:-0}" src_photos="${4:-0}" orders="${5:-0}"

  if [ "$src" -eq 0 ]; then
    echo "empty-source"
    return
  fi
  if [ "$dest" -eq 0 ]; then
    echo "import"
    return
  fi
  # Photos are the usual reason a completed import is still wrong: the rows
  # landed, the uploads did not, and a re-run skips them by name forever.
  if [ "$dest_photos" -lt "$src_photos" ]; then
    if [ "$orders" -gt 0 ]; then
      echo "blocked-orders"
    else
      echo "reimport"
    fi
    return
  fi
  if [ "$dest" -lt "$src" ]; then
    echo "import"
    return
  fi
  echo "nothing"
}

# ── Docker / SQL plumbing ─────────────────────────────────────────────────────

compose_mysql() { # compose_mysql <sql>
  "$DOCKER_BIN" compose exec -T db mysql --connect-timeout=10 \
    -N -s -u"${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" \
    -e "$1" 2>/dev/null
}

scratch_mysql() { # scratch_mysql <sql>
  "$DOCKER_BIN" exec "$SCRATCH_NAME" mysql -N -s \
    -uroot -p"${SCRATCH_PASSWORD}" kalakosh -e "$1" 2>/dev/null
}

scratch_running() {
  [ -n "$("$DOCKER_BIN" ps -q --filter "name=^${SCRATCH_NAME}$" 2>/dev/null)" ]
}

scratch_ip() {
  "$DOCKER_BIN" inspect \
    -f "{{range \$n, \$v := .NetworkSettings.Networks}}{{if eq \$n \"${NETWORK}\"}}{{\$v.IPAddress}}{{end}}{{end}}" \
    "$SCRATCH_NAME" 2>/dev/null
}

# ── Arguments ─────────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
  case "$1" in
    --diagnose) DIAGNOSE_ONLY=1; shift ;;
    --reimport) REIMPORT=1; shift ;;
    --rotate-keys) ROTATE_KEYS=1; shift ;;
    --keep-scratch) KEEP_SCRATCH=1; shift ;;
    --yes | -y) ASSUME_YES=1; shift ;;
    --dump) DUMP_PATH="${2:-}"; shift 2 ;;
    --tenant) TENANT_SLUG="${2:-}"; shift 2 ;;
    --env) ENV_FILE="${2:-}"; shift 2 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "unknown option: $1 (try --help)" >&2; exit 1 ;;
  esac
done

# Sourced by the test harness to exercise the pure helpers without running any
# of the orchestration below.
[ -n "${MIGRATE_KALAKOSH_LIB_ONLY:-}" ] && return 0

echo "Kalakosh → Zolto catalogue migration"
echo "  tenant:  ${TENANT_SLUG}"
echo "  log:     ${LOG_FILE}"
[ "$DIAGNOSE_ONLY" -eq 1 ] && echo "  mode:    DIAGNOSE ONLY — nothing will be created or written"

# ── 1. .env ───────────────────────────────────────────────────────────────────
step "1/8  Reading ${ENV_FILE}"
[ -f "$ENV_FILE" ] || die "${ENV_FILE} does not exist. Run this from the repo root on the server."
# NEVER `source` .env: a value containing backticks or $(…) would be executed.
load_dotenv "$ENV_FILE" || die "could not parse ${ENV_FILE}."
: "${MYSQL_USER:=}" "${MYSQL_PASSWORD:=}" "${MYSQL_DATABASE:=}"
[ -n "$MYSQL_USER" ] && [ -n "$MYSQL_DATABASE" ] ||
  die "MYSQL_USER / MYSQL_DATABASE are missing from ${ENV_FILE}."
ok "parsed (MYSQL_DATABASE=${MYSQL_DATABASE})"

# ── 2. Destination database ───────────────────────────────────────────────────
step "2/8  Destination database"
DEST_PING="$(compose_mysql "SELECT 1;")"
[ "$DEST_PING" = "1" ] || die "the destination database did not answer.
Is the stack up?  ${DOCKER_BIN} compose ps"
ok "reachable"

NETWORK="$("$DOCKER_BIN" inspect -f '{{range $n, $v := .NetworkSettings.Networks}}{{$n}}{{"\n"}}{{end}}' \
  "$("$DOCKER_BIN" compose ps -q db 2>/dev/null)" 2>/dev/null | head -1)"
[ -n "$NETWORK" ] || die "could not determine the database's Docker network."
ok "network: ${NETWORK}"

# ── 3. Destination tenant ─────────────────────────────────────────────────────
step "3/8  Destination tenant '${TENANT_SLUG}'"
TENANT_ROW="$(compose_mysql "SELECT id, plan FROM tenants WHERE slug='${TENANT_SLUG}' LIMIT 1;")"
if [ -z "$TENANT_ROW" ]; then
  echo "" >&2
  echo "  Stores that DO exist:" >&2
  compose_mysql "SELECT CONCAT('    ', id, '  ', slug, '  (', plan, ')') FROM tenants ORDER BY id;" >&2
  die "no tenant with slug '${TENANT_SLUG}'.

The importer will not invent one, and neither will this script: signup writes
the tenant, its settings, its seeded categories and its admin claim together
(server/routers/tenant.ts). A hand-written row gets the first and none of the rest.

  Create it at  https://zolto.ch/signup  — store URL '${TENANT_SLUG}',
  vertical 'Jewellery' (its categories are the ones the source rows carry),
  and an email not already attached to another store.
  Then re-run this script."
fi
TENANT_ID="$(echo "$TENANT_ROW" | awk '{print $1}')"
TENANT_PLAN="$(echo "$TENANT_ROW" | awk '{print $2}')"
ok "tenant ${TENANT_ID}, plan ${TENANT_PLAN}"

CATEGORY_COUNT="$(compose_mysql "SELECT COUNT(*) FROM tenant_categories WHERE tenant_id=${TENANT_ID};")"
if [ "${CATEGORY_COUNT:-0}" -eq 0 ]; then
  warn "no tenant_categories rows — the importer falls back to the vertical preset,"
  warn "  but the storefront's category chips will not match. Check admin → Categories."
else
  ok "${CATEGORY_COUNT} categories"
fi

# ── 4. Source catalogue ───────────────────────────────────────────────────────
step "4/8  Source catalogue"
if scratch_running && [ -n "$(scratch_mysql "SHOW TABLES LIKE 'products';")" ]; then
  ok "scratch container '${SCRATCH_NAME}' already holds a catalogue"
elif [ "$DIAGNOSE_ONLY" -eq 1 ]; then
  warn "no scratch source is loaded; --diagnose will not create one."
  warn "  Re-run without --diagnose to stage it from a dump."
  SRC_TOTAL=0
  SRC_PHOTOS=0
else
  if [ -z "$DUMP_PATH" ]; then
    DUMP_PATH="$(ls -t ../Kalakosh-ch/backups/*.tar.gz ./backups/*.tar.gz 2>/dev/null | head -1)"
  fi

  STAGE_SQL=""
  if [ -n "$DUMP_PATH" ] && [ -f "$DUMP_PATH" ]; then
    case "$DUMP_PATH" in
      *.tar.gz)
        STAGE_DIR="$(mktemp -d)"
        tar xzf "$DUMP_PATH" -C "$STAGE_DIR" || die "could not extract ${DUMP_PATH}"
        STAGE_SQL="$(find "$STAGE_DIR" -name 'backup.sql' -print -quit)"
        [ -n "$STAGE_SQL" ] || die "no backup.sql inside ${DUMP_PATH}"
        info "using dump ${DUMP_PATH}"
        ;;
      *.sql)
        STAGE_SQL="$DUMP_PATH"
        info "using dump ${DUMP_PATH}"
        ;;
      *) die "--dump must be a .tar.gz or .sql (got ${DUMP_PATH})" ;;
    esac
  elif [ -d ../Kalakosh-ch ]; then
    info "no backup tarball found — dumping the live Kalakosh stack"
    STAGE_SQL="$(mktemp)"
    (cd ../Kalakosh-ch && "$DOCKER_BIN" compose exec -T db sh -c \
      'mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --no-tablespaces "$MYSQL_DATABASE"') \
      >"$STAGE_SQL" 2>/dev/null
    [ -s "$STAGE_SQL" ] || die "the live dump came back empty. Is the Kalakosh stack running?
Pass a backup instead:  --dump ../Kalakosh-ch/backups/backup-<stamp>.tar.gz"
  else
    die "no source catalogue. Pass --dump <backup-*.tar.gz|*.sql>."
  fi

  if scratch_running; then
    info "reusing scratch container '${SCRATCH_NAME}'"
  else
    "$DOCKER_BIN" rm -f "$SCRATCH_NAME" >/dev/null 2>&1
    "$DOCKER_BIN" run -d --name "$SCRATCH_NAME" --network "$NETWORK" \
      -e MYSQL_ROOT_PASSWORD="$SCRATCH_PASSWORD" -e MYSQL_DATABASE=kalakosh \
      mysql:8.0 >/dev/null || die "could not start the scratch source container."
    info "waiting for ${SCRATCH_NAME}…"
    for _ in $(seq 1 60); do
      "$DOCKER_BIN" exec "$SCRATCH_NAME" mysqladmin ping -uroot -p"$SCRATCH_PASSWORD" --silent >/dev/null 2>&1 && break
      sleep 2
    done
  fi

  "$DOCKER_BIN" exec -i "$SCRATCH_NAME" mysql -uroot -p"$SCRATCH_PASSWORD" \
    -e "DROP DATABASE IF EXISTS kalakosh; CREATE DATABASE kalakosh;" >/dev/null 2>&1
  "$DOCKER_BIN" exec -i "$SCRATCH_NAME" mysql -uroot -p"$SCRATCH_PASSWORD" kalakosh \
    <"$STAGE_SQL" >/dev/null 2>&1 || die "loading the dump into ${SCRATCH_NAME} failed."
  ok "dump loaded"
fi

if scratch_running; then
  SRC_TOTAL="$(scratch_mysql "SELECT COUNT(*) FROM products;")"
  SRC_PHOTOS="$(scratch_mysql "SELECT COUNT(*) FROM products WHERE imageUrl IS NOT NULL OR imageKey IS NOT NULL;")"
  SRC_HIDDEN="$(scratch_mysql "SELECT COUNT(*) FROM products WHERE visible=0;")"
  SRC_GALLERY="$(scratch_mysql "SELECT COUNT(*) FROM product_images;")"
  SRC_SAMPLE="$(scratch_mysql "SELECT imageUrl FROM products WHERE imageUrl IS NOT NULL LIMIT 1;")"
  ok "${SRC_TOTAL:-0} products (${SRC_HIDDEN:-0} hidden, ${SRC_PHOTOS:-0} photographed, ${SRC_GALLERY:-0} gallery images)"
fi
SRC_TOTAL="${SRC_TOTAL:-0}"
SRC_PHOTOS="${SRC_PHOTOS:-0}"
SRC_SAMPLE="${SRC_SAMPLE:-}"

# ── 5. Plan cap ───────────────────────────────────────────────────────────────
step "5/8  Plan capacity"
DEST_TOTAL="$(compose_mysql "SELECT COUNT(*) FROM products WHERE tenant_id=${TENANT_ID};")"
DEST_PHOTOS="$(compose_mysql "SELECT COUNT(*) FROM products WHERE tenant_id=${TENANT_ID} AND imageUrl IS NOT NULL;")"
DEST_TOTAL="${DEST_TOTAL:-0}"
DEST_PHOTOS="${DEST_PHOTOS:-0}"
case "$TENANT_PLAN" in
  pro) PLAN_CAP=5000 ;;
  *) PLAN_CAP=200 ;;
esac
if [ "$SRC_TOTAL" -gt "$PLAN_CAP" ]; then
  die "the source holds ${SRC_TOTAL} products; the ${TENANT_PLAN} plan caps the catalogue at ${PLAN_CAP}.
Move the tenant to Pro (platform console → set plan) before migrating — the
importer refuses up front rather than migrating half a catalogue."
fi
ok "${SRC_TOTAL} of ${PLAN_CAP} on the ${TENANT_PLAN} plan"

# ── 6. Storage configuration ──────────────────────────────────────────────────
step "6/8  Storage configuration"
: "${S3_BUCKET:=}" "${S3_REGION:=}" "${S3_ENDPOINT:=}" "${S3_ACCESS_KEY_ID:=}" "${S3_SECRET_ACCESS_KEY:=}"
if is_placeholder "$S3_ACCESS_KEY_ID" || is_placeholder "$S3_ENDPOINT" || is_placeholder "$S3_BUCKET"; then
  die "S3 is not configured in ${ENV_FILE} — it still holds .env.example placeholders.
  S3_ENDPOINT=${S3_ENDPOINT:-<unset>}
  S3_BUCKET=${S3_BUCKET:-<unset>}

Every image upload on this deployment fails until that is filled in, including
the admin's and the signup logo — not just this migration. Products would still
import, and the run would still report zero failures, but every photo would be
dropped. Fill in the S3_* block, then re-run."
fi
ok "bucket ${S3_BUCKET} at ${S3_ENDPOINT}"

# ── 7. Storage round-trip ─────────────────────────────────────────────────────
step "7/8  Storage round-trip"
if ! "$DOCKER_BIN" image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
  if [ "$DIAGNOSE_ONLY" -eq 1 ]; then
    warn "image '${IMAGE_TAG}' not built — skipping the live storage probe."
  else
    info "building ${IMAGE_TAG} (the production image carries no scripts/ or tsx)"
    "$DOCKER_BIN" build --target builder -t "$IMAGE_TAG" . >/dev/null ||
      die "could not build ${IMAGE_TAG}."
  fi
fi

if "$DOCKER_BIN" image inspect "$IMAGE_TAG" >/dev/null 2>&1; then
  PROBE_OUT="$("$DOCKER_BIN" run --rm --network "$NETWORK" \
    -e S3_BUCKET -e S3_REGION -e S3_ENDPOINT -e S3_ACCESS_KEY_ID -e S3_SECRET_ACCESS_KEY \
    "$IMAGE_TAG" node -e '
import("@aws-sdk/client-s3").then(async ({S3Client, PutObjectCommand, DeleteObjectCommand}) => {
  const c = new S3Client({region: process.env.S3_REGION,
    ...(process.env.S3_ENDPOINT ? {endpoint: process.env.S3_ENDPOINT, forcePathStyle: true} : {}),
    credentials: {accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY}});
  const Key = "_migration-probe.txt";
  try {
    await c.send(new PutObjectCommand({Bucket: process.env.S3_BUCKET, Key, Body: "ok"}));
    await c.send(new DeleteObjectCommand({Bucket: process.env.S3_BUCKET, Key}));
    console.log("PROBE_OK");
  } catch (e) { console.log("PROBE_FAIL " + e.name + ": " + e.message); }
})' 2>&1 | tail -1)"
  case "$PROBE_OUT" in
    *PROBE_OK*) ok "wrote and deleted a probe object" ;;
    *) die "S3 rejected a write with the deployment's own credentials:
  ${PROBE_OUT}

This is the failure that produced 158 photoless products before. Fix the S3_*
credentials in ${ENV_FILE} first — the catalogue import would otherwise succeed
while every photo silently fails." ;;
  esac
fi

# ── 8. Source photos ──────────────────────────────────────────────────────────
step "8/8  Source photos"
if [ -z "$SRC_SAMPLE" ]; then
  info "no photographed products in the source — nothing to reach."
elif [ "${SRC_SAMPLE#/}" != "$SRC_SAMPLE" ]; then
  # Relative /uploads/<key>: only the old web app can serve these.
  if [ -n "${KALAKOSH_S3_BUCKET:-}" ]; then
    ok "relative image URLs, but KALAKOSH_S3_* is set — photos come from the bucket"
  else
    warn "the source's image URLs are relative (${SRC_SAMPLE})."
    warn "  Only kalakosh.ch can serve those. If it is down, export KALAKOSH_S3_*"
    warn "  (see .env.example) so photos are read from the old bucket by key."
  fi
else
  SAMPLE_STATUS="$("$DOCKER_BIN" run --rm --network "$NETWORK" "$IMAGE_TAG" \
    node -e "fetch(process.argv[1]).then(r => console.log(r.status)).catch(e => console.log('ERR ' + e.message))" \
    "$SRC_SAMPLE" 2>&1 | tail -1)"
  case "$SAMPLE_STATUS" in
    200) ok "source photos are reachable (${SRC_SAMPLE%%\?*})" ;;
    *) warn "a sample source photo returned '${SAMPLE_STATUS}'."
       warn "  Products will still import; their photos will not."
       warn "  Export KALAKOSH_S3_* to read them from the old bucket instead." ;;
  esac
fi

# ── Decision ──────────────────────────────────────────────────────────────────
DEST_ORDERS="$(compose_mysql "SELECT
  (SELECT COUNT(*) FROM orders WHERE tenant_id=${TENANT_ID})
+ (SELECT COUNT(*) FROM pos_orders WHERE tenant_id=${TENANT_ID});")"
DEST_ORDERS="${DEST_ORDERS:-0}"

ACTION="$(decide_action "$DEST_TOTAL" "$SRC_TOTAL" "$DEST_PHOTOS" "$SRC_PHOTOS" "$DEST_ORDERS")"

step "Diagnosis"
echo "  source:       ${SRC_TOTAL} products, ${SRC_PHOTOS} photographed"
echo "  destination:  ${DEST_TOTAL} products, ${DEST_PHOTOS} with a photo, ${DEST_ORDERS} order(s)"
echo "  action:       ${ACTION}"

case "$ACTION" in
  nothing) ok "the destination already holds the source catalogue. Nothing to do." ;;
  empty-source) die "the source catalogue is empty — refusing to 'migrate' nothing." ;;
  blocked-orders)
    die "the destination has ${DEST_TOTAL} products missing photos, but the tenant has
${DEST_ORDERS} order(s). Replacing products an order references would corrupt that
history, so this script will not do it. Add the missing photos through admin →
Catalogue instead." ;;
  reimport)
    echo ""
    echo "  ${DEST_TOTAL} products are already imported but only ${DEST_PHOTOS} of ${SRC_PHOTOS} have a photo."
    echo "  Re-running alone will not fix that: the importer matches by name and skips."
    echo "  The repair is to delete this tenant's products and import again."
    ;;
esac

if [ "$DIAGNOSE_ONLY" -eq 1 ]; then
  step "Diagnose only — stopping here"
  [ "$ACTION" = "nothing" ] && exit 0
  echo "  Re-run without --diagnose to ${ACTION}."
  exit 0
fi
[ "$ACTION" = "nothing" ] && exit 0

if [ "$ACTION" = "reimport" ]; then
  if [ "$REIMPORT" -eq 0 ]; then
    die "pass --reimport to permit replacing the existing import (it deletes
${DEST_TOTAL} products from tenant ${TENANT_ID}; that tenant has no orders)."
  fi
  if [ "$ASSUME_YES" -eq 0 ]; then
    read -rp "  Delete ${DEST_TOTAL} products from tenant ${TENANT_ID} and re-import? [y/N] " reply
    case "$reply" in [yY]*) ;; *) die "aborted — nothing was changed." ;; esac
  fi
  step "Clearing tenant ${TENANT_ID}"
  compose_mysql "DELETE FROM product_images WHERE tenant_id=${TENANT_ID};
                 DELETE FROM products WHERE tenant_id=${TENANT_ID};" >/dev/null
  REMAINING="$(compose_mysql "SELECT COUNT(*) FROM products WHERE tenant_id=${TENANT_ID};")"
  [ "${REMAINING:-1}" -eq 0 ] || die "products remain after the delete — stopping."
  ok "cleared"
fi

# ── Import ────────────────────────────────────────────────────────────────────
SRC_IP="$(scratch_ip)"
[ -n "$SRC_IP" ] || die "could not read ${SCRATCH_NAME}'s address on ${NETWORK}."
# Addressed by IP on purpose: the container has been observed attached to the
# network yet absent from Docker's embedded DNS, which surfaces as EAI_AGAIN
# from mysql2 well after the run has started.
info "source at ${SRC_IP} (by IP — Docker's embedded DNS is not relied on)"

step "Importing"
"$DOCKER_BIN" run --rm --network "$NETWORK" \
  -e DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@db:3306/${MYSQL_DATABASE}" \
  -e KALAKOSH_DATABASE_URL="mysql://root:${SCRATCH_PASSWORD}@${SRC_IP}:3306/kalakosh" \
  -e S3_BUCKET -e S3_REGION -e S3_ENDPOINT -e S3_PUBLIC_URL \
  -e S3_ACCESS_KEY_ID -e S3_SECRET_ACCESS_KEY \
  -e KALAKOSH_S3_BUCKET -e KALAKOSH_S3_REGION -e KALAKOSH_S3_ENDPOINT \
  -e KALAKOSH_S3_ACCESS_KEY_ID -e KALAKOSH_S3_SECRET_ACCESS_KEY \
  "$IMAGE_TAG" pnpm tsx scripts/import-kalakosh-live-catalog.ts \
  --tenant="$TENANT_SLUG" 2>&1 | tee "$LOG_FILE"

# ── Verify ────────────────────────────────────────────────────────────────────
step "Verifying"
FINAL_TOTAL="$(compose_mysql "SELECT COUNT(*) FROM products WHERE tenant_id=${TENANT_ID};")"
FINAL_PHOTOS="$(compose_mysql "SELECT COUNT(*) FROM products WHERE tenant_id=${TENANT_ID} AND imageUrl IS NOT NULL;")"
FINAL_GALLERY="$(compose_mysql "SELECT COUNT(*) FROM product_images WHERE tenant_id=${TENANT_ID};")"
echo "  products: ${FINAL_TOTAL:-0} of ${SRC_TOTAL}"
echo "  photos:   ${FINAL_PHOTOS:-0} of ${SRC_PHOTOS}"
echo "  gallery:  ${FINAL_GALLERY:-0}"

STATUS=0
if [ "${FINAL_TOTAL:-0}" -lt "$SRC_TOTAL" ]; then
  warn "fewer products than the source — see ${LOG_FILE}"
  STATUS=2
fi
if [ "${FINAL_PHOTOS:-0}" -lt "$SRC_PHOTOS" ]; then
  warn "fewer photos than the source — grep '${LOG_FILE}' for 'Could not re-host'"
  STATUS=2
fi
if grep -q "No insertId" "$LOG_FILE" 2>/dev/null; then
  warn "the insert returned no id for some products, so their gallery images were"
  warn "  skipped. That is a bug in server/importKalakosh.ts, not a data problem."
  STATUS=2
fi
[ "$STATUS" -eq 0 ] && ok "the destination matches the source"

# ── Cleanup ───────────────────────────────────────────────────────────────────
if [ "$KEEP_SCRATCH" -eq 0 ]; then
  "$DOCKER_BIN" rm -f "$SCRATCH_NAME" >/dev/null 2>&1 && info "removed ${SCRATCH_NAME}"
else
  info "kept ${SCRATCH_NAME} (--keep-scratch)"
fi

# ── Optional key rotation ─────────────────────────────────────────────────────
if [ "$ROTATE_KEYS" -eq 1 ]; then
  if [ "$STATUS" -ne 0 ]; then
    warn "skipping key rotation — the migration did not fully succeed."
    warn "  Rotating now would change the credentials you need to debug with."
  else
    step "Rotating the S3 key"
    bash "${SCRIPT_DIR}/rotate-secrets.sh" s3-key --env "$ENV_FILE" --restart ||
      warn "rotation failed — the migration is unaffected; see above."
  fi
fi

step "Done"
echo "  log: ${LOG_FILE}"
if [ "${FINAL_PHOTOS:-0}" -lt "${FINAL_TOTAL:-0}" ]; then
  echo ""
  echo "  $((FINAL_TOTAL - FINAL_PHOTOS)) product(s) have no photo. They are in the admin"
  echo "  catalogue and the POS, but the storefront only lists products with an"
  echo "  image — so the shop will look emptier than the inventory is."
fi
exit "$STATUS"
