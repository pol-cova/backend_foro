import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { auth } from "../src/modules/auth";
import { judges } from "../src/modules/judges";
import { eventManagers } from "../src/modules/eventManagers";
import { concursos } from "../src/modules/concursos";
import { ConcursoModel } from "../src/modules/concursos/mongoose";
import { UserModel } from "../src/modules/auth/mongoose";
import { JudgeModel } from "../src/modules/judges/mongoose";
import { EventManagerAssignmentModel } from "../src/modules/eventManagers/mongoose";
import { connectMongoMemoryReplSet, stopMongoMemoryReplSet } from "./mongo-memory-replset";

const app = new Elysia().use(auth).use(judges).use(eventManagers).use(concursos);

beforeAll(async () => {
  await connectMongoMemoryReplSet();
});

beforeEach(async () => {
  await ConcursoModel.deleteMany({});
  await UserModel.deleteMany({});
  await JudgeModel.deleteMany({});
  await EventManagerAssignmentModel.deleteMany({});
});

afterAll(async () => {
  await stopMongoMemoryReplSet();
});

let counter = 0;
function nextId(prefix: string) {
  return `${prefix}-${++counter}`;
}

async function createAdmin(codigo?: string) {
  const c = codigo ?? nextId("admin");
  const admin = await UserModel.create({ codigo: c, nombre: "Admin", role: "admin" });
  const loginRes = await app.handle(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: c, password: "any" }),
    })
  );
  const body = (await loginRes.json()) as { token: string };
  return { admin, token: body.token };
}

async function createEvent(adminToken?: string) {
  const { token } = adminToken ? { token: adminToken } : await createAdmin();
  const res = await app.handle(
    new Request("http://localhost/concursos", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        nombre: "Test Event",
        cupo: 10,
        constraints: [{ id: "modalidad_individual", fields: ["descripcion"] }],
        niveles: ["N/A"],
        allowMultiple: false,
      }),
    })
  );
  if (res.status !== 201) {
    const text = await res.text();
    throw new Error(`Expected 201 from POST /concursos, got ${res.status}: ${text}`);
  }
  const body = (await res.json()) as { _id: string };
  return { eventId: body._id, adminToken: token };
}

describe("RBAC — Judges", () => {
  it("admin can create a judge and get a one-time PIN", async () => {
    const { eventId, adminToken } = await createEvent();

    const res = await app.handle(
      new Request("http://localhost/judges", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ codigo: nextId("judge"), nombre: "Judge One", eventoId: eventId }),
      })
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as { codigo: string; nombre: string; eventoId: string; pin: string };
    expect(body.pin).toBeDefined();
    expect(body.pin.length).toBe(5);
  });

  it("judge can login with codigo + PIN", async () => {
    const { eventId, adminToken } = await createEvent();
    const judgeCodigo = nextId("judge");

    const createRes = await app.handle(
      new Request("http://localhost/judges", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ codigo: judgeCodigo, nombre: "Judge One", eventoId: eventId }),
      })
    );
    const { pin } = (await createRes.json()) as { pin: string };

    const loginRes = await app.handle(
      new Request("http://localhost/auth/login/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: judgeCodigo, pin }),
      })
    );

    expect(loginRes.status).toBe(200);
    const body = (await loginRes.json()) as { token: string; role: string };
    expect(body.role).toBe("judge");
    expect(body.token).toBeDefined();
  });

  it("judge can view their assigned event", async () => {
    const { eventId, adminToken } = await createEvent();
    const judgeCodigo = nextId("judge");

    const createRes = await app.handle(
      new Request("http://localhost/judges", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ codigo: judgeCodigo, nombre: "Judge One", eventoId: eventId }),
      })
    );
    const { pin } = (await createRes.json()) as { pin: string };

    const loginRes = await app.handle(
      new Request("http://localhost/auth/login/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: judgeCodigo, pin }),
      })
    );
    const { token } = (await loginRes.json()) as { token: string };

    const eventRes = await app.handle(
      new Request(`http://localhost/concursos/${eventId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    );

    expect(eventRes.status).toBe(200);
  });

  it("judge gets 403 for a different event", async () => {
    const { eventId, adminToken } = await createEvent();
    const otherEvent = await createEvent(adminToken);
    const judgeCodigo = nextId("judge");

    const createRes = await app.handle(
      new Request("http://localhost/judges", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ codigo: judgeCodigo, nombre: "Judge One", eventoId: eventId }),
      })
    );
    const { pin } = (await createRes.json()) as { pin: string };

    const loginRes = await app.handle(
      new Request("http://localhost/auth/login/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: judgeCodigo, pin }),
      })
    );
    const { token } = (await loginRes.json()) as { token: string };

    const eventRes = await app.handle(
      new Request(`http://localhost/concursos/${otherEvent.eventId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    );

    expect(eventRes.status).toBe(403);
  });

  it("admin can reset judge PIN", async () => {
    const { eventId, adminToken } = await createEvent();
    const judgeCodigo = nextId("judge");

    await app.handle(
      new Request("http://localhost/judges", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ codigo: judgeCodigo, nombre: "Judge One", eventoId: eventId }),
      })
    );

    const resetRes = await app.handle(
      new Request(`http://localhost/judges/${judgeCodigo}/reset-pin`, {
        method: "PATCH",
        headers: { authorization: `Bearer ${adminToken}` },
      })
    );

    expect(resetRes.status).toBe(200);
    const body = (await resetRes.json()) as { pin: string };
    expect(body.pin).toBeDefined();
    expect(body.pin.length).toBe(5);
  });
});

