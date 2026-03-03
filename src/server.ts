import "dotenv/config";
import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { database } from "./plugins/db";
import { auth } from "./modules/auth";

const app = new Elysia()
  .use(database)
  .use(openapi())
  .use(cors())
  .get("/health", () => ({ status: "ok" }))
  .use(auth)
  .listen(3000);

console.log(
  `Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
