#!/bin/bash
# deploy/lib/caddy.sh — Caddy config reload helper for update.sh.
#
# The Caddyfile reaches the container as a bind mount, so editing it changes
# nothing docker-compose can see: `docker compose up -d` compares the *service
# definition*, which is byte-identical, and leaves the running container alone.
# Caddy itself reads that file exactly once, at startup. The result is a silent
# no-op — a deploy reports success while Caddy keeps serving whatever config it
# booted with, possibly days earlier.
#
# That is not hypothetical: www.<domain> sat without a certificate through
# several deploys because the Caddyfile block that would have provisioned it
# had never been loaded. Every request to it failed the TLS handshake, so
# crawlers reported the whole site as unreachable.
#
# Only the standalone profile runs a bundled Caddy. In the shared-server setup
# another stack's Caddy owns 80/443 and this service isn't running at all, so
# the reload has to skip quietly rather than fail the deploy.
#
# Kept in its own file so deploy/lib/caddy.test.sh can exercise it with a stub
# `docker` on PATH, without running the rest of update.sh.

CADDYFILE_CONTAINER_PATH="${CADDYFILE_CONTAINER_PATH:-/etc/caddy/Caddyfile}"

# reload_caddy
# Reloads the bundled Caddy's configuration through its admin API — graceful,
# so in-flight connections are not dropped. Any output from a failed reload is
# printed to stdout for the caller to surface.
#
# Exit status:
#   0  reloaded successfully
#   1  reload failed — Caddy is still serving its previous configuration
#   2  no bundled Caddy running; nothing to do (shared-server setup)
reload_caddy() {
  local container_id output

  # `docker compose ps -q caddy` prints nothing when the service is defined but
  # not started, which is exactly the shared-server case (the caddy service sits
  # behind the "standalone" profile).
  container_id=$(docker compose ps -q caddy 2>/dev/null || true)
  [ -n "$container_id" ] || return 2

  # `caddy reload` validates the new config first and refuses to apply a broken
  # one, so a syntax error leaves the previous config running rather than taking
  # the site down. It still exits non-zero, which is what we report.
  if output=$(docker compose exec -T caddy \
    caddy reload --config "$CADDYFILE_CONTAINER_PATH" 2>&1); then
    return 0
  fi

  printf '%s\n' "$output"
  return 1
}
