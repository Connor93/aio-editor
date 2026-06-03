import cors from "@fastify/cors";
import Fastify from "fastify";

import { config } from "./config.js";
import { registerAuthRoutes } from "./routes/auth.js";

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

  try {
    await app.listen({ port: config.port, host: config.host });
    app.log.info(
      `aio-editor backend listening at http://${config.host}:${config.port} (proxying auth to ${config.reoservBaseUrl})`
    );
  } catch (err) {
    app.log.error({ err }, "failed to start server");
    process.exit(1);
  }
}

main();
