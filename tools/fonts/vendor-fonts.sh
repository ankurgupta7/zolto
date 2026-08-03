#!/usr/bin/env bash
# Vendor the brand webfonts into client/public/fonts.
#
# The fonts are served first-party (client/index.html links /fonts/fonts.css)
# instead of from fonts.googleapis.com, so visiting a storefront never sends
# the visitor's IP address to Google — a GDPR concern German courts have ruled
# on (LG München I, 3 O 17493/20). The screenshot harness serves the same
# directory, so shots and production can't drift typographically.
#
# The mirrored files are committed; re-run this only when the family list
# below changes, then commit the result.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p client/public/fonts

UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
CA=()
[ -f /root/.ccr/ca-bundle.crt ] && CA=(--cacert /root/.ccr/ca-bundle.crt)

# The family list client/src/index.css actually uses. display=swap keeps text
# visible on the fallback face while the woff2 loads.
curl -sS "${CA[@]}" -A "$UA" \
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Inter:wght@300;400;500;600&family=Caveat:wght@400;500;600&display=swap" \
  -o client/public/fonts/src.css

CA_ARGS="${CA[*]-}" python3 <<'PY'
import os, re, shlex, subprocess

ca = shlex.split(os.environ.get("CA_ARGS", ""))
css = open("client/public/fonts/src.css").read()

# css2 output is a sequence of "/* subset */ @font-face { ... }" blocks. Name
# each file family-weight-style-subset so a diff of fonts/ is reviewable.
blocks = re.findall(r"/\* ([\w-]+) \*/\s*(@font-face \{[^}]+\})", css)
out, seen = [], {}
for subset, block in blocks:
    family = re.search(r"font-family: '([^']+)'", block).group(1)
    style = re.search(r"font-style: (\w+)", block).group(1)
    weight = re.search(r"font-weight: (\d+)", block).group(1)
    url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
    if url not in seen:
        name = f"{family.lower().replace(' ', '-')}-{weight}-{style}-{subset}.woff2"
        subprocess.run(
            ["curl", "-sS", "--retry", "4", "--retry-delay", "2",
             "--retry-all-errors", *ca,
             "-o", f"client/public/fonts/{name}", url],
            check=True,
        )
        seen[url] = name
    out.append(f"/* {subset} */\n" + block.replace(url, "/fonts/" + seen[url]))

open("client/public/fonts/fonts.css", "w").write("\n".join(out) + "\n")
os.remove("client/public/fonts/src.css")
print(f"vendored {len(seen)} font files for {len(blocks)} @font-face rules")
PY
