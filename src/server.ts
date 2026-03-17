import "dotenv/config";
import "./config";
import mongoose from "mongoose";
import { Logger, logger } from "./lib/logger";
import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { config } from "./config";
import { setServerRef } from "./lib/server-ref";
import { auth } from "./modules/auth";
import { concursos } from "./modules/concursos";
import { sispa } from "./modules/sispa";

async function connectDatabase() {
  try {
    await mongoose.connect(config.database.url);
    logger.info("Connected to MongoDB");
  } catch (error) {
    logger.error("Failed to connect to MongoDB", { error });
    process.exit(1);
  }
}

function getHealthStatus() {
  const dbConnected = mongoose.connection.readyState === 1;
  return {
    status: dbConnected ? "ok" : "degraded",
    database: dbConnected ? "connected" : "disconnected",
  };
}

const app = new Elysia()
  .decorate("logger", new Logger())
  .derive(({ request }) => {
    const h = request.headers.get("authorization");
    return { bearerToken: h?.startsWith("Bearer ") ? h.slice(7) : null };
  })
  .use(openapi())
  .use(
    cors({
      origin: config.cors.origin,
      credentials: true,
    })
  )
  .get("/health", getHealthStatus)
  .use(auth)
  .use(sispa)
  .use(concursos);

await connectDatabase();

const server = Bun.serve({
  port: config.port,
  fetch: async (req) => {
    const start = Date.now();
    const res = await app.fetch(req);
    logger.http(req, res, Date.now() - start);
    return res;
  },
});
setServerRef(server);

logger.info("Elysia is running", {
  host: server.hostname,
  port: server.port,
});
