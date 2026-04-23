import "dotenv/config";
import "./config";
import mongoose from "mongoose";
import { captureException, initErrorTracker, isErrorTrackerEnabled } from "./lib/error-tracker";
import { getCurrentRequestId, logger, runWithLogContext, serializeUnknownError } from "./lib/logger";
import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { config } from "./config";
import { setServerRef } from "./lib/server-ref";
import { auth } from "./modules/auth";
import { judges } from "./modules/judges";
import { eventManagers } from "./modules/eventManagers";
import { concursos } from "./modules/concursos";
import { sispa } from "./modules/sispa";

initErrorTracker({
  dsn: config.sentry.dsn,
  environment: config.sentry.environment,
  release: config.sentry.release,
});

if (isErrorTrackerEnabled()) {
  process.on("unhandledRejection", (reason) => {
    captureException(reason, { tags: { source: "process", type: "unhandledRejection" } });
  });
  process.on("uncaughtException", (error) => {
    captureException(error, { tags: { source: "process", type: "uncaughtException" } });
  });
}

async function connectDatabase() {
  try {
    await mongoose.connect(config.database.url);
    logger.info("Connected to MongoDB");
  } catch (error) {
    logger.logError("Failed to connect to MongoDB", error);
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
  .decorate("logger", logger)
  .onError(({ code, error, request, path }) => {
    const requestId = getCurrentRequestId();
    const payload = {
      elysiaCode: String(code),
      method: request.method,
      path,
      error: serializeUnknownError(error),
    };
    const clientFault = (() => {
      switch (code) {
        case "VALIDATION":
        case "NOT_FOUND":
        case "INVALID_COOKIE_SIGNATURE":
        case "INVALID_FILE_TYPE":
        case "PARSE":
          return true;
        default:
          if (typeof code === "number" && code < 500) return true;
          return false;
      }
    })();
    if (clientFault) {
      if (code === "NOT_FOUND") {
        logger.debug("Not found", { path, method: request.method });
      } else {
        logger.warn("Request error", payload);
      }
    } else {
      logger.error("Request error", payload);
      captureException(error, {
        requestId,
        tags: {
          source: "elysia",
          code: String(code),
          method: request.method,
          path,
        },
      });
    }
  })
  .use(openapi())
  .use(
    cors({
      origin: config.cors.origin,
      credentials: true,
    })
  )
  .get("/health", getHealthStatus)
  .get("/debug/sentry-test", ({ set }) => {
    if (process.env.SENTRY_DEBUG_ROUTE !== "true") {
      set.status = 404;
      return "Not found";
    }
    throw new Error("Bugsink/Sentry connectivity test (expected)");
  })
  .use(auth)
  .use(judges)
  .use(eventManagers)
  .use(sispa)
  .use(concursos);

await connectDatabase();

const server = Bun.serve({
  port: config.port,
  fetch: async (req) => {
    const incoming = req.headers.get("x-request-id")?.trim();
    const requestId = incoming && incoming.length > 0 ? incoming : crypto.randomUUID();
    return runWithLogContext({ requestId }, async () => {
      const start = Date.now();
      const res = await app.fetch(req);
      const headers = new Headers(res.headers);
      headers.set("x-request-id", requestId);
      const out = new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers,
      });
      logger.http(req, out, Date.now() - start);
      return out;
    });
  },
});
setServerRef(server);

logger.info("Elysia is running", {
  host: server.hostname,
  port: server.port,
});
