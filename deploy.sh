#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
# AIO Editor — Local Deploy Script
# Builds frontend + backend images, pushes to GHCR, deploys behind
# the existing Traefik. Backend mounts the shared origin-pub volume
# and reaches reoserv's admin API over the private origin network.
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.deploy"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "❌ Missing $ENV_FILE — copy .env.deploy.example and fill it in"
  exit 1
fi
source "$ENV_FILE"

for var in VPS_HOST VPS_USER GHCR_USER GHCR_PAT EDITOR_DOMAIN; do
  if [[ -z "${!var:-}" ]]; then echo "❌ $var not set in $ENV_FILE"; exit 1; fi
done

FRONTEND_IMAGE="ghcr.io/${GHCR_USER}/aio-editor-frontend:latest"
BACKEND_IMAGE="ghcr.io/${GHCR_USER}/aio-editor-backend:latest"
SSH_PORT="${SSH_PORT:-2222}"

echo "═══ AIO Editor deploy → $EDITOR_DOMAIN ═══"

echo "📦 Building backend ..."
docker build --platform linux/amd64 -f packages/backend/Dockerfile -t "$BACKEND_IMAGE" "$SCRIPT_DIR"
echo "🗺️  Building eomap-js fork bundle ..."
EOMAP_FORK_DIR="${EOMAP_FORK_DIR:-$HOME/Projects/eomap-js-origin}" "$SCRIPT_DIR/scripts/build-eomap.sh"

echo "📦 Building frontend ..."
docker build --platform linux/amd64 -f packages/frontend/Dockerfile -t "$FRONTEND_IMAGE" "$SCRIPT_DIR"

echo "🚀 Pushing to GHCR ..."
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
docker push "$BACKEND_IMAGE"
docker push "$FRONTEND_IMAGE"

# ── GFX preview assets (one-time seed of the origin-gfx volume) ──
# The editor serves preview PNGs from GFX_ROOT/gfxNNN/<resource_id>.png.
# Set GFX_SRC in .env.deploy (path to reoserv/data/gfx) to upload the four
# needed dirs (~30M) into origin-gfx once. Skipped if already populated.
if [[ -n "${GFX_SRC:-}" ]]; then
  if [[ ! -d "$GFX_SRC/gfx023" ]]; then
    echo "⚠️  GFX_SRC=$GFX_SRC has no gfx023/ — skipping GFX seed (check the path)"
  else
    GFX_STATE=$(ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
      "docker run --rm -v origin-gfx:/v alpine sh -c '[ -d /v/gfx023 ] && echo filled || echo empty'")
    if [[ "$GFX_STATE" == "empty" ]]; then
      echo "🎨 Seeding origin-gfx from $GFX_SRC (one-time, ~30M) ..."
      tar -C "$GFX_SRC" -czf /tmp/origin-gfx.tgz gfx021 gfx023 gfx024 gfx025
      scp -P "$SSH_PORT" /tmp/origin-gfx.tgz "${VPS_USER}@${VPS_HOST}:/tmp/origin-gfx.tgz"
      ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
        "docker run --rm -v origin-gfx:/v -v /tmp/origin-gfx.tgz:/seed.tgz:ro alpine sh -c 'tar -xzf /seed.tgz -C /v' && rm -f /tmp/origin-gfx.tgz"
      rm -f /tmp/origin-gfx.tgz
      echo "🎨 origin-gfx seeded."
    else
      echo "🎨 origin-gfx already populated — skipping seed (clear the volume to re-seed)."
    fi
  fi
fi

# ── Worn-graphic preview dirs (one-time seed of origin-gfx) ──
# The worn-graphic picker for equippable `spec1` serves the on-character sprite
# sheets, which the first seed above never shipped: gfx017 (weapon), gfx019
# (shield), gfx013 (armor), gfx015 (hat), gfx011 (boots) — the male sheets the
# backend's worn_* categories reference. Kept as its own block (keyed on gfx017,
# not gfx023) so it back-fills volumes seeded before these categories existed.
if [[ -n "${GFX_SRC:-}" ]]; then
  if [[ ! -d "$GFX_SRC/gfx017" ]]; then
    echo "⚠️  GFX_SRC=$GFX_SRC has no gfx017/ — skipping worn-graphic seed (check the path)"
  else
    WORN_STATE=$(ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
      "docker run --rm -v origin-gfx:/v alpine sh -c '[ -d /v/gfx017 ] && echo filled || echo empty'")
    if [[ "$WORN_STATE" == "empty" ]]; then
      echo "🧥 Seeding worn-graphic dirs into origin-gfx (gfx011/013/015/017/019) ..."
      tar -C "$GFX_SRC" -czf /tmp/origin-worn.tgz gfx011 gfx013 gfx015 gfx017 gfx019
      scp -P "$SSH_PORT" /tmp/origin-worn.tgz "${VPS_USER}@${VPS_HOST}:/tmp/origin-worn.tgz"
      ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
        "docker run --rm -v origin-gfx:/v -v /tmp/origin-worn.tgz:/seed.tgz:ro alpine sh -c 'tar -xzf /seed.tgz -C /v' && rm -f /tmp/origin-worn.tgz"
      rm -f /tmp/origin-worn.tgz
      echo "🧥 origin-gfx worn-graphic dirs seeded."
    else
      echo "🧥 Worn-graphic dirs already present in origin-gfx — skipping."
    fi
  fi
fi

