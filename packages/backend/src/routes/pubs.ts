import type { FastifyInstance } from "fastify";

import {
  InvalidPathError,
  PubNotFoundError,
  listPubFiles,
  listPubTypes,
  readPubFile,
  writePubFile,
} from "../pubs/store.js";

interface TypeFileParams {
  type: string;
  filename: string;
}

interface WriteBody {
  content?: string;
}

export async function registerPubRoutes(app: FastifyInstance) {
  app.get("/api/pubs/types", async () => {
    const types = await listPubTypes();
    return { types };
  });

  app.get<{ Params: { type: string } }>(
    "/api/pubs/:type",
    async (request, reply) => {
      try {
        const files = await listPubFiles(request.params.type);
        return { files };
      } catch (err) {
        return mapError(reply, err);
      }
    }
  );

  app.get<{ Params: TypeFileParams }>(
    "/api/pubs/:type/:filename",
    async (request, reply) => {
      try {
        const { type, filename } = request.params;
        const file = await readPubFile(type, filename);
        return {
          type,
          filename,
          source: file.source,
          staged: file.staged,
          content: file.content,
        };
      } catch (err) {
        return mapError(reply, err);
      }
    }
  );

  app.put<{ Params: TypeFileParams; Body: WriteBody }>(
    "/api/pubs/:type/:filename",
    async (request, reply) => {
      try {
        const { type, filename } = request.params;
        const { content } = request.body ?? {};
        if (typeof content !== "string") {
          return reply
            .code(400)
            .send({ error: "request body must be { content: string }" });
        }
        await writePubFile(type, filename, content);
        return reply.code(204).send();
      } catch (err) {
        return mapError(reply, err);
      }
    }
  );
}

function mapError(reply: import("fastify").FastifyReply, err: unknown) {
  if (err instanceof InvalidPathError) {
    return reply.code(400).send({ error: err.message });
  }
  if (err instanceof PubNotFoundError) {
    return reply.code(404).send({ error: err.message });
  }
  reply.log.error({ err }, "pub route handler failed");
  return reply.code(500).send({ error: "internal error" });
}
