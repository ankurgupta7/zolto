#!/bin/bash
# deploy/lib/build.sh — decide whether the app image actually has to be rebuilt.
#
# Sourced (not executed) by update.sh, after the ok()/warn()/die() logging
# helpers are defined. Kept in its own file so deploy/lib/build.test.sh can
# exercise it against a throwaway git repo and a fake `docker`, without a
# daemon or a real build.
#
# WHY THIS EXISTS
#
# update.sh used to run `docker compose build --no-cache app` unconditionally
# and then `docker builder prune -a -f`, so every deploy paid for a cold build
# — base image, `pnpm install` for the full dependency tree twice (builder and
# runner stages), a Vite + esbuild compile — even when the pull brought nothing
# but a README change. The prune guaranteed it: it deleted the layer cache the
# next build would have reused.
#
# The fix is to make "did the image's inputs change?" a question we can answer
# cheaply. We hash the build context (everything .dockerignore does NOT exclude)
# into a fingerprint, bake it into the image as a label at build time, and read
# that label back off the image the app container is currently running. Equal
# fingerprint means the running image was built from exactly this source, and
# the build can be skipped outright.
#
# The fingerprint deliberately covers content, not commits: a dirty worktree or
# an edited .env changes it, so a hand-patched server still rebuilds.

IMAGE_FINGERPRINT_LABEL="ch.zolto.source-fingerprint"

# Files that reach the build context without being tracked by git, and that the
# build genuinely reads. .env is the one that matters: vite.config.ts sets
# envDir to the project root, so VITE_* values are compiled into the frontend
# bundle. It is gitignored, so nothing else here would notice it changing.
IMAGE_EXTRA_CONTEXT_FILES=(".env")

# Paths whose contents can never affect the app image, because .dockerignore
# keeps them out of the build context entirely.
#
# MUST stay in sync with .dockerignore — that is what makes skipping a build
# sound rather than a guess. deploy/lib/build.test.sh fails if the two drift.
# Patterns are git pathspecs: a bare name matches that path and everything
# under it, and `*` matches across `/`, so `*.md` covers docs/foo/bar.md too.
image_context_excludes() {
  printf '%s\n' \
    ".git" \
    ".github" \
    "node_modules" \
    "dist" \
    "coverage" \
    "out" \
    "android" \
    "ios" \
    "deploy" \
    "docs" \
    "e2e" \
    "backups" \
    "references" \
    "tools" \
    "Caddyfile" \
    "docker-compose.yml" \
    "codemagic.yaml" \
    "update.sh" \
    "*.md" \
    "*.test.ts" \
    "*.test.tsx"
}

# sha256 of stdin, printing the bare hex digest.
_fingerprint_hash() {
  if command -v sha256sum &>/dev/null; then
    sha256sum
  else
    shasum -a 256
  fi | awk '{print $1}'
}

# Hash of everything that can end up in the app image.
#
# Prints the digest and returns 0; returns 1 (printing nothing) when the
# fingerprint cannot be computed — outside a git checkout, say — which callers
# must treat as "rebuild", never as "unchanged".
source_fingerprint() {
  git rev-parse --is-inside-work-tree &>/dev/null || return 1

  local -a specs=(".")
  local path
  while IFS= read -r path; do
    specs+=(":(exclude)${path}")
  done < <(image_context_excludes)

  {
    # Tracked files: mode + blob hash + path, straight out of the index.
    git ls-files -s -- "${specs[@]}"

    # Uncommitted edits to tracked files — the context is the worktree, not HEAD.
    git diff -- "${specs[@]}"

    # Untracked-but-not-ignored files: they are in the context too.
    while IFS= read -r path; do
      printf 'untracked %s %s\n' "$(git hash-object -- "$path" 2>/dev/null || echo unreadable)" "$path"
    done < <(git ls-files -o --exclude-standard -- "${specs[@]}")

    # Gitignored files the build still reads (.env).
    for path in "${IMAGE_EXTRA_CONTEXT_FILES[@]}"; do
      [ -f "$path" ] || continue
      printf 'extra %s %s\n' "$(git hash-object -- "$path" 2>/dev/null || echo unreadable)" "$path"
    done
  } | _fingerprint_hash
}

# Image reference the app container is currently running, or 1 if no app
# container is up. Deliberately only considers RUNNING containers: a stopped or
# missing app is a rebuild, since we have no evidence about what it holds.
running_app_image() {
  local cid
  cid=$(docker compose ps -q app 2>/dev/null | head -1)
  [ -n "$cid" ] || return 1
  docker inspect --format '{{.Image}}' "$cid" 2>/dev/null
}

# Fingerprint label baked into an image, empty if unlabelled.
image_fingerprint() { # image_fingerprint IMAGE_REF
  local value
  value=$(docker image inspect --format "{{index .Config.Labels \"${IMAGE_FINGERPRINT_LABEL}\"}}" "$1" 2>/dev/null) || return 0
  # `docker inspect` prints "<no value>" for a missing label, and the Dockerfile
  # defaults the build arg to "unknown" — neither is a fingerprint.
  case "$value" in
    "<no value>" | "unknown") return 0 ;;
    *) printf '%s' "$value" ;;
  esac
}

# Why the app image has to be rebuilt — prints a human-readable reason and
# returns 0 when a rebuild is needed, prints nothing and returns 1 when the
# running image already matches the source.
#
# Every uncertain case resolves to "rebuild": the failure mode we refuse is
# serving stale code, not spending an extra build.
app_rebuild_reason() { # app_rebuild_reason WANTED_FINGERPRINT
  local wanted="$1"

  if [ -z "$wanted" ]; then
    echo "source fingerprint unavailable (not a git checkout?)"
    return 0
  fi

  local image
  if ! image=$(running_app_image) || [ -z "$image" ]; then
    echo "no app container is running"
    return 0
  fi

  local current
  current=$(image_fingerprint "$image")
  if [ -z "$current" ]; then
    echo "running image carries no source fingerprint (built before this was added)"
    return 0
  fi

  if [ "$current" != "$wanted" ]; then
    echo "source changed since the running image was built (${current:0:12} → ${wanted:0:12})"
    return 0
  fi

  return 1
}
