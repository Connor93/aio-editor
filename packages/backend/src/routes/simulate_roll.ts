import type { FastifyInstance } from "fastify";

import { config } from "../config.js";

interface SimulateRollBody {
  item_level?: number;
  rarity?: "common" | "rare" | "epic" | "legendary";
  count?: number;
}

export async function registerSimulateRollRoutes(app: FastifyInstance) {
  app.post<{ Body: SimulateRollBody }>(
    "/api/simulate_roll",
    async (request, reply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply
          .code(401)
          .send({ error: "missing authorization header" });
      }

      let upstream: Response;
      try {
        upstream = await fetch(`${config.reoservBaseUrl}/admin/simulate_roll`, {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request.body ?? {}),
        });
      } catch (err) {
        request.log.error({ err }, "failed to reach REOSERV /admin/simulate_roll");
        return reply.code(502).send({ error: "simulate_roll upstream unavailable" });
      }

      const text = await upstream.text();
      reply.code(upstream.status);
      // Forward the JSON response as-is; REOSERV already returns valid JSON.
      try {
        return reply.send(JSON.parse(text));
      } catch {
        return reply.send({ error: text });
      }
    }
  );
}
