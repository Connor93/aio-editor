# syntax=docker/dockerfile:1
# Build context = repo root (npm workspaces).

FROM node:24-alpine AS builder
WORKDIR /app
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
COPY package.json package-lock.json ./
COPY packages/frontend/package.json packages/frontend/
COPY packages/backend/package.json packages/backend/
RUN npm ci
COPY . .
# tsc -> dist/, then copies src/schemas -> dist/schemas (per the build script).
RUN npm run build --workspace packages/backend

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
# Hoisted deps + the built backend package (dist incl. dist/schemas).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/backend ./packages/backend
EXPOSE 4000
CMD ["node", "packages/backend/dist/server.js"]
