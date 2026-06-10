# syntax=docker/dockerfile:1
# Build context = repo root (npm workspaces).

FROM node:24-alpine AS builder
WORKDIR /app
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
# Manifests first for layer-cached install.
COPY package.json package-lock.json ./
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
RUN npm ci
# Source + build the frontend workspace.
COPY . .
RUN npm run build --workspace packages/frontend

FROM nginx:alpine
COPY packages/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/packages/frontend/dist /usr/share/nginx/html
EXPOSE 80
