# eomap-js Map Editing Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed a live `.emf` map editor in the AIO editor — a light fork of eomap-js that browses/opens/saves maps directly on the server and renders with our hosted GFX, so saves hot-reload in reoserv with no restart.

**Architecture:** A fork of [eomap-js](https://github.com/Cirras/eomap-js) (MIT, Phaser 3.55 + Adobe Spectrum + webpack) keeps its entire engine + UI and swaps only two I/O seams: GFX loads via eomap-js's built-in **Connected Mode** (`GET /api/mapper/gfx/*.egf` + `/api/mapper/assets/*`, served by the AIO backend from `data/gfx`), and maps load/save through a new `ServerFileSystemProvider` hitting `/api/maps*` (Bearer-auth'd, direct-to-live). The fork's web bundle is served by the AIO **frontend** under `/eomap/`, so the embedding iframe is same-origin with the AIO app in both dev (Vite proxy) and prod (nginx) — every fetch is relative and CORS never arises. The admin token reaches the iframe via origin-checked `postMessage`. reoserv needs **zero** changes (map hot-reload + new-id loading already ship).

**Tech Stack:** Backend = Fastify 5 + TypeScript (ESM). Fork = JavaScript + webpack + Phaser + Spectrum web components. Frontend = Vite + React + TypeScript + Tailwind. Deploy = Docker → GHCR → Traefik (existing `deploy.sh`).

**Design spec:** `~/Documents/TBD/Project Origin/Pub Editor/Documentation/Planning/Map editing (eomap-js).md`

**Verification model:** This repo has no test runner and follows manual verification (reoserv's CLAUDE.md: "No automated tests exist — verify by running"). Per the writing-plans priority rule (user/project conventions override the TDD default), each task is verified with concrete `curl` / build / browser checks — we do **not** introduce a test framework. Commit after each task.

---

## File map

**Fork — new repo `~/Projects/eomap-js-origin`** (clone of Cirras/eomap-js):
- Create: `src/web/filesystem/server-file-system-file-handle.js` — HTTP-backed map handle (getFile/write).
- Create: `src/web/filesystem/server-file-system-provider.js` — `FileSystemProvider` impl with server-map pickers.
- Create: `src/web/filesystem/server-map-dialog.js` — plain-DOM open/save modals.
- Create: `src/web/server-config.js` — embedded-mode detection + `postMessage` token handshake.
- Modify: `src/web/index.js` — use `ServerFileSystemProvider` when embedded.
- Modify: `webpack/web/web.js` — `output.publicPath = "auto"`.
- Modify: `package.json` — add `dist:web:embedded` script (bakes `FORCE_CONNECTED_MODE_URL=/api/mapper/`).

**Backend — `aio-editor/packages/backend`:**
- Modify: `src/maps/store.ts` — add `readMap(id)` + `MapNotFoundError`.
- Modify: `src/routes/maps.ts` — add `GET /api/maps/:id` (raw bytes).
- Create: `src/routes/mapper.ts` — `GET /api/mapper/gfx/:file` + `GET /api/mapper/assets/*` (public).
- Modify: `src/config.ts` — add `mapperAssetsDir`.
- Modify: `src/server.ts` — register mapper routes (no auth guard).
- Modify: `package.json` — build script copies `src/assets` → `dist/assets`.
- Create: `src/assets/mapper/**` — vendored eomap-js bundled assets.
- Modify: `.env.example` — document `MAPPER_ASSETS_DIR`.

**Frontend — `aio-editor/packages/frontend`:**
- Create: `src/maps/MapEditor.tsx` — iframe host + token postMessage.
- Modify: `src/AppShell.tsx` — add "Map Editor" tab.
- Modify: `src/maps/MapUploader.tsx` — fix stale "needs restart" copy.
- Create (gitignored): `public/eomap/**` — copied fork bundle.
- Modify: `.gitignore` (repo root) — ignore `packages/frontend/public/eomap/`.

**Repo root / deploy:**
- Create: `scripts/build-eomap.sh` — local fork build + copy into `public/eomap`.
- Modify: `deploy.sh` — build fork + copy before frontend image; seed map `.egf` files into `origin-gfx`.
- Modify: `.env.deploy.example` — add `EOMAP_FORK_DIR`.

---

## Phase 0 — Fork setup

### Task 1: Create the eomap-js fork repo

**Files:**
- Create: `~/Projects/eomap-js-origin/` (clone)

- [ ] **Step 1: Clone upstream into a sibling repo and detach from upstream origin**

```bash
cd ~/Projects
git clone https://github.com/Cirras/eomap-js.git eomap-js-origin
cd eomap-js-origin
git remote rename origin upstream   # keep upstream for future merges; no push target yet
```

- [ ] **Step 2: Install deps and confirm a clean baseline web build**

```bash
cd ~/Projects/eomap-js-origin
npm install
npm run dist:web
ls dist/web/index.html dist/web/bundle.min.js
```

Expected: both files exist. (First build can take a minute; webpack + Phaser is large.)

- [ ] **Step 3: Record the upstream commit for future rebases**

```bash
cd ~/Projects/eomap-js-origin
git rev-parse HEAD > FORK_BASE.txt
git add FORK_BASE.txt
git commit -m "chore: record upstream fork base"
```

---

## Phase 1 — Backend: map read + connected-mode serving

### Task 2: Add `readMap` + `MapNotFoundError` to the maps store

**Files:**
- Modify: `aio-editor/packages/backend/src/maps/store.ts`

- [ ] **Step 1: Add the `readFile` import**

In `src/maps/store.ts`, change the `node:fs/promises` import to include `readFile`:

```ts
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
```

- [ ] **Step 2: Add a not-found error class next to `InvalidMapError`**

After the `InvalidMapError` class declaration, add:

```ts
/** Map id is valid but no file exists on disk. Mapped to 404 by the route. */
export class MapNotFoundError extends Error {}
```

- [ ] **Step 3: Add the `readMap` function (append to the end of the file)**

```ts
/** Read a map's raw .emf bytes by id. Throws MapNotFoundError (→404) when the
 *  canonical {id:05}.emf doesn't exist. */
export async function readMap(id: number): Promise<Buffer> {
  const dir = mapsDir();
  const path = join(dir, paddedMapName(id));
  if (!existsSync(path)) {
    throw new MapNotFoundError(`map ${id} not found`);
  }
  return readFile(path);
}
```

- [ ] **Step 4: Type-check**

Run: `cd ~/Projects/aio-editor && npm run typecheck --workspace packages/backend`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/aio-editor
git add packages/backend/src/maps/store.ts
git commit -m "feat(backend): readMap + MapNotFoundError in maps store"
```

### Task 3: Add `GET /api/maps/:id` returning raw bytes

**Files:**
- Modify: `aio-editor/packages/backend/src/routes/maps.ts`

- [ ] **Step 1: Update imports to include `readMap`, `MapNotFoundError`, `paddedMapName`**

Change the store import line in `src/routes/maps.ts` to:

```ts
import {
  InvalidMapError,
  MapNotFoundError,
  clampMapId,
  listMapIds,
  paddedMapName,
  readMap,
  writeMap,
} from "../maps/store.js";
```

- [ ] **Step 2: Map `MapNotFoundError` to 404 in `mapError`**

In the `mapError` helper, add this branch immediately after the `InvalidMapError` check:

```ts
  if (err instanceof MapNotFoundError) {
    return reply.code(404).send({ error: err.message });
  }
```

- [ ] **Step 3: Add the `GET /api/maps/:id` route inside `registerMapRoutes`**

Add this handler right after the existing `app.get("/api/maps", ...)` block:

```ts
  // Download a single map's raw .emf bytes. Used by the embedded editor's
  // ServerFileSystemProvider to open a map.
  app.get<{ Params: { id: string } }>("/api/maps/:id", async (request, reply) => {
    if (!config.mapsDataDir) {
      return reply.code(503).send({ error: "MAPS_DATA_DIR not configured on the backend" });
    }
    try {
      const id = clampMapId(request.params.id);
      const buffer = await readMap(id);
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Content-Disposition", `attachment; filename="${paddedMapName(id)}"`);
      return reply.send(buffer);
    } catch (err) {
      return mapError(reply, err);
    }
  });
```

- [ ] **Step 4: Type-check**

Run: `cd ~/Projects/aio-editor && npm run typecheck --workspace packages/backend`
Expected: no errors.

- [ ] **Step 5: Manual verification (requires a running backend + a valid admin token)**

Start the backend (`npm run dev:backend` from repo root, with `.env` pointing `MAPS_DATA_DIR` at `~/Projects/reoserv/data/maps`). Obtain a token via `POST /api/auth`. Then:

```bash
TOKEN=...            # a valid admin token
# Existing map 1 → 200 + bytes starting with "EMF"
curl -s -D- -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4000/api/maps/1 -o /tmp/map1.emf | head -1
head -c 3 /tmp/map1.emf; echo
# Missing map 31999 → 404
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4000/api/maps/31999
# Bad id → 400
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4000/api/maps/0
# No token → 401
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/api/maps/1
```

Expected: `HTTP/1.1 200`, then `EMF`; then `404`; then `400`; then `401`.

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/aio-editor
git add packages/backend/src/routes/maps.ts
git commit -m "feat(backend): GET /api/maps/:id returns raw .emf bytes"
```

### Task 4: Vendor eomap-js bundled assets + add `mapperAssetsDir` config

**Files:**
- Create: `aio-editor/packages/backend/src/assets/mapper/**`
- Modify: `aio-editor/packages/backend/src/config.ts`
- Modify: `aio-editor/packages/backend/package.json`
- Modify: `aio-editor/packages/backend/.env.example`

- [ ] **Step 1: Copy the bundled assets out of the fork into the backend**

```bash
cd ~/Projects/aio-editor
mkdir -p packages/backend/src/assets/mapper
cp -R ~/Projects/eomap-js-origin/src/core/assets/bundled/. packages/backend/src/assets/mapper/
ls packages/backend/src/assets/mapper        # expect: black.png cursor.png grid*.png specs/ ...
```

- [ ] **Step 2: Add `mapperAssetsDir` to `config.ts`**

First extend the imports at the top of `src/config.ts` (it already imports `resolve` from `node:path`):

```ts
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
```

Add a module-dir constant near the top (after the imports). Using `fileURLToPath` rather than `import.meta.dirname` avoids any dependency on the tsconfig `module` setting:

```ts
const moduleDir = dirname(fileURLToPath(import.meta.url));
```

Then, after the `mapsDataDir` declaration, add:

```ts
const mapperAssetsDir = process.env.MAPPER_ASSETS_DIR?.trim()
  ? resolve(process.env.MAPPER_ASSETS_DIR.trim())
  : resolve(moduleDir, "assets/mapper");
```

Then add `mapperAssetsDir,` to the exported `config` object (after `mapsDataDir,`).

- [ ] **Step 3: Make the build copy `src/assets` into `dist/assets`**

In `packages/backend/package.json`, change the `build` script to:

```json
    "build": "tsc -p tsconfig.json && cp -r src/schemas dist/schemas && cp -r src/assets dist/assets",
```

- [ ] **Step 4: Document the env var in `.env.example`**

Append to `packages/backend/.env.example`:

```
# Optional. Absolute path to the vendored eomap-js bundled assets served at
# /api/mapper/assets/* for the embedded map editor's Connected Mode. Defaults
# to the assets shipped inside the backend build, so it rarely needs setting.
MAPPER_ASSETS_DIR=
```

- [ ] **Step 5: Type-check + verify the default path resolves**

```bash
cd ~/Projects/aio-editor
npm run typecheck --workspace packages/backend
node --input-type=module -e "import('./packages/backend/dist/config.js').catch(()=>{})" 2>/dev/null || true
```

Expected: typecheck passes. (The dist import is only sanity; it needs env to fully load — skip if it throws on missing PUB_DATA_DIR.)

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/aio-editor
git add packages/backend/src/assets packages/backend/src/config.ts packages/backend/package.json packages/backend/.env.example
git commit -m "feat(backend): vendor eomap-js bundled assets + mapperAssetsDir config"
```

### Task 5: Add the connected-mode mapper routes (public)

**Files:**
- Create: `aio-editor/packages/backend/src/routes/mapper.ts`
- Modify: `aio-editor/packages/backend/src/server.ts`

- [ ] **Step 1: Write `src/routes/mapper.ts`**

```ts
import { createReadStream, existsSync, statSync, type Stats } from "node:fs";
import { resolve as resolvePath } from "node:path";

import type { FastifyInstance, FastifyReply } from "fastify";

import { config } from "../config.js";

// Real on-disk EGF names are gfx001.egf .. gfx026.egf. The map editor only
// requests 3,4,5,6,7,22 but we accept any well-formed gfx0NN.egf.
const EGF_FILE = /^gfx0\d\d\.egf$/;

function contentTypeFor(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".svg")) return "image/svg+xml";
  return "application/octet-stream";
}