# ── Map EGF files + brotli precompression (one-time seed for the editor) ──
# eomap-js connected mode needs gfx003/004/005/006/007/022.egf in origin-gfx.
# We also ship .egf.br siblings so the backend serves them with
# Content-Encoding: br (~108MB -> ~5MB first-load transfer; the loader is
# untouched — the browser decompresses transparently). The PNG seed above only
# ships the gfxNNN/ preview dirs. Idempotent: keyed on gfx003.egf.br present.
if [[ -n "${GFX_SRC:-}" ]]; then
  if [[ ! -f "$GFX_SRC/gfx003.egf" ]]; then
    echo "⚠️  GFX_SRC=$GFX_SRC has no gfx003.egf — skipping map EGF seed"
  else
    EGF_STATE=$(ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
      "docker run --rm -v origin-gfx:/v alpine sh -c '[ -f /v/gfx003.egf.br ] && echo filled || echo empty'")
    if [[ "$EGF_STATE" == "empty" ]]; then
      echo "🗺️  Seeding map EGFs (+ brotli) into origin-gfx ..."
      "$SCRIPT_DIR/scripts/compress-egf.sh" "$GFX_SRC"
      tar -C "$GFX_SRC" -czf /tmp/origin-egf.tgz \
        gfx003.egf gfx004.egf gfx005.egf gfx006.egf gfx007.egf gfx022.egf \
        gfx003.egf.br gfx004.egf.br gfx005.egf.br gfx006.egf.br gfx007.egf.br gfx022.egf.br
      scp -P "$SSH_PORT" /tmp/origin-egf.tgz "${VPS_USER}@${VPS_HOST}:/tmp/origin-egf.tgz"
      ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
        "docker run --rm -v origin-gfx:/v -v /tmp/origin-egf.tgz:/seed.tgz:ro alpine sh -c 'tar -xzf /seed.tgz -C /v' && rm -f /tmp/origin-egf.tgz"
      rm -f /tmp/origin-egf.tgz
      echo "🗺️  Map EGFs + .br seeded."
    else
      echo "🗺️  Map EGFs already present in origin-gfx — skipping."
    fi
  fi
fi

ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" bash -s -- \
  "$FRONTEND_IMAGE" "$BACKEND_IMAGE" "$GHCR_USER" "$GHCR_PAT" "$EDITOR_DOMAIN" <<'REMOTE'
set -euo pipefail
FRONTEND_IMAGE="$1"; BACKEND_IMAGE="$2"; GHCR_USER="$3"; GHCR_PAT="$4"; EDITOR_DOMAIN="$5"

echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin

# Traefik: /api/auth (strict rate-limit) > /api (backend) > / (frontend).
mkdir -p ~/traefik/dynamic
cat > ~/traefik/dynamic/origin-editor.yml <<TRAEFIK
http:
  middlewares:
    origin-editor-auth-ratelimit:
      rateLimit:
        average: 10
        period: 1m
        burst: 5
  routers:
    origin-editor-api-auth:
      rule: "Host(\`${EDITOR_DOMAIN}\`) && Path(\`/api/auth\`)"
      service: origin-editor-backend
      priority: 200
      entryPoints:
        - websecure
      middlewares:
        - origin-editor-auth-ratelimit
      tls:
        certResolver: letsencrypt
    origin-editor-api:
      rule: "Host(\`${EDITOR_DOMAIN}\`) && PathPrefix(\`/api\`)"
      service: origin-editor-backend
      priority: 100
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
    origin-editor:
      rule: "Host(\`${EDITOR_DOMAIN}\`)"
      service: origin-editor-frontend
      priority: 1
      entryPoints:
        - websecure
      tls:
        certResolver: letsencrypt
  services:
    origin-editor-backend:
      loadBalancer:
        servers:
          - url: "http://aio-editor-backend:4000"
    origin-editor-frontend:
      loadBalancer:
        servers:
          - url: "http://aio-editor-frontend:80"
TRAEFIK

# Compose: backend on web (api route) + origin (reoserv admin); shared pub
# volume. HOST=0.0.0.0 is REQUIRED — the backend defaults to 127.0.0.1 and
# would be unreachable from Traefik otherwise. GFX_ROOT serves preview
# thumbnails from the read-only origin-gfx volume (404s gracefully if the
# volume wasn't seeded — set GFX_SRC in .env.deploy to seed it).
mkdir -p ~/aio-editor
cat > ~/aio-editor/docker-compose.yml <<COMPOSE
services:
  aio-editor-backend:
    image: ${BACKEND_IMAGE}
    container_name: aio-editor-backend
    restart: unless-stopped
    environment:
      - HOST=0.0.0.0
      - PORT=4000
      - PUB_DATA_DIR=/data/pub
      - GFX_ROOT=/data/gfx
      - MAPS_DATA_DIR=/data/maps
      - REOSERV_BASE_URL=http://reoserv:8090
    volumes:
      - origin-pub:/data/pub
      - origin-gfx:/data/gfx:ro
      - origin-maps:/data/maps
    networks:
      - web
      - origin
  aio-editor-frontend:
    image: ${FRONTEND_IMAGE}
    container_name: aio-editor-frontend
    restart: unless-stopped
    networks:
      - web
volumes:
  origin-pub:
    external: true
  origin-gfx:
    external: true
  origin-maps:
    external: true
networks:
  web:
    external: true
  origin:
    external: true
COMPOSE

cd ~/aio-editor
docker compose pull
docker compose up -d --force-recreate
sleep 3
docker compose ps
echo "✅ AIO Editor deployed → https://${EDITOR_DOMAIN}"
REMOTE

echo "✅ Done. Visit https://$EDITOR_DOMAIN"
