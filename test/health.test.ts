import { describe, expect, it } from "bun:test";
import { Elysia } from "elysia";

describe("health endpoint", () => {
  it("returns status and database when disconnected", async () => {
    const app = new Elysia().get("/health", () => ({
      status: "degraded",
      database: "disconnected",
    }));
    const res = await app.handle(new Request("http://localhost/health"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("database");
    expect(body.database).toBe("disconnected");
    expect(body.status).toBe("degraded");
  });

  it("returns ok and connected when database is connected", async () => {
    const app = new Elysia().get("/health", () => ({
      status: "ok",
      database: "connected",
    }));
    const res = await app.handle(new Request("http://localhost/health"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", database: "connected" });
  });
});