/** Weak validator cache headers + a strong ETag from size+mtime. Returns true
 *  if the request's If-None-Match matched (caller should 304). */
function applyCacheHeaders(reply: FastifyReply, ifNoneMatch: string | undefined, stats: Stats): boolean {
  const etag = `"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`;
  reply.header("ETag", etag);
  reply.header("Cache-Control", "public, max-age=3600");
  return ifNoneMatch === etag;
}

export async function registerMapperRoutes(app: FastifyInstance) {
  // EGF graphics for Connected Mode. PUBLIC (no token): eomap-js's loader
  // fetches these tokenless, and they're EO client art, not business data.
  app.get<{ Params: { file: string } }>("/api/mapper/gfx/:file", async (request, reply) => {
    if (!config.gfxRoot) {
      return reply.code(503).send({ error: "GFX_ROOT not configured on the backend" });
    }
    const { file } = request.params;
    if (!EGF_FILE.test(file)) {
      return reply.code(400).send({ error: "invalid egf filename" });
    }
    const root = resolvePath(config.gfxRoot);
    const path = resolvePath(root, file);
    if (!path.startsWith(root + "/")) {
      return reply.code(400).send({ error: "path escapes gfx root" });
    }
    if (!existsSync(path)) {
      return reply.code(404).send({ error: "egf not found" });
    }
    const stats = statSync(path);
    if (applyCacheHeaders(reply, request.headers["if-none-match"], stats)) {
      return reply.code(304).send();
    }
    reply.header("Content-Type", "application/octet-stream");
    return reply.send(createReadStream(path));
  });

  // Bundled mapper assets (cursor/black/grid/specs/entities). PUBLIC.
  app.get<{ Params: Record<string, string> }>("/api/mapper/assets/*", async (request, reply) => {
    if (!config.mapperAssetsDir) {
      return reply.code(503).send({ error: "mapper assets not configured" });
    }
    const rel = request.params["*"] ?? "";
    const root = resolvePath(config.mapperAssetsDir);
    const path = resolvePath(root, rel);
    if (path !== root && !path.startsWith(root + "/")) {
      return reply.code(400).send({ error: "path escapes assets root" });
    }
    if (!existsSync(path) || !statSync(path).isFile()) {
      return reply.code(404).send({ error: "asset not found" });
    }
    const stats = statSync(path);
    if (applyCacheHeaders(reply, request.headers["if-none-match"], stats)) {
      return reply.code(304).send();
    }
    reply.header("Content-Type", contentTypeFor(path));
    return reply.send(createReadStream(path));
  });
}
```

- [ ] **Step 2: Register the routes in `server.ts` (no auth guard)**

In `src/server.ts`, add the import alongside the other route imports:

```ts
import { registerMapperRoutes } from "./routes/mapper.js";
```

Then add the registration call next to the other `await register...Routes(app);` lines (it deliberately gets **no** `registerAuthGuard` — `/api/mapper` does not match the `/api/maps` guard prefix because `maps` ≠ `mappe`):

```ts
  await registerMapperRoutes(app);
