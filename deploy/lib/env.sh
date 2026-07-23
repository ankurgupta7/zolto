#!/bin/bash
# deploy/lib/env.sh — .env loader shared by update.sh.
#
# Sourced (not executed) by update.sh to pull the deployment's environment
# variables into the shell before build_mysql_cmd() and the migrations run.
# Kept in its own file so load_env can be exercised directly by
# deploy/lib/env.test.sh without running the rest of update.sh.
#
# Why not just `source .env`? Because `source` *executes* every line, so any
# value containing shell metacharacters breaks the whole deploy. The real
# .env carries, for example:
#
#     RESEND_FROM_EMAIL=Kalakosh <orders@kalakosh.ch>
#
# `source`-ing that makes bash read `<` / `>` as redirections, and the trailing
# `>` before the newline fails with the notorious
#
#     syntax error near unexpected token `newline'
#
# aborting the update before it even pulls code. docker-compose reads these
# same values literally via --env-file, so the shell must too. load_env parses
# each line as KEY=VALUE and exports the value verbatim — never executing it.

# load_env <file> — parse a .env-style file and export its KEY=VALUE pairs.
#
# Parsing rules, chosen to match docker-compose's env_file handling closely so
# the shell and the containers agree on every value:
#   - Leading/trailing whitespace around the whole line is ignored.
#   - Blank lines, and lines whose first non-space character is `#`, are skipped.
#   - A trailing carriage return (CRLF-edited files) is stripped.
#   - Each remaining line must be KEY=VALUE; lines without `=` are skipped.
#   - An optional `export ` prefix on the key is allowed and dropped.
#   - The key must be a valid shell identifier, else the line is skipped.
#   - VALUE is taken literally, except a single pair of matching surrounding
#     quotes (either "…" or '…') is stripped. Metacharacters inside VALUE
#     (<, >, (), &, ;, spaces, …) are preserved, never interpreted.
# Missing files are a no-op (return 0), mirroring "nothing to load".
load_env() {
  local file="$1" line key value
  [ -f "$file" ] || return 0

  while IFS= read -r line || [ -n "$line" ]; do
    # Strip a trailing CR so CRLF-edited files don't smuggle \r into values.
    line="${line%$'\r'}"
    # Trim leading whitespace.
    line="${line#"${line%%[![:space:]]*}"}"
    # Skip blanks and full-line comments.
    [ -z "$line" ] && continue
    [ "${line#\#}" != "$line" ] && continue
    # Require KEY=VALUE.
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac

    key="${line%%=*}"
    value="${line#*=}"

    # Trim whitespace around the key and drop an optional `export ` prefix.
    key="${key#"${key%%[![:space:]]*}"}"
    key="${key%"${key##*[![:space:]]}"}"
    case "$key" in
      export[[:space:]]*)
        key="${key#export}"
        key="${key#"${key%%[![:space:]]*}"}"
        ;;
    esac

    # Only accept valid shell identifiers.
    case "$key" in
      '' | [!A-Za-z_]* | *[!A-Za-z0-9_]*) continue ;;
    esac

    # Strip one pair of matching surrounding quotes from the value.
    if [ "${#value}" -ge 2 ]; then
      case "$value" in
        \"*\") value="${value#\"}"; value="${value%\"}" ;;
        \'*\') value="${value#\'}"; value="${value%\'}" ;;
      esac
    fi

    export "$key=$value"
  done < "$file"
}
