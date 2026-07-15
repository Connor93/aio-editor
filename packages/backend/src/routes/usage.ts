import type { FastifyInstance } from "fastify";

import { config } from "../config.js";

export async function registerUsageRoutes(app: FastifyInstance) {
  app.get("/api/usage", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.code(401).send({ error: "missing authorization header" });
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${config.reoservBaseUrl}/admin/usage`, {
        method: "GET",
        headers: { Authorization: authHeader },
      });
    } catch (err) {
      request.log.error({ err }, "failed to reach REOSERV /admin/usage");
      return reply.code(502).send({ error: "usage upstream unavailable" });
    }

    const text = await upstream.text();
    reply.code(upstream.status);
    try {
      return reply.send(JSON.parse(text));
    } catch {
      return reply.send({ error: text });
    }
  });
}