```

- [ ] **Step 3: Type-check**

Run: `cd ~/Projects/aio-editor && npm run typecheck --workspace packages/backend`
Expected: no errors.

- [ ] **Step 4: Manual verification (backend running, GFX_ROOT set to reoserv/data/gfx)**

```bash
# EGF served public (no token), 200 + octet-stream
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:4000/api/mapper/gfx/gfx003.egf
# Bundled asset served, 200 image/png
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' http://127.0.0.1:4000/api/mapper/assets/black.png
# Path traversal on gfx → 400 (regex rejects)
curl -s -o /dev/null -w '%{http_code}\n' --path-as-is 'http://127.0.0.1:4000/api/mapper/gfx/../../../etc/passwd'
# Path traversal on assets → 400 (escape guard)
curl -s -o /dev/null -w '%{http_code}\n' --path-as-is 'http://127.0.0.1:4000/api/mapper/assets/../../../../etc/passwd'
# Non-egf filename → 400
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/api/mapper/gfx/hello.txt
# ETag round-trip → re-request with the returned ETag yields 304
ETAG=$(curl -sI http://127.0.0.1:4000/api/mapper/gfx/gfx003.egf | grep -i '^etag:' | sed 's/^[Ee][Tt][Aa][Gg]: *//' | tr -d '\r')
curl -s -o /dev/null -w '%{http_code}\n' -H "If-None-Match: $ETAG" http://127.0.0.1:4000/api/mapper/gfx/gfx003.egf
```

Expected: `200 application/octet-stream`; `200 image/png`; `400`; `400`; `400`; `304`.

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/aio-editor
git add packages/backend/src/routes/mapper.ts packages/backend/src/server.ts
git commit -m "feat(backend): public /api/mapper/{gfx,assets} for eomap-js connected mode"
```

---

## Phase 2 — eomap-js fork: server-backed map I/O

All paths in this phase are under `~/Projects/eomap-js-origin`.

### Task 6: `ServerFileSystemFileHandle`

**Files:**
- Create: `~/Projects/eomap-js-origin/src/web/filesystem/server-file-system-file-handle.js`

- [ ] **Step 1: Write the handle**

```js
// A map handle backed by the AIO backend over HTTP. getToken is a function so
// a rotated token is always picked up at fetch time. All URLs are relative —
// the iframe is same-origin with the AIO app, so they resolve correctly in
// both dev (Vite proxy) and prod (nginx).
export class ServerFileSystemFileHandle {
  constructor(getToken, mapId, name) {
    this._getToken = getToken;
    this.mapId = mapId;
    this.name = name || `${String(mapId).padStart(5, "0")}.emf`;
  }

  async getFile() {
    const res = await fetch(`/api/maps/${this.mapId}`, {
      headers: { Authorization: `Bearer ${this._getToken()}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to load map ${this.mapId} (HTTP ${res.status})`);
    }
    const buffer = await res.arrayBuffer();
    const name = this.name;
    // eomap-js only calls file.arrayBuffer() and reads file.name.
    return {
      name,
      async arrayBuffer() {
        return buffer;
      },
    };
  }

  async write(data) {
    const form = new FormData();
    form.append("map_id", String(this.mapId));
    form.append("file", new Blob([data]), this.name);
    const res = await fetch(`/api/maps/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this._getToken()}` },
      body: form,
    });
    if (!res.ok) {
      let message = `Failed to save map ${this.mapId} (HTTP ${res.status})`;
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch {
        // non-JSON body — keep generic message
      }
      throw new Error(message);
    }
  }

  async queryPermission() {
    return "granted";
  }

  async requestPermission() {
    return "granted";
  }

  isSameEntry(other) {
    return !!other && other.mapId === this.mapId;
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/Projects/eomap-js-origin
git add src/web/filesystem/server-file-system-file-handle.js
git commit -m "feat: ServerFileSystemFileHandle (HTTP-backed map read/write)"
```

