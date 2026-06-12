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
