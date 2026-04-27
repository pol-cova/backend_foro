import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { create } from "../src/modules/concursos/service";
import { addParticipante, changeNivel } from "../src/modules/participantes/service";
import { auth } from "../src/modules/auth";
import { concursos } from "../src/modules/concursos";
import { ConcursoModel } from "../src/modules/concursos/mongoose";
import { UserModel } from "../src/modules/auth/mongoose";
import { connectMongoMemoryReplSet, stopMongoMemoryReplSet } from "./mongo-memory-replset";

const app = new Elysia().use(auth).use(concursos);

beforeAll(async () => {
  await connectMongoMemoryReplSet();
});

afterAll(async () => {
  await stopMongoMemoryReplSet();
});

beforeEach(async () => {
  await ConcursoModel.deleteMany({});
  await UserModel.deleteMany({});
});

let counter = 0;
function nextId(prefix: string) {
  return `${prefix}-${++counter}`;
}

async function createAdmin() {
  const c = nextId("admin");
  await UserModel.create({ codigo: c, nombre: "Admin Test", role: "admin" });
  const res = await app.handle(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: c, password: "any" }),
    })
  );
  const { token } = (await res.json()) as { token: string };
  return token;
}

async function seedConcursoWithParticipante(opts?: { correo?: string }) {
  const created = await create({
    nombre: "Concurso Test",
    cupo: 60,
    constraints: [{ id: "modalidad_individual", field: "true" }],
    niveles: ["BASICO", "INTERMEDIO", "AVANZADO"],
    allowMultiple: false,
  });
  if (!created.success) throw new Error("create failed");
  const concursoId = created.concurso!._id;

  const camposArg = opts?.correo ? { correo: opts.correo } : {};
  const added = await addParticipante(concursoId, {
    codigo: "TEST001",
    tipo: "modalidad_individual",
    nivel: "BASICO",
    semestre: 5,
    campos: camposArg,
  });
  if (!added.success) throw new Error("addParticipante failed");
  return { concursoId, participacionId: added.participante!._id };
}

// service unit tests
describe("changeNivel — service", () => {
  it("cambia nivel exitosamente y persiste en DB", async () => {
    const { concursoId, participacionId } = await seedConcursoWithParticipante({ correo: "p@test.com" });
    const result = await changeNivel(concursoId, participacionId, { nivel: "INTERMEDIO", razon: "Motivo de prueba" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.nivel).toBe("INTERMEDIO");
    expect(result.mailTo).toBe("p@test.com");

    const doc = await ConcursoModel.findById(concursoId).lean();
    const p = doc?.participantes?.find((p) => String(p._id) === participacionId);
    expect(p?.nivel).toBe("INTERMEDIO");
  });

  it("rechaza nivel_no_permitido cuando nivel no está en concurso.niveles", async () => {
    const { concursoId, participacionId } = await seedConcursoWithParticipante();
    const result = await changeNivel(concursoId, participacionId, { nivel: "EXPERTO", razon: "..." });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe("nivel_no_permitido");
  });

  it("rechaza mismo_nivel cuando el nivel no cambia", async () => {
    const { concursoId, participacionId } = await seedConcursoWithParticipante();
    const result = await changeNivel(concursoId, participacionId, { nivel: "BASICO", razon: "..." });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe("mismo_nivel");
  });

  it("retorna not_found para concursoId con formato inválido", async () => {
    const result = await changeNivel("not-an-id", "507f1f77bcf86cd799439011", { nivel: "INTERMEDIO", razon: "..." });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe("not_found");
  });

  it("retorna not_found para concurso inexistente", async () => {
    const result = await changeNivel("507f1f77bcf86cd799439011", "507f1f77bcf86cd799439012", { nivel: "INTERMEDIO", razon: "..." });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe("not_found");
  });

  it("retorna participante_not_found cuando participacionId no existe", async () => {
    const { concursoId } = await seedConcursoWithParticipante();
    const result = await changeNivel(concursoId, "507f1f77bcf86cd799439011", { nivel: "INTERMEDIO", razon: "..." });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.reason).toBe("participante_not_found");
  });

  it("retorna mailTo null cuando el participante no tiene correo", async () => {
    const created = await create({
      nombre: "Sin correo",
      cupo: 10,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["BASICO", "INTERMEDIO"],
      allowMultiple: false,
    });
    if (!created.success) throw new Error("create failed");
    const concursoId = created.concurso!._id;
    const added = await addParticipante(concursoId, {
      codigo: "TEST002",
      tipo: "modalidad_individual",
      nivel: "BASICO",
      semestre: 3,
    });
    if (!added.success) throw new Error("addParticipante failed");

    const result = await changeNivel(concursoId, added.participante!._id, { nivel: "INTERMEDIO", razon: "..." });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.mailTo).toBeNull();
  });
});