### Task 7: Server-map dialogs + `ServerFileSystemProvider`

**Files:**
- Create: `~/Projects/eomap-js-origin/src/web/filesystem/server-map-dialog.js`
- Create: `~/Projects/eomap-js-origin/src/web/filesystem/server-file-system-provider.js`

- [ ] **Step 1: Write `server-map-dialog.js` (plain-DOM modals; no Spectrum dependency)**

```js
// Minimal modal overlays for picking a server map id. Deliberately plain DOM
// (not Spectrum) so they are self-contained and version-proof. Cancel rejects
// with an AbortError, which eomap-js's open()/saveAs() already swallow.

function abortError() {
  const e = new Error("The user aborted a request.");
  e.name = "AbortError";
  return e;
}

function overlay() {
  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;" +
    "justify-content:center;background:rgba(0,0,0,0.5);font-family:sans-serif;";
  const panel = document.createElement("div");
  panel.style.cssText =
    "background:#1f2430;color:#e6e6e6;min-width:320px;max-width:90vw;max-height:80vh;" +
    "overflow:auto;border-radius:8px;padding:16px;box-shadow:0 10px 40px rgba(0,0,0,0.5);";
  root.appendChild(panel);
  return { root, panel };
}

export function openServerMapDialog(ids) {
  return new Promise((resolve, reject) => {
    const { root, panel } = overlay();
    const title = document.createElement("h2");
    title.textContent = "Open map from server";
    title.style.cssText = "margin:0 0 12px;font-size:16px;";
    panel.appendChild(title);

    if (ids.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No maps on the server yet.";
      panel.appendChild(empty);
    }

    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;";
    for (const id of ids) {
      const btn = document.createElement("button");
      btn.textContent = String(id);
      btn.style.cssText =
        "padding:4px 10px;border-radius:6px;border:1px solid #3a4150;background:#2a3140;" +
        "color:#e6e6e6;cursor:pointer;";
      btn.addEventListener("click", () => {
        cleanup();
        resolve(id);
      });
      list.appendChild(btn);
    }
    panel.appendChild(list);

    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText =
      "padding:6px 14px;border-radius:6px;border:1px solid #3a4150;background:transparent;" +
      "color:#cbd2dd;cursor:pointer;";
    cancel.addEventListener("click", () => {
      cleanup();
      reject(abortError());
    });
    panel.appendChild(cancel);

    function onKey(e) {
      if (e.key === "Escape") {
        cleanup();
        reject(abortError());
      }
    }
    function cleanup() {
      document.removeEventListener("keydown", onKey);
      root.remove();
    }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(root);
  });
}

export function saveServerMapDialog(existingIds) {
  return new Promise((resolve, reject) => {
    const { root, panel } = overlay();
    const title = document.createElement("h2");
    title.textContent = "Save map to server";
    title.style.cssText = "margin:0 0 12px;font-size:16px;";
    panel.appendChild(title);

    const label = document.createElement("label");
    label.textContent = "Map id (1–32000):";
    label.style.cssText = "display:block;margin-bottom:6px;font-size:13px;color:#cbd2dd;";
    panel.appendChild(label);

    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "32000";
    const next = existingIds.length ? Math.max(...existingIds) + 1 : 1;
    input.value = String(next);
    input.style.cssText =
      "width:120px;padding:6px;border-radius:6px;border:1px solid #3a4150;background:#2a3140;" +
      "color:#e6e6e6;margin-bottom:6px;";
    panel.appendChild(input);

    const warn = document.createElement("p");
    warn.style.cssText = "min-height:16px;margin:6px 0;font-size:12px;color:#e0a64b;";
    panel.appendChild(warn);

    const refreshWarn = () => {
      const v = Number(input.value);
      warn.textContent = existingIds.includes(v) ? `Map ${v} exists — it will be overwritten.` : "";
    };
    input.addEventListener("input", refreshWarn);
    refreshWarn();

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;margin-top:8px;";
    const ok = document.createElement("button");
    ok.textContent = "Save";
    ok.style.cssText =
      "padding:6px 14px;border-radius:6px;border:none;background:#2f7fe0;color:#fff;cursor:pointer;";
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText =
      "padding:6px 14px;border-radius:6px;border:1px solid #3a4150;background:transparent;" +
      "color:#cbd2dd;cursor:pointer;";
    row.appendChild(ok);
    row.appendChild(cancel);
    panel.appendChild(row);

    const submit = () => {
      const v = Number(input.value);
      if (!Number.isInteger(v) || v < 1 || v > 32000) {
        warn.textContent = "Enter an integer between 1 and 32000.";
        return;
      }
      cleanup();
      resolve(v);
    };
    ok.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
    cancel.addEventListener("click", () => {
      cleanup();
      reject(abortError());
    });
    function onKey(e) {
      if (e.key === "Escape") {
        cleanup();
        reject(abortError());
      }
    }
    function cleanup() {
      document.removeEventListener("keydown", onKey);
      root.remove();
    }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(root);
    input.focus();
    input.select();
  });
}
```

