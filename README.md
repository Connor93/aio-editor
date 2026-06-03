# aio-editor

All In One Editor for Project Origin (REOSERV alpha).

A self-hosted web app for authoring every pub type in `data/pub/`. Companion to REOSERV (`../reoserv`); see the vault for the full design intent.

## Layout

```
aio-editor/
├── packages/
│   ├── backend/    # Fastify + TS — REOSERV-auth proxy, staging, locks, audit
│   └── frontend/   # Vite + React + TS — login + authoring UI
```

## Dev

```bash
npm install
npm run dev:backend     # port 4000 by default
npm run dev:frontend    # port 5173 by default
```

Backend expects a running REOSERV with `[admin].auth_port` set. Configure via `packages/backend/.env`:

```
REOSERV_BASE_URL=http://127.0.0.1:8090
PORT=4000
DATABASE_URL=file:./editor.db
```

## Sprint status

See the vault note `Project Origin/Pub Editor/Documentation/Planning/All In One Editor.md` for live sprint status. Currently: Sprint 3.1 in progress.