describe("RBAC — Event Managers", () => {
  it("event manager can view assigned event", async () => {
    const { eventId, adminToken } = await createEvent();
    const managerCodigo = nextId("manager");

    await UserModel.create({ codigo: managerCodigo, nombre: "Manager One", role: "eventManager" });
    await app.handle(
      new Request("http://localhost/event-managers/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ managerCodigo, eventoId: eventId }),
      })
    );

    const loginRes = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: managerCodigo, password: "any" }),
      })
    );
    const { token } = (await loginRes.json()) as { token: string };

    const eventRes = await app.handle(
      new Request(`http://localhost/concursos/${eventId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    );

    expect(eventRes.status).toBe(200);
  });

  it("event manager gets 403 for unassigned event", async () => {
    const { eventId, adminToken } = await createEvent();
    const otherEvent = await createEvent(adminToken);
    const managerCodigo = nextId("manager");

    await UserModel.create({ codigo: managerCodigo, nombre: "Manager One", role: "eventManager" });
    await app.handle(
      new Request("http://localhost/event-managers/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ managerCodigo, eventoId: eventId }),
      })
    );

    const loginRes = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: managerCodigo, password: "any" }),
      })
    );
    const { token } = (await loginRes.json()) as { token: string };

    const eventRes = await app.handle(
      new Request(`http://localhost/concursos/${otherEvent.eventId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    );

    expect(eventRes.status).toBe(403);
  });

  it("event manager gets 403 trying to create an event", async () => {
    const { adminToken } = await createEvent();
    const managerCodigo = nextId("manager");

    await UserModel.create({ codigo: managerCodigo, nombre: "Manager One", role: "eventManager" });
    const loginRes = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: managerCodigo, password: "any" }),
      })
    );
    const { token } = (await loginRes.json()) as { token: string };

    const createRes = await app.handle(
      new Request("http://localhost/concursos", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nombre: "Forbidden Event",
          cupo: 10,
          constraints: [{ id: "modalidad_individual", fields: ["descripcion"] }],
          niveles: ["N/A"],
          allowMultiple: false,
        }),
      })
    );

    expect(createRes.status).toBe(403);
  });
});

describe("RBAC — Admin retains full access", () => {
  it("admin can create, update, delete events", async () => {
    const { eventId, adminToken } = await createEvent();

    const patchRes = await app.handle(
      new Request(`http://localhost/concursos/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ nombre: "Updated Name" }),
      })
    );
    expect(patchRes.status).toBe(200);

    const deleteRes = await app.handle(
      new Request(`http://localhost/concursos/${eventId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${adminToken}` },
      })
    );
    expect(deleteRes.status).toBe(204);
  });
});

describe("RBAC — Edge cases and error handling", () => {
  it("returns 401 for missing auth header", async () => {
    const { eventId } = await createEvent();

    const res = await app.handle(
      new Request(`http://localhost/concursos/${eventId}`, {
        method: "GET",
      })
    );

    expect(res.status).toBe(401);
  });

  it("returns 401 for invalid JWT", async () => {
    const { eventId } = await createEvent();

    const res = await app.handle(
      new Request(`http://localhost/concursos/${eventId}`, {
        method: "GET",
        headers: { authorization: "Bearer invalid-token" },
      })
    );

    expect(res.status).toBe(401);
  });

  it("returns 400 for wrong judge PIN", async () => {
    const { eventId, adminToken } = await createEvent();
    const judgeCodigo = nextId("judge");

    await app.handle(
      new Request("http://localhost/judges", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ codigo: judgeCodigo, nombre: "Judge One", eventoId: eventId }),
      })
    );

    const loginRes = await app.handle(
      new Request("http://localhost/auth/login/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: judgeCodigo, pin: "WRONG" }),
      })
    );

    expect(loginRes.status).toBe(400);
  });

  it("returns 400 for non-existent judge login", async () => {
    const loginRes = await app.handle(
      new Request("http://localhost/auth/login/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: "nonexistent", pin: "12345" }),
      })
    );

    expect(loginRes.status).toBe(400);
  });

  it("event manager without assignments gets 403", async () => {
    const { eventId } = await createEvent();
    const managerCodigo = nextId("manager");

    await UserModel.create({ codigo: managerCodigo, nombre: "Manager One", role: "eventManager" });
    const loginRes = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: managerCodigo, password: "any" }),
      })
    );
    const { token } = (await loginRes.json()) as { token: string };

    const eventRes = await app.handle(
      new Request(`http://localhost/concursos/${eventId}`, {
        headers: { authorization: `Bearer ${token}` },
      })
    );

    expect(eventRes.status).toBe(403);
  });

  it("returns 403 when non-admin tries to access admin-only route", async () => {
    const managerCodigo = nextId("manager");
    await UserModel.create({ codigo: managerCodigo, nombre: "Manager One", role: "eventManager" });

    const loginRes = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: managerCodigo, password: "any" }),
      })
    );
    const { token } = (await loginRes.json()) as { token: string };

    const usersRes = await app.handle(
      new Request("http://localhost/auth/users", {
        headers: { authorization: `Bearer ${token}` },
      })
    );

    expect(usersRes.status).toBe(403);
  });

  it("returns 429 after exceeding rate limit on judge login", async () => {
    const { eventId, adminToken } = await createEvent();
    const judgeCodigo = nextId("judge");

    await app.handle(
      new Request("http://localhost/judges", {
        method: "POST",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ codigo: judgeCodigo, nombre: "Judge One", eventoId: eventId }),
      })
    );

    for (let i = 0; i < 15; i++) {
      await app.handle(
        new Request("http://localhost/auth/login/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: judgeCodigo, pin: "WRONG" }),
        })
      );
    }

    const res = await app.handle(
      new Request("http://localhost/auth/login/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo: judgeCodigo, pin: "WRONG" }),
      })
    );

    expect(res.status).toBe(429);
  });
});
