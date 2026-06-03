import type { FastifyInstance } from "fastify";

import { config } from "../config.js";

interface AuthRequestBody {
  username?: string;
  password?: string;
}

interface ReoservAuthResponse {
  token: string;
  expires_at: string;
}

interface ReoservErrorResponse {
  error: string;
}

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: AuthRequestBody }>("/api/auth", async (request, reply) => {
    const { username, password } = request.body ?? {};

    if (!username || !password) {
      return reply.code(400).send({ error: "username and password are required" });
    }

    let upstream: Response;
    try {
      upstream = await fetch(`${config.reoservBaseUrl}/admin/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch (err) {
      request.log.error({ err }, "failed to reach REOSERV /admin/auth");
      return reply.code(502).send({ error: "auth upstream unavailable" });
    }

    if (upstream.status === 200) {
      const body = (await upstream.json()) as ReoservAuthResponse;
      return reply.code(200).send({
        token: body.token,
        expiresAt: body.expires_at,
      });
    }

    const text = await upstream.text();
    let message = text;
    try {
      const parsed = JSON.parse(text) as ReoservErrorResponse;
      message = parsed.error ?? text;
    } catch {
      // upstream returned non-JSON; pass through raw text
    }

    return reply.code(upstream.status).send({ error: message });
  });
}
