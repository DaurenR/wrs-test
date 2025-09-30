import Fastify from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { router } from "./modules/http/router.js";
import { logger } from "./modules/utils/logger.js";
import dotenv from "dotenv";

dotenv.config();

const app = Fastify({ logger });

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, {
  max: Number(process.env.RATE_LIMIT_MAX ?? 120),
  timeWindow: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
});
await app.register(router, { prefix: "/robots" });

const PORT = Number(process.env.PORT ?? 3000);
app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => app.log.info(`Service up on http://localhost:${PORT}`))
  .catch((err) => {
    app.log.error(err, "Failed to start");
    process.exit(1);
  });
