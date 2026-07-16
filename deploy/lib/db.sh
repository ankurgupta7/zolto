#!/bin/bash
# deploy/lib/db.sh — MySQL migration helpers shared by update.sh.
#
# Sourced (not executed) by update.sh, after $MYSQL_USER / $MYSQL_PASSWORD /
# $MYSQL_DATABASE are loaded from .env and the ok()/die() logging helpers are
# defined — this file relies on both being present in the calling shell.
# Kept in its own file so it can be sourced and exercised directly by
# deploy/lib/db.test.sh without running the rest of update.sh (git pull,
# docker builds, cron install, ...).

# A migration statement blocked on a lock (e.g. held by another connection,
# or an orphaned query from a previously interrupted run) used to hang
# forever with no feedback, since neither the connection nor the statement
# had any timeout. Bound both, so a stuck migration fails fast with a clear
# error instead of hanging the whole deploy indefinitely.
MYSQL_LOCK_TIMEOUT_SQL="SET SESSION lock_wait_timeout=15, innodb_lock_wait_timeout=15; "

# Builds the docker-compose-exec-mysql command line. Callers assign the
# result to $MYSQL, e.g.:  MYSQL="$(build_mysql_cmd)"
build_mysql_cmd() {
  echo "docker compose exec -T db mysql --connect-timeout=10 -u${MYSQL_USER} -p${MYSQL_PASSWORD} ${MYSQL_DATABASE}"
}

# Helper: run a SQL block and print a named result. On failure, surfaces the
# actual MySQL error — previously discarded (2>/dev/null), which made a bare
# "Migration failed: <label>" impossible to debug.
run_sql() {
  local label="$1"; shift
  local output
  if output=$($MYSQL -e "${MYSQL_LOCK_TIMEOUT_SQL}$*" 2>&1); then
    ok "$label"
  else
    die "Migration failed: ${label}
${output}"
  fi
}

# Helper: check whether a column exists (prints 1 or 0)
col_exists() { # col_exists TABLE COLUMN
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1' AND COLUMN_NAME='$2';" 2>/dev/null || echo 0
}

# Helper: check whether a table exists (prints 1 or 0)
tbl_exists() {
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1';" 2>/dev/null || echo 0
}

# Helper: check whether a unique constraint exists on a column (prints 1 or 0)
idx_exists() { # idx_exists TABLE INDEX_NAME
  $MYSQL -se "${MYSQL_LOCK_TIMEOUT_SQL}SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA='${MYSQL_DATABASE}' AND TABLE_NAME='$1'
    AND CONSTRAINT_NAME='$2';" 2>/dev/null || echo 0
}
