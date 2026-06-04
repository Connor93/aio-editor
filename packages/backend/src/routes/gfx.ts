import { createReadStream, existsSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

import type { FastifyInstance } from "fastify";

import { config } from "../config.js";

/** EO GFX category → { numeric file id matching eolib's GfxType, formula
 *  mapping a pub-level graphic_id to the underlying on-disk sprite index
 *  inside the gfxNNN/ directory. All extracted PNGs share a +100 base
 *  offset (the PE-format DIBs in the original .egf files start their
 *  resource ids at 100), so every formula here folds that constant in:
 *    - items:       100 + graphic_id * 2     (shown sprite; shadow at -1)
 *    - npcs:        100 + (graphic_id - 1) * 40 + 1  — 18 frames per NPC at a
 *                                                     40-frame stride; +1 = idle
 *    - spells:      100 + (graphic_id - 1) * 3 + 1   — 3 frames per spell
 *                                                     graphic; +1 = frame 1
 *    - spell_icons: 100 + icon_id            (single sprite per icon)
 */
interface CategorySpec {
  fileId: number;
  resourceIdFor: (graphicId: number) => number;
}
const CATEGORIES: Record<string, CategorySpec> = {
  items: {
    fileId: 23,
    resourceIdFor: (g) => 100 + g * 2,
  },
  npcs: {
    fileId: 21,
    resourceIdFor: (g) => 100 + (g - 1) * 40 + 1,
  },
  spells: {
    fileId: 24,
    resourceIdFor: (g) => 100 + (g - 1) * 3 + 1,
  },
  spell_icons: {
    fileId: 25,
    resourceIdFor: (g) => 100 + g,
  },
};

const SAFE_CATEGORY = /^[a-z_]+$/;

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
      const spec = CATEGORIES[category];
      if (spec === undefined) {
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

      const resourceId = spec.resourceIdFor(graphicId);
      const dirName = `gfx${String(spec.fileId).padStart(3, "0")}`;
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
