import "dotenv/config";
import "./config";
import mongoose from "mongoose";
import { logger } from "./lib/logger";
import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { config } from "./config";
import { database } from "./plugins/db";
import { concursos } from "./modules/concursos";
import { sispa } from "./modules/sispa";

function getHealthStatus() {
  const dbConnected = mongoose.connection.readyState === 1;
  return {
    status: dbConnected ? "ok" : "degraded",
    database: dbConnected ? "connected" : "disconnected",
  };
}

const app = new Elysia()
  .use(database)
  .use(openapi())
  .use(
    cors({
      origin: config.cors.origin,
      credentials: true,
    })
  )
  .get("/health", getHealthStatus)
  .use(sispa)
  .use(concursos)
  .listen(3000);

logger.info("Elysia is running", {
  host: app.server?.hostname,
  port: app.server?.port,
});
