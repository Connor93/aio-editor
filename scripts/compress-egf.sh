#!/usr/bin/env bash
set -euo pipefail
# Brotli-precompress the map EGF files the embedded editor loads, so the backend
# can serve `<file>.egf.br` with `Content-Encoding: br` (the browser decompresses
# transparently — eomap-js's loader is untouched). Mirrors eoweb's approach.
#
# Usage: compress-egf.sh [GFX_DIR]
#   GFX_DIR defaults to $GFX_SRC, else ~/Projects/reoserv/data/gfx.
# Idempotent: skips files whose .br is already newer than the source.

GFX_DIR="${1:-${GFX_SRC:-$HOME/Projects/reoserv/data/gfx}}"
# Map editor loads EGF file ids 3,4,5,6,7,22 (see eomap-js application.js loadGFX).
MAP_EGFS=(gfx003.egf gfx004.egf gfx005.egf gfx006.egf gfx007.egf gfx022.egf)

if ! command -v brotli >/dev/null 2>&1; then
  echo "❌ brotli not found (install it: brew install brotli / apt-get install brotli)"; exit 1
fi
if [[ ! -d "$GFX_DIR" ]]; then
  echo "❌ gfx dir not found: $GFX_DIR"; exit 1
fi

echo "🗜️  Brotli-precompressing map EGFs in $GFX_DIR ..."
for f in "${MAP_EGFS[@]}"; do
  src="$GFX_DIR/$f"
  br="$src.br"
  if [[ ! -f "$src" ]]; then
    echo "  skip (missing): $f"
    continue
  fi
  if [[ -f "$br" && "$br" -nt "$src" ]]; then
    echo "  up-to-date:     $f.br"
    continue
  fi
  brotli -q 10 -f -k -o "$br" "$src"
  echo "  compressed:     $f ($(du -h "$src" | cut -f1)) -> $f.br ($(du -h "$br" | cut -f1))"
done
echo "✅ EGF precompression done."
