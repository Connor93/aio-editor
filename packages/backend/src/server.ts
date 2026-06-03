import cors from "@fastify/cors";
import Fastify from "fastify";

import { registerAuthGuard } from "./auth/verify.js";
import { config } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerPubRoutes } from "./routes/pubs.js";

async function main() {
  const app = Fastify({
    logger: { level: "info" },
  });

  await app.register(cors, {
    origin: true,
    credentials: false,
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  await registerAuthRoutes(app);

  // Bearer-token guard for everything under /api/pubs/*; /api/health and
  // /api/auth stay public so login + liveness checks don't require a token.
  registerAuthGuard(app, "/api/pubs");
  await registerPubRoutes(app);

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      `aio-editor backend listening at http://${config.host}:${config.port}`
    );
    app.log.info(
      `  auth upstream: ${config.reoservBaseUrl}`
    );
    app.log.info(`  pub data:      ${config.pubDataDir}`);
    app.log.info(`  staging:       ${config.stagingDir}`);
  } catch (err) {
    app.log.error({ err }, "failed to start server");
    process.exit(1);
  }
}

main();
