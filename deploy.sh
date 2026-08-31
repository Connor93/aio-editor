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

# ── GFX assets → origin-gfx (content-addressed) ──
# The editor serves preview PNGs from GFX_ROOT/gfxNNN/<resource_id>.png, and the
# embedded eomap-js loads the map .egf files straight out of the same volume.
#
# Each block hashes its sources and parks the digest in the volume as
# .seed-<name>.stamp, so a deploy re-uploads exactly when the content changed.
# These guards used to key on mere path presence ("is gfx023/ there?"), which
# meant every gfx update after the very first seed was silently skipped and prod
# quietly kept serving the old art. Set GFX_SRC in .env.deploy (path to
# reoserv/data/gfx) to enable; unset skips the whole section.

# Deterministic digest of the given paths' file contents, relative to GFX_SRC.
# Filenames here are `<digits>.png` / `gfxNNN.egf[.br]`, so newline-separated
# listing is safe (BSD sort has no -z).
gfx_fingerprint() {
  ( cd "$GFX_SRC" && find "$@" -type f \
      | LC_ALL=C sort \
      | xargs shasum -a 256 \
      | shasum -a 256 \
      | cut -d' ' -f1 )
}

# seed_gfx <label> <stamp-name> <path>...
seed_gfx() {
  local label="$1" stamp="$2"; shift 2
  local paths=("$@") p want have

  for p in "${paths[@]}"; do
    if [[ ! -e "$GFX_SRC/$p" ]]; then
      echo "⚠️  GFX_SRC=$GFX_SRC has no $p — skipping $label seed (check the path)"
      return 0
    fi
  done

  want=$(gfx_fingerprint "${paths[@]}")
  have=$(ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
    "docker run --rm -v origin-gfx:/v alpine cat /v/.seed-${stamp}.stamp 2>/dev/null" || true)
  have="${have//[$'\r\n']/}"

  if [[ "$want" == "$have" ]]; then
    echo "✅ $label unchanged in origin-gfx — skipping."
    return 0
  fi

  if [[ -n "$have" ]]; then
    echo "🔄 $label changed (${have:0:12} → ${want:0:12}) — re-seeding ..."
  else
    echo "🎨 Seeding $label into origin-gfx (first time) ..."
  fi

  tar -C "$GFX_SRC" -czf "/tmp/origin-${stamp}.tgz" "${paths[@]}"
  echo "   $(du -h "/tmp/origin-${stamp}.tgz" | cut -f1) → ${VPS_HOST}"
  scp -P "$SSH_PORT" "/tmp/origin-${stamp}.tgz" "${VPS_USER}@${VPS_HOST}:/tmp/origin-${stamp}.tgz"
  ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
    "docker run --rm -v origin-gfx:/v -v /tmp/origin-${stamp}.tgz:/seed.tgz:ro alpine \
       sh -c 'tar -xzf /seed.tgz -C /v && printf %s \"${want}\" > /v/.seed-${stamp}.stamp' \
     && rm -f /tmp/origin-${stamp}.tgz"
  rm -f "/tmp/origin-${stamp}.tgz"
  echo "✅ $label seeded."
}

if [[ -n "${GFX_SRC:-}" ]]; then
  # Preview PNGs behind the item / NPC / spell / spell-icon pickers.
  seed_gfx "GFX previews" previews gfx021 gfx023 gfx024 gfx025

  # Worn-graphic (item.spec1) sheets. Male sheets are canonical — spec1 is
  # gender-agnostic, so the worn_* categories only ever read these.
  seed_gfx "worn-graphic dirs" worn gfx011 gfx013 gfx015 gfx017 gfx019

  # Map EGFs for the embedded editor, plus brotli siblings the backend serves
  # with Content-Encoding: br. Refresh the .br first so it's part of the digest.
  if [[ -f "$GFX_SRC/gfx003.egf" ]]; then
    "$SCRIPT_DIR/scripts/compress-egf.sh" "$GFX_SRC"
  fi
  seed_gfx "map EGFs" mapegf \
    gfx003.egf gfx004.egf gfx005.egf gfx006.egf gfx007.egf gfx022.egf \
    gfx003.egf.br gfx004.egf.br gfx005.egf.br gfx006.egf.br gfx007.egf.br gfx022.egf.br
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
