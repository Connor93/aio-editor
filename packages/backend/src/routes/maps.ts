import type { FastifyInstance, FastifyReply } from "fastify";

import { config } from "../config.js";
import { InvalidMapError, clampMapId, listMapIds, writeMap } from "../maps/store.js";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

function mapError(reply: FastifyReply, err: unknown) {
  if (err instanceof InvalidMapError) {
    return reply.code(400).send({ error: err.message });
  }
  // @fastify/multipart throws this code when a file exceeds the size limit.
  if (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE"
  ) {
    return reply.code(413).send({ error: `file exceeds ${MAX_UPLOAD_BYTES} bytes` });
  }
  reply.log.error({ err }, "maps route handler failed");
  return reply.code(500).send({ error: "internal error" });
}

export async function registerMapRoutes(app: FastifyInstance) {
  // List the map ids currently on disk.
  app.get("/api/maps", async (_request, reply) => {
    if (!config.mapsDataDir) {
      return reply.code(503).send({ error: "MAPS_DATA_DIR not configured on the backend" });
    }
    const ids = await listMapIds();
    return { ids };
  });

  // Upload a .emf for a given map id. Multipart form: field "map_id" + file "file".
  app.post("/api/maps/upload", async (request, reply) => {
    if (!config.mapsDataDir) {
      return reply.code(503).send({ error: "MAPS_DATA_DIR not configured on the backend" });
    }
    try {
      let mapIdRaw: string | null = null;
      let fileBuffer: Buffer | null = null;

      for await (const part of request.parts()) {
        if (part.type === "field" && part.fieldname === "map_id") {
          mapIdRaw = String(part.value);
        } else if (part.type === "file" && part.fieldname === "file") {
          fileBuffer = await part.toBuffer();
        } else if (part.type === "file") {
          // Drain any unexpected file part so the request can complete.
          await part.toBuffer();
        }
      }

      if (fileBuffer === null) {
        return reply.code(400).send({ error: "missing file part 'file'" });
      }
      if (mapIdRaw === null) {
        return reply.code(400).send({ error: "missing field 'map_id'" });
      }

      const mapId = clampMapId(mapIdRaw);
      const result = await writeMap(mapId, fileBuffer);
      return reply.code(200).send({ map_id: result.mapId, reloaded: result.reloaded });
    } catch (err) {
      return mapError(reply, err);
    }
  });
}
