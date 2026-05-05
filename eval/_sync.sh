#!/usr/bin/env bash
# Refresh eval/{style.css,app.js} from the VLM-eval source of truth.
# index.html is hand-edited here (different asset paths + API base) so we
# leave it alone.
set -euo pipefail
SRC="${1:-../../VLM-eval/static}"
cd "$(dirname "$0")"
cp -v "$SRC/style.css" ./style.css
cp -v "$SRC/app.js"    ./app.js
echo "OK -- index.html unchanged (it diverges on purpose)."
