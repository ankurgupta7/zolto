#!/bin/bash
# Creates a timestamped, compressed database backup containing:
#   backup.sql      — full SQL dump, restorable via recover-from-backup.sh
#   inventory.csv   — products table as CSV for inventory export
#   backup-info.txt — human-readable metadata
#
# Remote destinations (all optional, all non-fatal — configure in .env):
#   Primary S3    — S3_BUCKET / S3_ACCESS_KEY_ID / ...
#   Secondary S3  — BACKUP_S3_BUCKET / BACKUP_S3_ACCESS_KEY_ID / ...
#   GitHub        — BACKUP_GITHUB_REPO / BACKUP_GITHUB_TOKEN
#
# Usage (run from project root):
#   ./deploy/backup.sh [output-dir]
#   BACKUPS_DIR=/mnt/storage ./deploy/backup.sh

set -euo pipefail

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run from the project root." >&2
  exit 1
fi
# Parse .env literally via the shared loader. The old `export $(grep ... | xargs)`
# word-split every value: RESEND_FROM_EMAIL=Zolto <orders@zolto.ch> became two
# arguments, `export` rejected the second as an invalid identifier, and `set -e`
# aborted the backup before it started. See deploy/lib/env.sh.
# shellcheck source=lib/env.sh
. "$(dirname "$0")/lib/env.sh"
load_dotenv .env || {
  echo "ERROR: could not read .env" >&2
  exit 1
}

TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_NAME="backup-${TIMESTAMP}"
BACKUPS_DIR="${1:-${BACKUPS_DIR:-./backups}}"
WORK_DIR="${BACKUPS_DIR}/${BACKUP_NAME}"

MYSQL_CMD="docker compose exec -T db mysql -u ${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE}"
MYSQLDUMP_CMD="docker compose exec -T db mysqldump -u ${MYSQL_USER} -p${MYSQL_PASSWORD}"

mkdir -p "$WORK_DIR"

echo "==> Creating backup: ${BACKUP_NAME}"

# ── SQL dump ─────────────────────────────────────────────────────────────────
# --skip-extended-insert  → one INSERT per row (diffable and human-readable)
# --complete-insert       → each INSERT names every column explicitly
# --add-drop-table        → safe to restore into an existing database
# --single-transaction    → consistent InnoDB snapshot without table locks
# --no-tablespaces        → avoids PROCESS privilege requirement
echo "  Dumping SQL (one INSERT per row)..."
$MYSQLDUMP_CMD \
  --skip-extended-insert \
  --complete-insert \
  --add-drop-table \
  --no-tablespaces \
  --single-transaction \
  --set-charset \
  "$MYSQL_DATABASE" 2>/dev/null > "${WORK_DIR}/backup.sql"

# ── Inventory CSV ─────────────────────────────────────────────────────────────
# Tab-separated rows from mysql --batch are converted to quoted CSV.
# Text fields have embedded newlines/tabs replaced with spaces so the
# resulting CSV is safe to open in any spreadsheet application.
echo "  Exporting inventory CSV..."
{
  printf 'id,name_de,name_en,description_de,description_en,price,category,visible,sold,source,image_url,created_at\n'
  $MYSQL_CMD --batch --raw --skip-column-names 2>/dev/null <<'SQL'
SELECT
  id,
  REPLACE(REPLACE(IFNULL(`name`, ''),         CHAR(10), ' '), CHAR(9), ' '),
  REPLACE(REPLACE(IFNULL(`nameEn`, ''),        CHAR(10), ' '), CHAR(9), ' '),
  REPLACE(REPLACE(`description`,               CHAR(10), ' '), CHAR(9), ' '),
  REPLACE(REPLACE(IFNULL(`descriptionEn`, ''), CHAR(10), ' '), CHAR(9), ' '),
  `price`,
  `category`,
  IF(`visible`, 'yes', 'no'),
  IF(`sold`,    'yes', 'no'),
  `source`,
  IFNULL(`imageUrl`, ''),
  DATE_FORMAT(`createdAt`, '%Y-%m-%d %H:%i:%s')
FROM `products`
ORDER BY `id`;
SQL
} | awk '
  BEGIN { FS = "\t"; OFS = "," }
  NR == 1 { print; next }        # header is already CSV — pass through
  {
    for (i = 1; i <= NF; i++) {
      gsub(/"/, "\"\"", $i)      # escape internal double-quotes (RFC 4180)
      $i = "\"" $i "\""          # wrap every field in double-quotes
    }
    print
  }
