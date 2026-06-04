import { createReadStream, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import type { FastifyInstance } from "fastify";

import { config } from "../config.js";

/** EO GFX category → numeric file id (matches eolib's GfxType). Each
 *  category maps to a `gfxNNN/` directory of pre-extracted PNGs. */
const CATEGORY_TO_FILE_ID: Record<string, number> = {
  npcs: 21,
  items: 23,
  spells: 24,
  spell_icons: 25,
};

const SAFE_CATEGORY = /^[a-z_]+$/;

/**
 * eolib's `useItemGfx`: `resourceId = 100 + graphicId * 2` (the shown sprite;
 * the shadow is at `+ - 1`). Same shape for items / spells / spell-icons in
 * eoweb. We don't expose the shadow variant today — designers picking an item
 * graphic want the foreground sprite.
 */
function resourceIdFor(graphicId: number): number {
  return 100 + graphicId * 2;
}

export async function registerGfxRoutes(app: FastifyInstance) {
  app.get<{ Params: { category: string; graphicId: string } }>(
    "/api/gfx/:category/:graphicId",
    async (request, reply) => {
      if (!config.gfxRoot) {
        return reply
          .code(503)
          .send({ error: "GFX_ROOT not configured on the backend" });
      }

      const { category, graphicId: graphicIdRaw } = request.params;
      if (!SAFE_CATEGORY.test(category)) {
        return reply.code(400).send({ error: "invalid category" });
      }
      const fileId = CATEGORY_TO_FILE_ID[category];
      if (fileId === undefined) {
        return reply.code(404).send({ error: "unknown gfx category" });
      }

      const graphicId = Number(graphicIdRaw);
      if (!Number.isFinite(graphicId) || !Number.isInteger(graphicId) || graphicId < 0) {
        return reply.code(400).send({ error: "graphicId must be a non-negative integer" });
      }
      if (graphicId === 0) {
        // 0 commonly means "no graphic" in REOSERV pubs. No point hitting disk.
        return reply.code(404).send({ error: "no graphic" });
      }

      const resourceId = resourceIdFor(graphicId);
      const dirName = `gfx${String(fileId).padStart(3, "0")}`;
      const pngPath = resolvePath(config.gfxRoot, dirName, `${resourceId}.png`);

      // Defensive: the resolved path must stay inside GFX_ROOT.
      const gfxRoot = resolvePath(config.gfxRoot);
      if (!pngPath.startsWith(gfxRoot + "/")) {
        return reply.code(400).send({ error: "path escapes gfx root" });
      }

      if (!existsSync(pngPath)) {
        return reply.code(404).send({ error: "graphic not found" });
      }

      reply.header("Content-Type", "image/png");
      reply.header("Cache-Control", "public, max-age=3600");
      return reply.send(createReadStream(pngPath));
    }
  );
}
