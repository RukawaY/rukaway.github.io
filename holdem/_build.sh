#!/usr/bin/env bash
# Rebuild holdem/{index.html,assets/} from the RukawaY's Texas Hold'em source of truth.
# The source project lives OUTSIDE this repo (its package.json / node_modules are
# gitignored here); only the built, self-contained bundle is committed and served.
# The app is built with base '/holdem/' so it works at https://ziyuan-xia.com/holdem.
set -euo pipefail
SRC="${1:-../../holdem}"
cd "$(dirname "$0")"
SRC="$(cd "$SRC" && pwd)"

echo "building from $SRC ..."
( cd "$SRC" && { command -v npm >/dev/null && npm run build || bunx vite build; } )

# Replace the published bundle. Only index.html and assets/ are generated --
# this script itself (underscore-prefixed, so Jekyll never publishes it) stays.
rm -rf ./assets ./index.html
cp -r "$SRC/dist/." ./
echo "OK -- holdem/ updated. Commit and push to deploy."