// route integration tests
describe("PATCH /:id/participantes/:participacionId/nivel — route", () => {
  it("200: admin cambia nivel exitosamente", async () => {
    const token = await createAdmin();
    const { concursoId, participacionId } = await seedConcursoWithParticipante({ correo: "p@test.com" });

    const res = await app.handle(
      new Request(`http://localhost/concursos/${concursoId}/participantes/${participacionId}/nivel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ nivel: "AVANZADO", razon: "Cambio justificado" }),
      })
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; nivel: string };
    expect(body.ok).toBe(true);
    expect(body.nivel).toBe("AVANZADO");
  });

  it("400: nivel no permitido", async () => {
    const token = await createAdmin();
    const { concursoId, participacionId } = await seedConcursoWithParticipante();

    const res = await app.handle(
      new Request(`http://localhost/concursos/${concursoId}/participantes/${participacionId}/nivel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ nivel: "EXPERTO", razon: "..." }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("400: mismo nivel", async () => {
    const token = await createAdmin();
    const { concursoId, participacionId } = await seedConcursoWithParticipante();

    const res = await app.handle(
      new Request(`http://localhost/concursos/${concursoId}/participantes/${participacionId}/nivel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ nivel: "BASICO", razon: "..." }),
      })
    );

    expect(res.status).toBe(400);
  });

  it("404: concurso inexistente", async () => {
    const token = await createAdmin();

    const res = await app.handle(
      new Request(`http://localhost/concursos/507f1f77bcf86cd799439011/participantes/507f1f77bcf86cd799439012/nivel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ nivel: "INTERMEDIO", razon: "..." }),
      })
    );

    expect(res.status).toBe(404);
  });

  it("404: participante inexistente en concurso existente", async () => {
    const token = await createAdmin();
    const { concursoId } = await seedConcursoWithParticipante();

    const res = await app.handle(
      new Request(`http://localhost/concursos/${concursoId}/participantes/507f1f77bcf86cd799439011/nivel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ nivel: "INTERMEDIO", razon: "..." }),
      })
    );

    expect(res.status).toBe(404);
  });

  it("401: sin token", async () => {
    const { concursoId, participacionId } = await seedConcursoWithParticipante();

    const res = await app.handle(
      new Request(`http://localhost/concursos/${concursoId}/participantes/${participacionId}/nivel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nivel: "INTERMEDIO", razon: "..." }),
      })
    );

    expect(res.status).toBe(401);
  });
});

// email fire-and-forget (requires TESTING=true)
const itWithTesting = process.env.TESTING === "true" ? it : it.skip;

describe("changeNivel — email notification", () => {
  itWithTesting("envía email con nivel nuevo y razón cuando hay correo", async () => {
    const { setCambioNivelCapture, clearCambioNivelCapture } = await import("../src/modules/email/service");
    const captured: { to: string; payload: { nombre: string; nivelNuevo: string; razon: string } }[] = [];
    setCambioNivelCapture((e) => captured.push(e as typeof captured[0]));

    const token = await createAdmin();
    const { concursoId, participacionId } = await seedConcursoWithParticipante({ correo: "notify@test.com" });

    const res = await app.handle(
      new Request(`http://localhost/concursos/${concursoId}/participantes/${participacionId}/nivel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ nivel: "AVANZADO", razon: "Premio especial" }),
      })
    );

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 150));

    expect(captured).toHaveLength(1);
    expect(captured[0].to).toBe("notify@test.com");
    expect(captured[0].payload.nivelNuevo).toBe("AVANZADO");
    expect(captured[0].payload.razon).toBe("Premio especial");
    clearCambioNivelCapture();
  });

  itWithTesting("no envía email cuando el participante no tiene correo", async () => {
    const { setCambioNivelCapture, clearCambioNivelCapture } = await import("../src/modules/email/service");
    const captured: unknown[] = [];
    setCambioNivelCapture((e) => captured.push(e));

    const created = await create({
      nombre: "Sin correo email test",
      cupo: 10,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["BASICO", "INTERMEDIO"],
      allowMultiple: false,
    });
    if (!created.success) throw new Error("create failed");
    const concursoId = created.concurso!._id;
    const added = await addParticipante(concursoId, {
      codigo: "NOCORREO",
      tipo: "modalidad_individual",
      nivel: "BASICO",
      semestre: 2,
    });
    if (!added.success) throw new Error("addParticipante failed");

    const token = await createAdmin();
    const res = await app.handle(
      new Request(`http://localhost/concursos/${concursoId}/participantes/${added.participante!._id}/nivel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ nivel: "INTERMEDIO", razon: "Sin correo" }),
      })
    );

    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 150));
    expect(captured).toHaveLength(0);
    clearCambioNivelCapture();
  });
});
