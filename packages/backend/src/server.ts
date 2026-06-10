import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";

import { registerAuthGuard } from "./auth/verify.js";
import { config } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerGfxRoutes } from "./routes/gfx.js";
import { registerMapRoutes } from "./routes/maps.js";
import { registerPubRoutes } from "./routes/pubs.js";
import { registerSimulateRollRoutes } from "./routes/simulate_roll.js";
import { registerStagingRoutes } from "./routes/staging.js";

async function main() {
  const app = Fastify({
    logger: { level: "info" },
  });

  await app.register(cors, {
    origin: true,
    credentials: false,
  });

  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  await registerAuthRoutes(app);

  // Bearer-token guard for /api/pubs/*, /api/schemas/*, /api/staging/*.
  // /api/health and /api/auth stay public so login + liveness checks don't
  // require a token. /api/gfx/* stays public because the browser's <img>
  // tag can't carry a custom Authorization header — the content is EO
  // client assets (publicly available in any EO install), not business
  // data. The route's path-safety check is independent of auth.
  registerAuthGuard(app, "/api/pubs");
  registerAuthGuard(app, "/api/schemas");
  registerAuthGuard(app, "/api/staging");
  registerAuthGuard(app, "/api/simulate_roll");
  registerAuthGuard(app, "/api/maps");
  await registerPubRoutes(app);
  await registerStagingRoutes(app);
  await registerGfxRoutes(app);
  await registerSimulateRollRoutes(app);
  await registerMapRoutes(app);

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
    app.log.info(`  gfx root:      ${config.gfxRoot ?? "(disabled)"}`);
    app.log.info(`  maps dir:      ${config.mapsDataDir ?? "(disabled)"}`);
  } catch (err) {
    app.log.error({ err }, "failed to start server");
    process.exit(1);
  }
}

main();
