#!/usr/bin/env bash
# Mirror the brand webfonts locally for screenshots.
#
# Headless Chromium can't reach fonts.googleapis.com through the sandbox proxy,
# and without the real faces a screenshot lies about the typography — Cormorant's
# oldstyle figures in particular render "CHF 0" as "CHF o", a bug that is
# invisible against the Georgia fallback.
#
# Writes fonts/fonts.css + the woff2 files, which index.html links. Both are
# gitignored; re-run this after a fresh clone.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p fonts

UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
CA=()
[ -f /root/.ccr/ca-bundle.crt ] && CA=(--cacert /root/.ccr/ca-bundle.crt)

# The same family list client/index.html requests, so the mirror can't drift
# from what production actually loads.
curl -sS "${CA[@]}" -A "$UA" \
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Inter:wght@300;400;500;600&family=Caveat:wght@400;500;600&display=swap" \
  -o fonts/src.css

CA_ARGS="${CA[*]-}" python3 <<'PY'
import re, subprocess, os, hashlib, shlex

ca = shlex.split(os.environ.get("CA_ARGS", ""))
css = open("fonts/src.css").read()
urls = sorted(set(re.findall(r"url\((https://[^)]+\.woff2)\)", css)))

for url in urls:
    name = hashlib.md5(url.encode()).hexdigest()[:10] + ".woff2"
    path = f"fonts/{name}"
    if not os.path.exists(path):
        subprocess.run(["curl", "-sS", *ca, "-o", path, url], check=True)
    css = css.replace(url, "/fonts/" + name)

open("fonts/fonts.css", "w").write(css)
print(f"mirrored {len(urls)} font files")
PY