- [ ] **Step 2: Write `server-file-system-provider.js`**

```js
import { ServerFileSystemFileHandle } from "./server-file-system-file-handle";
import { openServerMapDialog, saveServerMapDialog } from "./server-map-dialog";

// FileSystemProvider implementation backed by the AIO backend. Maps are picked
// from the server (not the OS file dialog) and saved direct-to-live.
export class ServerFileSystemProvider {
  constructor(getToken) {
    this._getToken = getToken;
  }

  get supported() {
    return true;
  }

  async _listMapIds() {
    const res = await fetch(`/api/maps`, {
      headers: { Authorization: `Bearer ${this._getToken()}` },
    });
    if (!res.ok) {
      throw new Error(`Failed to list maps (HTTP ${res.status})`);
    }
    const body = await res.json();
    return Array.isArray(body.ids) ? body.ids : [];
  }

  async showOpenFilePicker(_options) {
    const ids = await this._listMapIds();
    const mapId = await openServerMapDialog(ids); // rejects AbortError on cancel
    return [new ServerFileSystemFileHandle(this._getToken, mapId)];
  }

  async showSaveFilePicker(_options) {
    const ids = await this._listMapIds();
    const mapId = await saveServerMapDialog(ids); // rejects AbortError on cancel
    return new ServerFileSystemFileHandle(this._getToken, mapId);
  }

  async showDirectoryPicker(_options) {
    throw new Error("Directory picking is not available in the embedded editor.");
  }

  async dataTransferItemToHandle(_dataTransferItem) {
    throw new Error("Drag-and-drop is not available in the embedded editor.");
  }

  serializeHandle(handle) {
    return { mapId: handle.mapId, name: handle.name };
  }

  deserializeHandle(serialized) {
    return new ServerFileSystemFileHandle(this._getToken, serialized.mapId, serialized.name);
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/eomap-js-origin
git add src/web/filesystem/server-map-dialog.js src/web/filesystem/server-file-system-provider.js
git commit -m "feat: ServerFileSystemProvider + plain-DOM server map pickers"
```

### Task 8: Embedded-mode detection + token handshake + entry wiring

**Files:**
- Create: `~/Projects/eomap-js-origin/src/web/server-config.js`
- Modify: `~/Projects/eomap-js-origin/src/web/index.js`

- [ ] **Step 1: Write `server-config.js`**

