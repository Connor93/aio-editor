#!/usr/bin/env bash
set -euo pipefail
# Build the eomap-js fork's embedded web bundle and copy it into the frontend's
# public/eomap/ so Vite (dev) and nginx (prod) serve it same-origin under /eomap/.
#
# Override the fork location with EOMAP_FORK_DIR (default ~/Projects/eomap-js-origin).

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
FORK_DIR="${EOMAP_FORK_DIR:-$HOME/Projects/eomap-js-origin}"
DEST="$REPO_ROOT/packages/frontend/public/eomap"

if [[ ! -d "$FORK_DIR" ]]; then
  echo "❌ eomap-js fork not found at $FORK_DIR (set EOMAP_FORK_DIR)"; exit 1
fi

echo "📦 Building eomap-js fork (embedded) in $FORK_DIR ..."
( cd "$FORK_DIR" && npm run dist:web:embedded )

echo "🧹 Refreshing $DEST ..."
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$FORK_DIR/dist/web/." "$DEST/"
echo "✅ eomap bundle copied to $DEST"
