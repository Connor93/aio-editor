import type { FastifyInstance } from "fastify";

import {
  StagingNotFoundError,
  discardStaged,
  listStagedFiles,
  pushFile,
  readDiff,
} from "../pubs/staging.js";
import { InvalidPathError } from "../pubs/store.js";

interface FileEntry {
  type: string;
  filename: string;
}

interface PushBody {
  files?: FileEntry[];
  all?: boolean;
}

const SAFE_SEGMENT = /^[A-Za-z0-9_.-]+$/;

function ensureSafeSegments(type: string, filename: string) {
  if (!SAFE_SEGMENT.test(type) || type === "." || type === ".." || type.startsWith(".")) {
    throw new InvalidPathError(`invalid type: ${JSON.stringify(type)}`);
  }
  if (
    !SAFE_SEGMENT.test(filename) ||
    filename === "." ||
    filename === ".." ||
    filename.startsWith(".") ||
    !filename.endsWith(".json")
  ) {
    throw new InvalidPathError(`invalid filename: ${JSON.stringify(filename)}`);
  }
}

export async function registerStagingRoutes(app: FastifyInstance) {
  // List every file currently in the staging tree, regardless of pub type.
  app.get("/api/staging", async () => {
    const files = await listStagedFiles();
    return { files };
  });

  // Return the live + staging content for a single pub file so the frontend
  // can diff them. Both fields can be `null`: live=null for a freshly created
  // staged file; staging=null shouldn't normally happen but is reported
  // rather than 404'd so the UI can render a neutral "no staged changes"
  // state.
  app.get<{ Params: { type: string; filename: string } }>(
    "/api/pubs/:type/:filename/diff",
    async (request, reply) => {
      try {
        const { type, filename } = request.params;
        ensureSafeSegments(type, filename);
        const diff = await readDiff(type, filename);
        return diff;
      } catch (err) {
        return mapError(reply, err);
      }
    }
  );

  // Atomic publish from staging → live. Body shapes:
  //   { files: [{type, filename}, ...] }  — explicit list
  //   { all: true }                       — every staged file
  app.post<{ Body: PushBody }>("/api/staging/push", async (request, reply) => {
    try {
      const { files, all } = request.body ?? {};
      let targets: FileEntry[];
      if (all === true) {
        targets = (await listStagedFiles()).map((f) => ({
          type: f.type,
          filename: f.filename,
        }));
      } else if (Array.isArray(files) && files.length > 0) {
        // Validate each entry up-front. Malformed input should produce a
        // top-level 400 rather than a silent per-file error string in the 207
        // multi-status response.
        for (const f of files) {
          if (
            !f ||
            typeof f !== "object" ||
            typeof f.type !== "string" ||
            typeof f.filename !== "string"
          ) {
            return reply.code(400).send({
              error: "each file entry must be { type: string, filename: string }",
            });
          }
        }
        targets = files;
      } else {
        return reply.code(400).send({
          error: "request body must be { all: true } or { files: [...] }",
        });
      }

      const pushed: FileEntry[] = [];
      const errors: Array<{ type: string; filename: string; message: string }> = [];

      for (const target of targets) {
        try {
          ensureSafeSegments(target.type, target.filename);
          await pushFile(target.type, target.filename);
          pushed.push({ type: target.type, filename: target.filename });
        } catch (err) {
          errors.push({
            type: target.type,
            filename: target.filename,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return reply.code(errors.length === 0 ? 200 : 207).send({ pushed, errors });
    } catch (err) {
      return mapError(reply, err);
    }
  });

  // Discard a staged change without pushing.
  app.delete<{ Params: { type: string; filename: string } }>(
    "/api/staging/:type/:filename",
    async (request, reply) => {
      try {
        const { type, filename } = request.params;
        ensureSafeSegments(type, filename);
        await discardStaged(type, filename);
        return reply.code(204).send();
      } catch (err) {
        return mapError(reply, err);
      }
    }
  );
}

function mapError(reply: import("fastify").FastifyReply, err: unknown) {
  if (err instanceof StagingNotFoundError) {
    return reply.code(404).send({ error: err.message });
  }
  if (err instanceof InvalidPathError) {
    return reply.code(400).send({ error: err.message });
  }
  reply.log.error({ err }, "staging route handler failed");
  return reply.code(500).send({ error: "internal error" });
}