```js
// Embedded-mode glue. The AIO frontend hosts this build in a same-origin
// iframe and posts the admin token in. We only accept messages from our own
// origin, and we never put the token in a URL.

let _token = null;
const _waiters = [];

export function isEmbedded() {
  return typeof window !== "undefined" && window.parent && window.parent !== window;
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (data && data.type === "aio-auth" && typeof data.token === "string") {
    _token = data.token;
    while (_waiters.length) _waiters.shift()(_token);
  }
});

export function getToken() {
  return _token;
}

// Resolve once a token is available (used to gate the first server call).
export function whenToken() {
  if (_token) return Promise.resolve(_token);
  return new Promise((resolve) => _waiters.push(resolve));
}

// Tell the parent we're ready to receive the token.
export function signalReady() {
  if (isEmbedded()) {
    window.parent.postMessage({ type: "aio-ready" }, window.location.origin);
  }
}
```

- [ ] **Step 2: Wire the provider in `src/web/index.js`**

Replace the contents of `src/web/index.js` with:

```js
import { installApplication, getApplication } from "../core/index";
import { WebFileSystemProvider } from "./filesystem/file-system-provider";
import { ServerFileSystemProvider } from "./filesystem/server-file-system-provider";
import { isEmbedded, getToken, signalReady } from "./server-config";
import { SettingsController } from "../core/controllers/settings-controller";
import { RecentFilesController } from "../core/controllers/recent-files-controller";
import {
  DOMMenuEventSource,
  MenubarController,
} from "../core/controllers/menubar-controller";
import { titleFromMapState } from "../core/util/title-utils";

function setupApplication() {
  const application = installApplication();
  if (isEmbedded()) {
    application.fileSystemProvider = new ServerFileSystemProvider(getToken);
    signalReady();
  } else {
    application.fileSystemProvider = new WebFileSystemProvider();
  }
  application.addEventListener("map-state-changed", (event) => {
    const mapState = event.detail;
    document.title = titleFromMapState(mapState);
  });
}

function setupControllers() {
  let application = getApplication();

  application.settingsController = new SettingsController(application);
  application.recentFilesController = new RecentFilesController(application);
  application.menubarController = new MenubarController(application);

  application.menubarController.addEventSource(
    new DOMMenuEventSource(application),
  );
}

window.addEventListener("DOMContentLoaded", (_event) => {
  setupApplication();
  setupControllers();
});
```

- [ ] **Step 3: Commit**

```bash
cd ~/Projects/eomap-js-origin
git add src/web/server-config.js src/web/index.js
git commit -m "feat: embedded-mode token handshake + provider selection"
```

### Task 9: Webpack publicPath + embedded build script

**Files:**
- Modify: `~/Projects/eomap-js-origin/webpack/web/web.js`
- Modify: `~/Projects/eomap-js-origin/package.json`

- [ ] **Step 1: Set `output.publicPath = "auto"` so assets resolve under `/eomap/`**

In `webpack/web/web.js`, change the `output` block to:

```js
    output: {
      filename: "bundle.min.js",
      path: path.resolve(__dirname, "../../dist/web"),
      publicPath: "auto",
    },
```

- [ ] **Step 2: Add an embedded build script baking the connected-mode URL**

In `package.json`, add to `scripts` (after `dist:web`):

```json
    "dist:web:embedded": "cross-env NODE_ENV=production webpack --config webpack/web/web.js --env FORCE_CONNECTED_MODE_URL=/api/mapper/",
```

- [ ] **Step 3: Build and confirm the connected URL is baked in**

```bash
cd ~/Projects/eomap-js-origin
npm run dist:web:embedded
grep -c "/api/mapper/" dist/web/bundle.min.js   # expect >= 1
ls dist/web/index.html dist/web/bundle.min.js
```

Expected: grep count ≥ 1; both files present.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/eomap-js-origin
git add webpack/web/web.js package.json
git commit -m "build: publicPath auto + dist:web:embedded (connected mode /api/mapper/)"
```

---

## Phase 3 — Frontend: embed + serve the editor

### Task 10: Local build helper + serve the bundle from `public/eomap/`

**Files:**
- Create: `aio-editor/scripts/build-eomap.sh`
- Modify: `aio-editor/.gitignore`

- [ ] **Step 1: Add `public/eomap/` to gitignore (don't commit build artifacts)**

Append to `aio-editor/.gitignore`:

```
# eomap-js fork bundle, copied in at build time (see scripts/build-eomap.sh)
packages/frontend/public/eomap/
```

- [ ] **Step 2: Write `scripts/build-eomap.sh`**

```bash
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
```

- [ ] **Step 3: Make it executable and run it**

```bash
cd ~/Projects/aio-editor
chmod +x scripts/build-eomap.sh
./scripts/build-eomap.sh
ls packages/frontend/public/eomap/index.html packages/frontend/public/eomap/bundle.min.js
```

Expected: both files exist.

- [ ] **Step 4: Commit (script + gitignore only; the bundle is ignored)**

```bash
cd ~/Projects/aio-editor
git add scripts/build-eomap.sh .gitignore
git commit -m "build: scripts/build-eomap.sh copies the fork bundle into public/eomap"
```

### Task 11: `MapEditor` iframe component + AppShell tab

**Files:**
- Create: `aio-editor/packages/frontend/src/maps/MapEditor.tsx`
- Modify: `aio-editor/packages/frontend/src/AppShell.tsx`

- [ ] **Step 1: Write `MapEditor.tsx`**

```tsx
import { useEffect, useRef } from "react";

interface MapEditorProps {
  token: string;
}

