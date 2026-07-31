#!/usr/bin/env bash
# Decide whether this CircleCI job should do the work, or defer to a GitHub
# Actions workflow that already covers the same ground.
#
#   usage: defer-to-github.sh <workflow-file.yml> [path-prefix ...]
#
# Exit 0 + `circleci-agent step halt`  → GitHub handled it, end this job green.
# Exit 0 (no halt)                     → do the work here.
# Exit 1                               → GitHub ran it and it FAILED.
#
# WHY THIS EXISTS
# ---------------
# GitHub Actions minutes are free on public repos but metered on private ones,
# and when the allowance runs out GitHub does not fail the workflow — it never
# schedules it at all. There is no event, no red X, nothing to hook. So the
# only signal available is *absence*: no workflow run for this commit after a
# bounded wait. That is a heuristic, not a guarantee, which is why every
# ambiguous case below resolves to "run it here" — duplicated work is cheap,
# a silently untested merge is not.
#
# Set FORCE_CIRCLECI_FULL=1 in the CircleCI project to bypass all of this and
# always run everything here (useful the moment you know billing has lapsed,
# rather than waiting for the poll to notice).

set -euo pipefail

WORKFLOW_FILE="${1:?usage: defer-to-github.sh <workflow-file.yml> [path-prefix ...]}"
shift
PATH_PREFIXES=("$@")

WAIT_SECONDS="${GH_WAIT_SECONDS:-180}"
POLL_INTERVAL=10

run_here() {
  echo "▶ Running this suite on CircleCI: $1"
  exit 0
}

defer() {
  echo "⏭ Skipping — $1"
  circleci-agent step halt
  exit 0
}

# ── 0. Explicit override ─────────────────────────────────────────────────────
if [ -n "${FORCE_CIRCLECI_FULL:-}" ]; then
  run_here "FORCE_CIRCLECI_FULL is set."
fi

# ── 1. Did the paths this workflow cares about actually change? ──────────────
# Mirrors the GH workflow's own `paths:` filter. Without this, "GitHub produced
# no run" would be indistinguishable from "GitHub correctly skipped an
# irrelevant commit", and CircleCI would rebuild Android on every unrelated
# push — spending more than the setup saves.
if [ ${#PATH_PREFIXES[@]} -gt 0 ]; then
  BASE=""
  if git rev-parse --verify -q "origin/main" >/dev/null 2>&1; then
    BASE="$(git merge-base origin/main HEAD 2>/dev/null || true)"
  fi
  # On a push to main the merge-base is HEAD itself, so fall back to the
  # previous commit to get this push's diff.
  if [ -z "$BASE" ] || [ "$BASE" = "$(git rev-parse HEAD)" ]; then
    BASE="$(git rev-parse -q --verify HEAD~1 2>/dev/null || true)"
  fi

  if [ -z "$BASE" ]; then
    # Shallow clone or a root commit — cannot tell what changed. Fail safe.
    run_here "could not determine a diff base; not risking a skipped suite."
  fi

  CHANGED="$(git diff --name-only "$BASE" HEAD)"
  MATCHED=0
  for prefix in "${PATH_PREFIXES[@]}"; do
    if echo "$CHANGED" | grep -q "^${prefix}"; then MATCHED=1; break; fi
  done
  if [ "$MATCHED" -eq 0 ]; then
    defer "no changes under: ${PATH_PREFIXES[*]}"
  fi
fi

# ── 2. Ask GitHub whether it ran this workflow for this exact commit ─────────
# Unauthenticated API calls are rate-limited per IP, and CI runners share IPs,
# so a token is effectively required. Without one we cannot know, so we run.
if [ -z "${GITHUB_TOKEN:-}" ]; then
  run_here "GITHUB_TOKEN is not set, so GitHub's status cannot be checked."
fi

API="https://api.github.com/repos/${CIRCLE_PROJECT_USERNAME}/${CIRCLE_PROJECT_REPONAME}/actions/workflows/${WORKFLOW_FILE}/runs?head_sha=${CIRCLE_SHA1}"

# Prints "<count> <status> <conclusion>" for the newest run, or "0 - -".
query_github() {
  curl -sS --max-time 20 \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "$API" 2>/dev/null \
  | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)
except Exception:
    print("0 - -"); sys.exit(0)
runs = d.get("workflow_runs") or []
if not runs:
    print("0 - -")
else:
    r = runs[0]
    print(f'"'"'1 {r.get("status")} {r.get("conclusion")}'"'"')
'
}

echo "Checking GitHub Actions for ${WORKFLOW_FILE} @ ${CIRCLE_SHA1} (up to ${WAIT_SECONDS}s)…"
ELAPSED=0
while :; do
  read -r COUNT STATUS CONCLUSION <<<"$(query_github)"

  if [ "$COUNT" = "1" ]; then
    case "$STATUS" in
      completed)
        case "$CONCLUSION" in
          success)
            defer "GitHub Actions already ran ${WORKFLOW_FILE} and it passed."
            ;;
          skipped|neutral)
            run_here "GitHub reported '${CONCLUSION}' — treating as not covered."
            ;;
          *)
            # Mirror the failure rather than skipping, so the CircleCI badge
            # never shows green for a commit GitHub proved is broken.
            echo "✖ GitHub Actions ran ${WORKFLOW_FILE} and it concluded '${CONCLUSION}'."
            echo "  Not re-running it here; fix the GitHub run."
            exit 1
            ;;
        esac
        ;;
      *)
        echo "  GitHub run is '${STATUS}' — waiting…"
        ;;
    esac
  else
    echo "  No GitHub run for this commit yet — waiting…"
  fi

  if [ "$ELAPSED" -ge "$WAIT_SECONDS" ]; then
    # The out-of-minutes case lands here: GitHub accepted the push but never
    # scheduled the workflow, so nothing ever appears.
    run_here "no GitHub run appeared within ${WAIT_SECONDS}s (billing lapsed, Actions disabled, or the workflow was removed)."
  fi
  sleep "$POLL_INTERVAL"
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done
