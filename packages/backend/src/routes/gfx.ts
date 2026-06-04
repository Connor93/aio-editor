import { createReadStream, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
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
 *
 *  `graphicIdFor` is the inverse: given a raw resource_id from the
 *  directory listing, return the graphic_id IFF the file represents a
 *  "first frame" for the category (preview-canonical), else null. The
 *  picker endpoint uses this to walk the directory and surface only one
 *  entry per pub-level graphic.
 */
interface CategorySpec {
  fileId: number;
  resourceIdFor: (graphicId: number) => number;
  graphicIdFor: (resourceId: number) => number | null;
}
const CATEGORIES: Record<string, CategorySpec> = {
  items: {
    fileId: 23,
    resourceIdFor: (g) => 100 + g * 2,
    // Items: shown sprites are even resource ids >= 102 (odd ones are shadows).
    graphicIdFor: (r) => {
      if (r < 102 || r % 2 !== 0) return null;
      return (r - 100) / 2;
    },
  },
  npcs: {
    fileId: 21,
    resourceIdFor: (g) => 100 + (g - 1) * 40 + 1,
    // NPCs: frame 1 lives at resource_id = 101 + (g-1) * 40.
    graphicIdFor: (r) => {
      if (r < 101) return null;
      if ((r - 101) % 40 !== 0) return null;
      return (r - 101) / 40 + 1;
    },
  },
  spells: {
    fileId: 24,
    resourceIdFor: (g) => 100 + (g - 1) * 3 + 1,
    // Spells: frame 1 lives at resource_id = 101 + (g-1) * 3.
    graphicIdFor: (r) => {
      if (r < 101) return null;
      if ((r - 101) % 3 !== 0) return null;
      return (r - 101) / 3 + 1;
    },
  },
  spell_icons: {
    fileId: 25,
    resourceIdFor: (g) => 100 + g,
    // Spell icons: 1:1 mapping starting at resource_id 101.
    graphicIdFor: (r) => {
      if (r < 101) return null;
      return r - 100;
    },
  },
};

const SAFE_CATEGORY = /^[a-z_]+$/;

export async function registerGfxRoutes(app: FastifyInstance) {
  // List every available graphic for a category. Walks the gfxNNN/
  // directory, applies the category's inverse formula to keep only the
  // canonical "first frame" per graphic_id, and returns sorted entries.
  app.get<{ Params: { category: string } }>(
    "/api/gfx/:category",
    async (request, reply) => {
      if (!config.gfxRoot) {
        return reply.code(503).send({ error: "GFX_ROOT not configured on the backend" });
      }
      const { category } = request.params;
      if (!SAFE_CATEGORY.test(category)) {
        return reply.code(400).send({ error: "invalid category" });
      }
      const spec = CATEGORIES[category];
      if (spec === undefined) {
        return reply.code(404).send({ error: "unknown gfx category" });
      }

      const dirName = `gfx${String(spec.fileId).padStart(3, "0")}`;
      const dirPath = resolvePath(config.gfxRoot, dirName);
      if (!existsSync(dirPath)) {
        return reply.code(404).send({ error: "gfx directory not found" });
      }

      const entries = await readdir(dirPath);
      const graphics: Array<{ graphic_id: number; resource_id: number }> = [];
      for (const entry of entries) {
        const match = /^(\d+)\.png$/.exec(entry);
        if (!match) continue;
        const resourceId = Number(match[1]);
        const graphicId = spec.graphicIdFor(resourceId);
        if (graphicId === null || graphicId < 1) continue;
        graphics.push({ graphic_id: graphicId, resource_id: resourceId });
      }
      graphics.sort((a, b) => a.graphic_id - b.graphic_id);
      return { graphics };
    }
  );

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