/** Hosts the eomap-js fork (served same-origin under /eomap/) in an iframe and
 *  hands it the admin token. The fork posts { type: "aio-ready" } once loaded;
 *  we reply with { type: "aio-auth", token }, both pinned to our own origin. */
export function MapEditor({ token }: MapEditorProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const origin = window.location.origin;

    const sendToken = () => {
      iframeRef.current?.contentWindow?.postMessage({ type: "aio-auth", token }, origin);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      if (event.data?.type === "aio-ready") sendToken();
    };

    window.addEventListener("message", onMessage);
    // Also push on load in case the iframe's ready message raced our listener.
    const iframe = iframeRef.current;
    iframe?.addEventListener("load", sendToken);

    return () => {
      window.removeEventListener("message", onMessage);
      iframe?.removeEventListener("load", sendToken);
    };
  }, [token]);

  return (
    <iframe
      ref={iframeRef}
      src="/eomap/index.html"
      title="Map Editor"
      className="h-full w-full border-0"
    />
  );
}
```

- [ ] **Step 2: Add the tab in `AppShell.tsx`**

Change the `View` type to add the editor:

```ts
type View = "pubs" | "rolls" | "maps" | "mapeditor";
```

Add the import at the top:

```ts
import { MapEditor } from "./maps/MapEditor";
```

Add a `NavTab` after the existing "Maps" tab (inside the `<nav>`):

```tsx
            <NavTab
              active={view === "mapeditor"}
              onClick={() => setView("mapeditor")}
              label="Map Editor"
            />
```

Change the `<main>` body's final branch so the editor renders. Replace the closing ternary tail:

```tsx
        {view === "pubs" ? (
          <RefsProvider token={token} onUnauthorized={onLogout}>
            <PubBrowser token={token} onUnauthorized={onLogout} />
          </RefsProvider>
        ) : view === "rolls" ? (
          <RollSimulator token={token} onUnauthorized={onLogout} />
        ) : view === "maps" ? (
          <MapUploader token={token} onUnauthorized={onLogout} />
        ) : (
          <MapEditor token={token} />
        )}
