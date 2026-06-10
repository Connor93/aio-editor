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
echo "📦 Building frontend ..."
docker build --platform linux/amd64 -f packages/frontend/Dockerfile -t "$FRONTEND_IMAGE" "$SCRIPT_DIR"

echo "🚀 Pushing to GHCR ..."
echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
docker push "$BACKEND_IMAGE"
docker push "$FRONTEND_IMAGE"

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
# would be unreachable from Traefik otherwise. GFX_ROOT left unset (previews
# 503 until origin-gfx is populated; the editor works without them).
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
      - REOSERV_BASE_URL=http://reoserv:8090
    volumes:
      - origin-pub:/data/pub
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
