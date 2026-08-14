#!/bin/bash
# deploy/admin.sh — open the interactive Zolto administration shell.
#
# WHAT THIS IS
# Every administrative operation Zolto has, at a prompt, arranged in tiers:
# stores, plans and comps, people and access, catalogue and stock, orders and
# reconciliation, store setup, and the platform-wide operations. It asks what
# you want to do, you pick a number, and it asks the next question.
#
#   Usage:
#     bash deploy/admin.sh                      # interactive, read-write
#     bash deploy/admin.sh --read-only          # refuse every option that writes
#     bash deploy/admin.sh --store kalakosh     # start pointed at one store
#     bash deploy/admin.sh --as you@zolto.ch    # act as a specific owner
#
# HOW IT REACHES THE APP
# It runs INSIDE the app container (`docker compose exec app`), because that is
# where DATABASE_URL, the Stripe keys and the tenant-secrets master key already
# are — no credential is copied anywhere to make this work. The shell calls the
# same tRPC procedures the web console calls, as a real superadmin account, so
# every authorization check still runs and every operator action still writes
# its [operator-audit] line naming who did it.
#
# WHO IT ACTS AS
# A platform owner (role='superadmin'). If nobody has that role the shell says
# so and stops — grant it with:
#
#     bash deploy/tenant-admin.sh --superadmin <email>
#
# Not to be confused with deploy/tenant-admin.sh, which talks to MySQL directly
# and exists precisely for the case where the application cannot help you (no
# superadmin yet, or a store with no admin at all).
#
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

if ! docker compose ps --status running app >/dev/null 2>&1; then
  echo "ERROR: cannot talk to docker compose from $(pwd)." >&2
  echo "Run this from the repo root on the server." >&2
  exit 1
fi

if [ -z "$(docker compose ps -q app 2>/dev/null)" ]; then
  echo "ERROR: the 'app' container is not running. Start it with:" >&2
  echo "    docker compose up -d app" >&2
  exit 1
fi

# -it, so the shell gets a terminal to prompt on. Without it every question
# would be answered by an immediately-closed stdin and the session would exit
# before printing its first menu.
exec docker compose exec -it app node dist/admin.js "$@"