' > "${WORK_DIR}/inventory.csv"

# ── Metadata ──────────────────────────────────────────────────────────────────
echo "  Writing metadata..."
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
PRODUCT_COUNT=$($MYSQL_CMD --batch --skip-column-names 2>/dev/null \
  -e "SELECT COUNT(*) FROM \`products\`;" || echo "?")
USER_COUNT=$($MYSQL_CMD --batch --skip-column-names 2>/dev/null \
  -e "SELECT COUNT(*) FROM \`users\`;" || echo "?")
SOLD_COUNT=$($MYSQL_CMD --batch --skip-column-names 2>/dev/null \
  -e "SELECT COUNT(*) FROM \`products\` WHERE sold = 1;" || echo "?")
VISIBLE_COUNT=$($MYSQL_CMD --batch --skip-column-names 2>/dev/null \
  -e "SELECT COUNT(*) FROM \`products\` WHERE visible = 1;" || echo "?")

S3_BACKUP_KEY="backups/${BACKUP_NAME}.tar.gz"

cat > "${WORK_DIR}/backup-info.txt" << EOF
Kalakosh Database Backup
========================
Created:    ${TIMESTAMP}
Database:   ${MYSQL_DATABASE}
Git commit: ${GIT_COMMIT} (${GIT_BRANCH})

Row counts at backup time:
  products total:   ${PRODUCT_COUNT}
    visible:        ${VISIBLE_COUNT}
    sold:           ${SOLD_COUNT}
  users:            ${USER_COUNT}

Files in this archive:
  backup.sql      — Full SQL dump (schema + data). Pipe to mysql to restore.
  inventory.csv   — Products table as UTF-8 CSV. Open in any spreadsheet app.
  backup-info.txt — This file.