```

- [ ] **Step 3: Type-check + build**

```bash
cd ~/Projects/aio-editor
npm run typecheck --workspace packages/frontend
npm run build --workspace packages/frontend
```

Expected: both clean.

- [ ] **Step 4: Manual verification (full local stack)**

Start backend (`npm run dev:backend`) and frontend (`npm run dev:frontend`). Ensure `scripts/build-eomap.sh` has populated `public/eomap/`. In the browser:
1. Log in. Click **Map Editor** — the eomap-js UI loads inside the tab, tiles/graphics render (confirms connected-mode GFX over `/api/mapper/*`).
2. **File → Open** shows the server-map picker listing real map ids. Open map 1 → it renders.
3. Paint a tile, **File → Save** → success; reoserv logs `Reloaded map: 1`.
4. **File → New**, then **Save As** → enter an unused id → success; reoserv logs the new map loaded.

Expected: all four succeed. (If GFX is blank, check the browser network tab for `/api/mapper/gfx/gfx003.egf` → 200.)

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/aio-editor
git add packages/frontend/src/maps/MapEditor.tsx packages/frontend/src/AppShell.tsx
git commit -m "feat(frontend): Map Editor tab embeds the eomap-js fork via same-origin iframe"
```

### Task 12: Fix the stale "needs restart" copy in MapUploader

**Files:**
- Modify: `aio-editor/packages/frontend/src/maps/MapUploader.tsx`

- [ ] **Step 1: Update the success banner text**

In `MapUploader.tsx`, replace the `setBanner({ kind: "ok", ... })` block in `onUpload` with:

```tsx
      setBanner({
        kind: "ok",
        text: result.reloaded
          ? `Map ${result.map_id} updated — reoserv hot-reloaded it.`
          : `Map ${result.map_id} created — reoserv hot-loaded the new map.`,
      });
```

- [ ] **Step 2: Update the descriptive paragraph near the top of the form**

Replace the `<p className="text-sm text-slate-400">…</p>` describing upload behavior with:

```tsx
        <p className="text-sm text-slate-400">
          Pick a <code>.emf</code> file and the map id it targets. reoserv
          hot-loads the map on the live server immediately — existing maps
          reload and brand-new map ids load without a restart.
        </p>
```

- [ ] **Step 3: Type-check**

Run: `cd ~/Projects/aio-editor && npm run typecheck --workspace packages/frontend`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd ~/Projects/aio-editor
git add packages/frontend/src/maps/MapUploader.tsx
git commit -m "fix(frontend): correct stale 'needs restart' copy — new maps hot-load"
```

---

## Phase 4 — Deploy

### Task 13: Deploy wiring — fork bundle + map EGF seed

**Files:**
- Modify: `aio-editor/deploy.sh`
- Modify: `aio-editor/.env.deploy.example`

- [ ] **Step 1: Document `EOMAP_FORK_DIR` in `.env.deploy.example`**

Append to `.env.deploy.example`:

```
# Absolute path to the eomap-js fork repo (built + copied into the frontend
# image's /eomap/ at deploy time). Default ~/Projects/eomap-js-origin.
EOMAP_FORK_DIR=
```

- [ ] **Step 2: Build the fork + copy into public/eomap BEFORE the frontend image build**

In `deploy.sh`, immediately **before** the `echo "📦 Building frontend ..."` line, insert:

```bash
echo "🗺️  Building eomap-js fork bundle ..."
EOMAP_FORK_DIR="${EOMAP_FORK_DIR:-$HOME/Projects/eomap-js-origin}" "$SCRIPT_DIR/scripts/build-eomap.sh"
```

(The frontend Docker build copies the repo into context and runs `npm run build --workspace packages/frontend`, which folds `public/eomap/` into `dist/` — so the bundle ships in the nginx image automatically.)

- [ ] **Step 3: Seed the map EGF files into origin-gfx (idempotent, separate from the PNG seed)**

In `deploy.sh`, **after** the existing `if [[ -n "${GFX_SRC:-}" ]]; then … fi` PNG-seed block, insert a second block:

```bash
# ── Map EGF files (one-time seed for the embedded map editor) ──
# eomap-js connected mode needs gfx003/004/005/006/007/022.egf in origin-gfx.
# The PNG seed above only ships the gfxNNN/ preview dirs, so seed the .egf
# files separately. Idempotent: keyed on gfx003.egf already being present.
if [[ -n "${GFX_SRC:-}" ]]; then
  if [[ ! -f "$GFX_SRC/gfx003.egf" ]]; then
    echo "⚠️  GFX_SRC=$GFX_SRC has no gfx003.egf — skipping map EGF seed"
  else
    EGF_STATE=$(ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
      "docker run --rm -v origin-gfx:/v alpine sh -c '[ -f /v/gfx003.egf ] && echo filled || echo empty'")
    if [[ "$EGF_STATE" == "empty" ]]; then
      echo "🗺️  Seeding map EGFs into origin-gfx ..."
      tar -C "$GFX_SRC" -czf /tmp/origin-egf.tgz \
        gfx003.egf gfx004.egf gfx005.egf gfx006.egf gfx007.egf gfx022.egf
      scp -P "$SSH_PORT" /tmp/origin-egf.tgz "${VPS_USER}@${VPS_HOST}:/tmp/origin-egf.tgz"
      ssh -p "$SSH_PORT" "${VPS_USER}@${VPS_HOST}" \
        "docker run --rm -v origin-gfx:/v -v /tmp/origin-egf.tgz:/seed.tgz:ro alpine sh -c 'tar -xzf /seed.tgz -C /v' && rm -f /tmp/origin-egf.tgz"
      rm -f /tmp/origin-egf.tgz
      echo "🗺️  Map EGFs seeded."
    else
      echo "🗺️  Map EGFs already present in origin-gfx — skipping."
    fi
  fi
fi
```

- [ ] **Step 4: Verify the script parses (no execution)**

```bash
cd ~/Projects/aio-editor
bash -n deploy.sh && echo "deploy.sh syntax OK"
bash -n scripts/build-eomap.sh && echo "build-eomap.sh syntax OK"
```

Expected: both "syntax OK".

- [ ] **Step 5: Commit**

```bash
cd ~/Projects/aio-editor
git add deploy.sh .env.deploy.example
git commit -m "deploy: build+ship eomap fork bundle; seed map EGFs into origin-gfx"
```

### Task 14: Production deploy + live smoke

**Files:** none (operational)

- [ ] **Step 1: Ensure `GFX_SRC` + `EOMAP_FORK_DIR` are set in `.env.deploy`**

```bash
cd ~/Projects/aio-editor
grep -E 'GFX_SRC|EOMAP_FORK_DIR' .env.deploy || echo "⚠️ set GFX_SRC (reoserv/data/gfx) and EOMAP_FORK_DIR"
```

Expected: both present (GFX_SRC points at `~/Projects/reoserv/data/gfx`; EOMAP_FORK_DIR at the fork).

- [ ] **Step 2: Deploy**

```bash
cd ~/Projects/aio-editor
./deploy.sh
```

Expected: builds backend + fork + frontend, pushes, seeds map EGFs (first run), recreates containers, prints the deployed URL.

- [ ] **Step 3: Live smoke**

In a browser at `https://<EDITOR_DOMAIN>`: log in → **Map Editor** tab → graphics render → Open a server map → edit a tile → Save → confirm in-game (reoserv hot-reloaded). Also `curl -s -o /dev/null -w '%{http_code}\n' https://<EDITOR_DOMAIN>/api/mapper/gfx/gfx003.egf` → `200`.

- [ ] **Step 4: Update the vault status**

Mark **Sprint 3.3a** done in `~/Documents/TBD/Project Origin/Pub Editor/Documentation/Planning/All In One Editor.md`, link `[[Map editing (eomap-js)]]`, and flip that note's frontmatter `status:` to `shipped`.

---

## Self-review notes

- **Spec coverage:** GFX-via-connected-mode (Tasks 5, 9), no-pub-clash (inherent — no pub loading touched), EMF read/write (eomap-js engine, unchanged), server map browse/open/save/new (Tasks 2,3,6,7), direct-to-live + hot-reload (existing upload route, Task 6 write), same-origin iframe + postMessage token (Tasks 8,11), fork in own repo + bundle copied (Tasks 1,10,13), MapUploader copy fix (Task 12), `.egf` seed (Task 13). All spec components map to a task.
- **Type/name consistency:** `getToken` is a function passed to both `ServerFileSystemProvider` and `ServerFileSystemFileHandle`; the message types `aio-ready` / `aio-auth` match between `MapEditor.tsx` (Task 11) and `server-config.js` (Task 8); the connected URL `/api/mapper/` matches between the build script (Task 9) and the backend routes (Task 5).
- **Known risk:** the server-map pickers are plain-DOM (functional, not Spectrum-styled) — deliberate, to keep the fork seam small and version-proof. Styling polish is a follow-up, not a blocker.
