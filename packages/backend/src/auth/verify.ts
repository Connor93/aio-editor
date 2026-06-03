import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { config } from "../config.js";

declare module "fastify" {
  interface FastifyRequest {
    accountId?: number;
  }
}

interface VerifyResponse {
  account_id: number;
}

async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.toLowerCase().startsWith("bearer ")) {
    reply.code(401).send({ error: "missing or malformed authorization header" });
    return;
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${config.reoservBaseUrl}/admin/verify`, {
      method: "POST",
      headers: { Authorization: header },
    });
  } catch (err) {
    request.log.error({ err }, "failed to reach REOSERV /admin/verify");
    reply.code(502).send({ error: "auth upstream unavailable" });
    return;
  }

  if (upstream.status === 200) {
    const body = (await upstream.json()) as VerifyResponse;
    request.accountId = body.account_id;
    return;
  }

  // Only forward 401 verbatim. Any other non-200 is an upstream-side problem
  // (DB error, REOSERV bug) — surface as 502 so the editor frontend doesn't
  // log the user out on a transient backend failure.
  if (upstream.status === 401) {
    reply.code(401).send({ error: "invalid or expired token" });
    return;
  }

  request.log.error(
    { upstreamStatus: upstream.status },
    "unexpected non-401 response from REOSERV /admin/verify"
  );
  reply.code(502).send({ error: "auth upstream error" });
}

export function registerAuthGuard(app: FastifyInstance, urlPrefix: string) {
  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith(urlPrefix)) return;
    await requireAuth(request, reply);
  });
}
