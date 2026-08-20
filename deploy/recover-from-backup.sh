#!/bin/bash
# Restores the database from a backup produced by deploy/backup.sh.
# The backup.sql inside the archive uses DROP TABLE IF EXISTS, so this
# safely overwrites any existing data in the target database.
#
# Usage (run from project root):
#   ./deploy/recover-from-backup.sh --list
#       List all backups stored in S3.
#
#   ./deploy/recover-from-backup.sh s3://<bucket>/backups/<name>.tar.gz
#       Download from S3 and restore.
#
#   ./deploy/recover-from-backup.sh backups/<name>.tar.gz
#       Restore from a local archive.
#
#   ./deploy/recover-from-backup.sh backups/<name>/
#       Restore from an already-extracted local directory.

set -euo pipefail

BACKUP_ARG="${1:-}"

if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run from the project root." >&2
  exit 1
fi
# Parse .env literally via the shared loader. The old `export $(grep ... | xargs)`
# word-split every value: RESEND_FROM_EMAIL=Gwinn <orders@gwinn.ch> became two
# arguments, `export` rejected the second as an invalid identifier, and `set -e`
# aborted — so the recovery path was unusable on exactly the servers that needed
# it. See deploy/lib/env.sh.
# shellcheck source=lib/env.sh
. "$(dirname "$0")/lib/env.sh"
load_dotenv .env || {
  echo "ERROR: could not read .env" >&2
  exit 1
}

# ── Shared S3 helper ─────────────────────────────────────────────────────────
# Runs aws-cli in a throwaway container using the S3 credentials from .env.
s3_aws() {
  local ENDPOINT_ARGS=()
  if [ -n "${S3_ENDPOINT:-}" ]; then
    ENDPOINT_ARGS=(--endpoint-url "${S3_ENDPOINT}")
  fi
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-}" \
    -e AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-}" \
    -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
    "${S3_VOLUME_MOUNT[@]+"${S3_VOLUME_MOUNT[@]}"}" \
    amazon/aws-cli "$@" "${ENDPOINT_ARGS[@]}"
}

require_s3_creds() {
  if [ -z "${S3_ACCESS_KEY_ID:-}" ] || [ -z "${S3_SECRET_ACCESS_KEY:-}" ] || [ -z "${S3_BUCKET:-}" ]; then
    echo "ERROR: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET must be set in .env" >&2
    exit 1
  fi
}

# ── --list: show all backups in S3 ───────────────────────────────────────────
if [ "$BACKUP_ARG" = "--list" ]; then
  require_s3_creds
  echo "Available S3 backups (s3://${S3_BUCKET}/backups/):"
  echo ""
  S3_VOLUME_MOUNT=()
  s3_aws s3 ls "s3://${S3_BUCKET}/backups/" 2>/dev/null \
    | grep '\.tar\.gz$' \
    | awk '{printf "  %s %s  %s MiB  %s\n", $1, $2, int($3/1024/1024+0.5), $4}' \
    || echo "  (no backups found)"
  echo ""
  echo "Restore with:"
  echo "  ./deploy/recover-from-backup.sh s3://${S3_BUCKET}/backups/<name>.tar.gz"
  exit 0
fi

if [ -z "$BACKUP_ARG" ]; then
  echo "Usage:"
  echo "  ./deploy/recover-from-backup.sh --list"
  echo "  ./deploy/recover-from-backup.sh s3://<bucket>/backups/<name>.tar.gz"
  echo "  ./deploy/recover-from-backup.sh backups/<name>.tar.gz"
  echo "  ./deploy/recover-from-backup.sh backups/<name>/"
  echo ""
  echo "Local backups:"
  ls -lh backups/*.tar.gz 2>/dev/null || echo "  (none found in ./backups/)"
  exit 1
fi

# ── Locate / download backup ──────────────────────────────────────────────────
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

WORK_DIR=""

if [[ "$BACKUP_ARG" == s3://* ]]; then
  # Download from S3
  require_s3_creds
  S3_URI="$BACKUP_ARG"
  echo "==> Downloading from S3: ${S3_URI}"
  S3_VOLUME_MOUNT=(-v "${TEMP_DIR}:/downloads")
  s3_aws s3 cp "$S3_URI" /downloads/backup.tar.gz 2>/dev/null
  echo "    Extracting..."
  tar -xzf "${TEMP_DIR}/backup.tar.gz" -C "$TEMP_DIR"
  WORK_DIR=$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)

elif [[ "$BACKUP_ARG" == *.tar.gz ]]; then
  # Local archive
  if [ ! -f "$BACKUP_ARG" ]; then
    echo "ERROR: File not found: ${BACKUP_ARG}" >&2
    exit 1
  fi
  echo "==> Extracting ${BACKUP_ARG}..."
  tar -xzf "$BACKUP_ARG" -C "$TEMP_DIR"
  WORK_DIR=$(find "$TEMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)

elif [ -d "$BACKUP_ARG" ]; then
  # Already-extracted directory
  WORK_DIR="$BACKUP_ARG"

else
  echo "ERROR: '${BACKUP_ARG}' is not a recognised backup path." >&2
  echo "       Use --list to see available S3 backups." >&2
  exit 1
fi

if [ ! -f "${WORK_DIR}/backup.sql" ]; then
  echo "ERROR: backup.sql not found inside backup. Is this a valid backup?" >&2
  exit 1
fi

# ── Show backup metadata ──────────────────────────────────────────────────────
if [ -f "${WORK_DIR}/backup-info.txt" ]; then
  echo ""
  cat "${WORK_DIR}/backup-info.txt"
  echo ""
fi

# ── Confirm ───────────────────────────────────────────────────────────────────
echo "WARNING: This will OVERWRITE all data in database '${MYSQL_DATABASE}' on host 'db'."
echo "         The app will be automatically restarted afterwards."
echo ""
read -rp "Type 'yes' to continue, anything else to abort: " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Aborted. No changes were made."
  exit 0
fi

# ── Restore ───────────────────────────────────────────────────────────────────
echo "==> Restoring database..."
docker compose exec -T db mysql \
  -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
  "$MYSQL_DATABASE" 2>/dev/null < "${WORK_DIR}/backup.sql"
echo "    SQL restore complete."

# ── Restart app so connection pool picks up fresh schema ─────────────────────
echo "==> Restarting app container..."
docker compose restart app
echo "    Done."

echo ""
echo "==> Recovery complete. Run 'docker compose logs -f app' to verify startup."