Restore from local file:
  ./deploy/recover-from-backup.sh ${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz

Restore from primary S3 (if uploaded):
  ./deploy/recover-from-backup.sh s3://${S3_BUCKET:-<S3_BUCKET>}/${S3_BACKUP_KEY}

Restore from secondary S3 (if uploaded):
  ./deploy/recover-from-backup.sh s3://${BACKUP_S3_BUCKET:-<BACKUP_S3_BUCKET>}/${S3_BACKUP_KEY}

Restore from GitHub (if pushed):
  Download backup.sql from https://github.com/${BACKUP_GITHUB_REPO:-<BACKUP_GITHUB_REPO>}
  then: ./deploy/recover-from-backup.sh <path-to-downloaded-backup.sql>

List all S3 backups:
  ./deploy/recover-from-backup.sh --list
EOF

# ── GitHub push ───────────────────────────────────────────────────────────────
# Pushes backup.sql, inventory.csv, and backup-info.txt to a private repo.
# Each backup becomes a git commit — history gives a full weekly audit trail
# and you can diff any two weeks to see exactly what stock changed.
# Runs BEFORE compression since it needs the uncompressed files.
# Non-fatal: a failure warns but does not abort the rest of the backup.
if [ -n "${BACKUP_GITHUB_REPO:-}" ] && [ -n "${BACKUP_GITHUB_TOKEN:-}" ]; then
  echo "==> Pushing to GitHub (${BACKUP_GITHUB_REPO})..."
  GITHUB_DIR=$(mktemp -d)
  GITHUB_URL="https://${BACKUP_GITHUB_TOKEN}@github.com/${BACKUP_GITHUB_REPO}.git"

  (
    # Clone latest state; fall back to a fresh init for an empty repo
    if git clone --depth 1 --quiet "$GITHUB_URL" "$GITHUB_DIR" 2>/dev/null; then
      : # cloned OK
    else
      git -C "$GITHUB_DIR" init --quiet
      git -C "$GITHUB_DIR" remote add origin "$GITHUB_URL"
    fi

    cp "${WORK_DIR}/backup.sql"      "${GITHUB_DIR}/"
    cp "${WORK_DIR}/inventory.csv"   "${GITHUB_DIR}/"
    cp "${WORK_DIR}/backup-info.txt" "${GITHUB_DIR}/"

    git -C "$GITHUB_DIR" config user.email "backup@kalakosh.local"
    git -C "$GITHUB_DIR" config user.name  "Kalakosh Backup"
    git -C "$GITHUB_DIR" add backup.sql inventory.csv backup-info.txt

    if git -C "$GITHUB_DIR" diff --cached --quiet 2>/dev/null; then
      echo "    GitHub: data unchanged since last backup — no commit needed"
    else
      git -C "$GITHUB_DIR" commit --quiet \
        -m "backup: ${TIMESTAMP} — ${PRODUCT_COUNT} products"
      git -C "$GITHUB_DIR" push --quiet origin HEAD:main
      echo "==> GitHub: pushed to ${BACKUP_GITHUB_REPO}"
    fi
  ) || echo "  WARNING: GitHub push failed — backup still available via S3 and locally"

  rm -rf "$GITHUB_DIR"
else
  echo "    (GitHub backup not configured — set BACKUP_GITHUB_REPO + BACKUP_GITHUB_TOKEN)"
fi

# ── Compress ──────────────────────────────────────────────────────────────────
echo "  Compressing..."
tar -czf "${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz" -C "$BACKUPS_DIR" "$BACKUP_NAME"
rm -rf "$WORK_DIR"

BACKUP_SIZE=$(du -sh "${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)
BACKUP_ABS=$(realpath "${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz")
echo "==> Local backup: ${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz (${BACKUP_SIZE})"

# ── Helper: upload archive to an S3-compatible endpoint ──────────────────────
s3_upload() {
  local LABEL="$1" BUCKET="$2" KEY_ID="$3" SECRET="$4" REGION="$5" ENDPOINT="$6"
  echo "==> Uploading to ${LABEL} (${BUCKET}/${S3_BACKUP_KEY})..."

  local ENDPOINT_ARGS=()
  if [ -n "$ENDPOINT" ]; then
    ENDPOINT_ARGS=(--endpoint-url "$ENDPOINT")
  fi

  docker run --rm \
    -e AWS_ACCESS_KEY_ID="$KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$SECRET" \
    -e AWS_DEFAULT_REGION="${REGION:-us-east-1}" \
    -v "${BACKUP_ABS}:/upload.tar.gz:ro" \
    amazon/aws-cli s3 cp /upload.tar.gz \
    "s3://${BUCKET}/${S3_BACKUP_KEY}" \
    "${ENDPOINT_ARGS[@]}" \
    && echo "==> ${LABEL} upload complete: s3://${BUCKET}/${S3_BACKUP_KEY}" \
    || echo "  WARNING: ${LABEL} upload failed — backup still available at other destinations"
}

# ── Primary S3 upload ─────────────────────────────────────────────────────────
if [ -n "${S3_ACCESS_KEY_ID:-}" ] && [ -n "${S3_SECRET_ACCESS_KEY:-}" ] && [ -n "${S3_BUCKET:-}" ]; then
  s3_upload "primary S3" \
    "$S3_BUCKET" "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" \
    "${S3_REGION:-us-east-1}" "${S3_ENDPOINT:-}"
else
  echo "    (primary S3 not configured)"
fi

# ── Secondary S3 upload ───────────────────────────────────────────────────────
# Point this at a different provider (e.g. Backblaze B2 if primary is R2).
# If one provider goes down, the other still has your backup.
if [ -n "${BACKUP_S3_ACCESS_KEY_ID:-}" ] && [ -n "${BACKUP_S3_SECRET_ACCESS_KEY:-}" ] && [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  s3_upload "secondary S3" \
    "$BACKUP_S3_BUCKET" "$BACKUP_S3_ACCESS_KEY_ID" "$BACKUP_S3_SECRET_ACCESS_KEY" \
    "${BACKUP_S3_REGION:-us-east-1}" "${BACKUP_S3_ENDPOINT:-}"
else
  echo "    (secondary S3 not configured — set BACKUP_S3_BUCKET + BACKUP_S3_ACCESS_KEY_ID + BACKUP_S3_SECRET_ACCESS_KEY)"
fi

echo ""
echo "==> Backup destinations:"
echo "    Local:  ${BACKUPS_DIR}/${BACKUP_NAME}.tar.gz"
[ -n "${S3_BUCKET:-}"        ] && echo "    S3 #1:  s3://${S3_BUCKET}/${S3_BACKUP_KEY}"
[ -n "${BACKUP_S3_BUCKET:-}" ] && echo "    S3 #2:  s3://${BACKUP_S3_BUCKET}/${S3_BACKUP_KEY}"
[ -n "${BACKUP_GITHUB_REPO:-}" ] && echo "    GitHub: https://github.com/${BACKUP_GITHUB_REPO}"
echo ""
echo "    Restore: ./deploy/recover-from-backup.sh --list"
