import type { FastifyInstance } from "fastify";

import { config } from "../config.js";

interface ComputeNpcStatsBody {
  level?: number;
  hp_multiplier?: number;
  damage_multiplier?: number;
  exp_multiplier?: number;
}

export async function registerComputeNpcStatsRoutes(app: FastifyInstance) {
  app.post<{ Body: ComputeNpcStatsBody }>(
    "/api/compute_npc_stats",
    async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.code(401).send({ error: "missing authorization header" });
      }

      let upstream: Response;
      try {
        upstream = await fetch(
          `${config.reoservBaseUrl}/admin/compute_npc_stats`,
          {
            method: "POST",
            headers: {
              Authorization: authHeader,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(request.body ?? {}),
          }
        );
      } catch (err) {
        request.log.error(
          { err },
          "failed to reach REOSERV /admin/compute_npc_stats"
        );
        return reply
          .code(502)
          .send({ error: "compute_npc_stats upstream unavailable" });
      }

      const text = await upstream.text();
      reply.code(upstream.status);
      try {
        return reply.send(JSON.parse(text));
      } catch {
        return reply.send({ error: text });
      }
    }
  );
}
