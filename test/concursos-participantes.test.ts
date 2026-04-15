import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { create, list, getById } from "../src/modules/concursos/service";
import { addParticipante } from "../src/modules/participantes/service";
import { auth } from "../src/modules/auth";
import { concursos } from "../src/modules/concursos";
import { ConcursoModel } from "../src/modules/concursos/mongoose";
import { connectMongoMemoryReplSet, stopMongoMemoryReplSet } from "./mongo-memory-replset";

beforeAll(async () => {
  await connectMongoMemoryReplSet();
});

afterAll(async () => {
  await stopMongoMemoryReplSet();
});

beforeEach(async () => {
  await ConcursoModel.deleteMany({});
});

const TEST_CODIGO = process.env.TEST_ESTUDIANTE_CODIGO ?? "218807823";

describe("concursos", () => {
  it("crea concurso minimal (field: true)", async () => {
    const data = {
      nombre: "Concurso de Robotica",
      cupo: 60,
      constraints: [
        { id: "modalidad_individual", field: "true" },
        { id: "modalidad_equipo", field: "true" },
      ],
      niveles: ["BASICO", "INTERMEDIO", "AVANZADO"],
      allowMultiple: false,
    };
    const result = await create(data);
    expect(result.success).toBe(true);
    expect(result.concurso?.nombre).toBe("Concurso de Robotica");
    expect(result.concurso?.cupo).toBe(60);
    expect(result.concurso?.sharedFields).toEqual([]);
    expect(result.concurso?.constraints).toHaveLength(2);
    expect(result.concurso?.participantes).toHaveLength(0);
  });

  it("crea concurso con sharedFields y campos por tipo", async () => {
    const data = {
      nombre: "Foro de Investigacion 2026",
      cupo: 50,
      sharedFields: ["carrera_o_semestre", "correo", "institucion", "nombre_completo", "telefono"],
      constraints: [
        { id: "modalidad_individual", fields: ["descripcion", "descripcion_proyecto"] },
        { id: "modalidad_equipo", fields: ["descripcion_proyecto"] },
      ],
      niveles: ["N/A", "Licenciatura", "Posgrado"],
      allowMultiple: false,
    };
    const result = await create(data);
    expect(result.success).toBe(true);
    expect(result.concurso?.nombre).toBe("Foro de Investigacion 2026");
    expect(result.concurso?.sharedFields).toEqual(data.sharedFields);
    expect(result.concurso?.constraints).toHaveLength(2);
  });

  it("list retorna concursos creados", async () => {
    await create({
      nombre: "Expo A",
      cupo: 10,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["X"],
      allowMultiple: false,
    });
    await create({
      nombre: "Expo B",
      cupo: 20,
      constraints: [{ id: "modalidad_equipo", field: "true" }],
      niveles: ["Y"],
      allowMultiple: true,
    });
    const concursos = await list();
    expect(concursos).toHaveLength(2);
    expect(concursos.map((c) => c.nombre).sort()).toEqual(["Expo A", "Expo B"]);
  });

  it("getById retorna concurso existente", async () => {
    const created = await create({
      nombre: "Expo Unico",
      cupo: 5,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["Z"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const id = created.concurso!._id;
    const found = await getById(id);
    expect(found.success).toBe(true);
    expect(found.concurso?.nombre).toBe("Expo Unico");
  });

  it("getById falla con id invalido", async () => {
    const result = await getById("invalid");
    expect(result.success).toBe(false);
    expect(result.reason).toBe("not_found");
  });
});

describe("participantes", () => {
  it("registra participante en concurso minimal (SISPA real)", async () => {
    const created = await create({
      nombre: "Concurso de Robotica",
      cupo: 60,
      constraints: [
        { id: "modalidad_individual", field: "true" },
        { id: "modalidad_equipo", field: "true" },
      ],
      niveles: ["BASICO", "INTERMEDIO", "AVANZADO"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const concursoId = created.concurso!._id;

    const result = await addParticipante(concursoId, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_individual",
      nivel: "BASICO",
      semestre: 5,
    });

    expect(result.success).toBe(true);
    expect(result.participante?.codigo).toBe(TEST_CODIGO);
    expect(result.participante?.tipo).toBe("modalidad_individual");
    expect(result.participante?.nivel).toBe("BASICO");
    expect(result.participante?.campos).toEqual({});
  });

  it("registra participante con sharedFields y campos (SISPA real)", async () => {
    const created = await create({
      nombre: "Foro 2026",
      cupo: 50,
      sharedFields: ["carrera_o_semestre", "correo", "institucion", "nombre_completo", "telefono"],
      constraints: [{ id: "modalidad_individual", fields: ["descripcion", "descripcion_proyecto"] }],
      niveles: ["N/A", "Licenciatura", "Posgrado"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const concursoId = created.concurso!._id;

    const result = await addParticipante(concursoId, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_individual",
      nivel: "N/A",
      semestre: 5,
      campos: {
        carrera_o_semestre: "LICENCIATURA EN TECNOLOGIAS DE LA INFORMACION",
        correo: "josefernando10a.c@gmail.com",
        descripcion: "Analisis de datos con machine learning.",
        descripcion_proyecto: "Estudio de algoritmos para deteccion de patrones",
        institucion: "CUVALLES",
        nombre_completo: "JOSE FERNANDO ARENAS CAMACHO",
        telefono: "3312345678",
      },
    });

    expect(result.success).toBe(true);
    expect(result.participante?.codigo).toBe(TEST_CODIGO);
    expect(result.participante?.campos.carrera_o_semestre).toBe("LICENCIATURA EN TECNOLOGIAS DE LA INFORMACION");
    expect(result.participante?.campos.descripcion_proyecto).toBe("Estudio de algoritmos para deteccion de patrones");
  });

  it("rechaza tipo_no_permitido", async () => {
    const created = await create({
      nombre: "Concurso X",
      cupo: 10,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["BASICO"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const result = await addParticipante(created.concurso!._id, {
      codigo: TEST_CODIGO,
      tipo: "participacion",
      nivel: "BASICO",
      semestre: 5,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("tipo_no_permitido");
  });

  it("rechaza nivel_no_permitido", async () => {
    const created = await create({
      nombre: "Concurso X",
      cupo: 10,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["BASICO", "INTERMEDIO"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const result = await addParticipante(created.concurso!._id, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_individual",
      nivel: "AVANZADO",
      semestre: 5,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("nivel_no_permitido");
  });

  it("rechaza campo_requerido cuando falta descripcion", async () => {
    const created = await create({
      nombre: "Foro Test",
      cupo: 10,
      sharedFields: ["correo"],
      constraints: [{ id: "modalidad_individual", fields: ["descripcion"] }],
      niveles: ["N/A"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const result = await addParticipante(created.concurso!._id, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_individual",
      nivel: "N/A",
      semestre: 5,
      campos: { correo: "test@test.com" },
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("campo_requerido");
  });

  it("rechaza campo_vacio cuando descripcion esta vacia", async () => {
    const created = await create({
      nombre: "Foro Test",
      cupo: 10,
      constraints: [{ id: "modalidad_individual", fields: ["descripcion"] }],
      niveles: ["N/A"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const result = await addParticipante(created.concurso!._id, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_individual",
      nivel: "N/A",
      semestre: 5,
      campos: { descripcion: "   " },
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("campo_vacio");
  });

  it("registra con nivel AVANZADO cuando esta permitido", async () => {
    const created = await create({
      nombre: "Concurso Avanzado",
      cupo: 60,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["BASICO", "INTERMEDIO", "AVANZADO"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const result = await addParticipante(created.concurso!._id, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_individual",
      nivel: "AVANZADO",
      semestre: 6,
    });
    expect(result.success).toBe(true);
    expect(result.participante?.nivel).toBe("AVANZADO");
  });

  const itWithTesting = process.env.TESTING === "true" ? it : it.skip;

  itWithTesting("triggers confirmation email with correct recipient and payload", async () => {
    const { setMailCapture, clearMailCapture } = await import("../src/modules/email/service");
    const captured: { to: string; payload: { nombre: string; concurso: string; tipo: string; nivel: string } }[] = [];
    setMailCapture((e) => captured.push(e));

    const created = await create({
      nombre: "Concurso Email Test",
      cupo: 10,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["AVANZADO"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);

    const app = new Elysia().use(auth).use(concursos);
    const res = await app.handle(
      new Request(`http://localhost/concursos/${created.concurso!._id}/participantes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: "loadtest-vu1-iter0",
          tipo: "modalidad_individual",
          nivel: "AVANZADO",
          semestre: 5,
        }),
      })
    );

    clearMailCapture();

    expect(res.status).toBe(201);
    expect(captured).toHaveLength(1);
    expect(captured[0].to).toContain("loadtest");
    expect(captured[0].payload.nombre).toBe("Load Test loadtest-vu1-iter0");
    expect(captured[0].payload.concurso).toBe("Concurso Email Test");
    expect(captured[0].payload.tipo).toBe("modalidad_individual");
    expect(captured[0].payload.nivel).toBe("AVANZADO");
  });

  itWithTesting("prefers campos.correo over SISPA when present", async () => {
    const { setMailCapture, clearMailCapture } = await import("../src/modules/email/service");
    const captured: { to: string }[] = [];
    setMailCapture((e) => captured.push({ to: e.to }));

    const created = await create({
      nombre: "Foro Correo",
      cupo: 10,
      sharedFields: ["correo"],
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["N/A"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);

    const app = new Elysia().use(auth).use(concursos);
    const res = await app.handle(
      new Request(`http://localhost/concursos/${created.concurso!._id}/participantes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: "loadtest-prefer",
          tipo: "modalidad_individual",
          nivel: "N/A",
          semestre: 5,
          campos: { correo: "user-preferred@example.com" },
        }),
      })
    );

    clearMailCapture();

    expect(res.status).toBe(201);
    expect(captured).toHaveLength(1);
    expect(captured[0].to).toBe("user-preferred@example.com");
  });

  it("getById incluye participantes_totales individuales y equipo", async () => {
    const created = await create({
      nombre: "Conteos",
      cupo: 10,
      constraints: [
        { id: "modalidad_individual", field: "true" },
        { id: "modalidad_equipo", field: "true" },
      ],
      niveles: ["BASICO"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const id = created.concurso!._id;
    await ConcursoModel.updateOne(
      { _id: id },
      {
        $push: {
          participantes: {
            tipo: "modalidad_equipo",
            codigo: "100",
            nombre: "L",
            carrera: "c",
            semestre: 1,
            correo: "e@e.com",
            escuela: "s",
            nivel: "BASICO",
            campos: { codigo_1: "101", codigo_2: "102" },
          },
        },
      }
    );
    const found = await getById(id);
    expect(found.success).toBe(true);
    expect(found.concurso?.participantes_totales).toBe(3);
    expect(found.concurso?.individuales).toBe(0);
    expect(found.concurso?.equipo).toBe(3);
  });

  it("rechaza cupo_exceeded cuando cupo en personas esta lleno", async () => {
    const created = await create({
      nombre: "Lleno",
      cupo: 1,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["BASICO"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const id = created.concurso!._id;
    await ConcursoModel.updateOne(
      { _id: id },
      {
        $push: {
          participantes: {
            tipo: "modalidad_individual",
            codigo: "prefill-1",
            nombre: "A",
            carrera: "c",
            semestre: 1,
            correo: "a@a.com",
            escuela: "s",
            nivel: "BASICO",
            campos: {},
          },
        },
      }
    );
    const result = await addParticipante(id, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_individual",
      nivel: "BASICO",
      semestre: 5,
    });
    expect(result.success).toBe(false);
    expect(result.reason).toBe("cupo_exceeded");
  });

  it("permite el mismo codigo en dos equipos distintos (mismo concurso)", async () => {
    const created = await create({
      nombre: "Multi equipo",
      cupo: 30,
      constraints: [{ id: "modalidad_equipo", field: "true" }],
      niveles: ["BASICO"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const id = created.concurso!._id;
    const first = await addParticipante(id, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_equipo",
      nivel: "BASICO",
      semestre: 5,
    });
    const second = await addParticipante(id, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_equipo",
      nivel: "BASICO",
      semestre: 5,
    });
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    const found = await getById(id);
    expect(found.concurso?.participantes).toHaveLength(2);
  });

  it("rechaza segundo individual con el mismo codigo", async () => {
    const created = await create({
      nombre: "Solo individual",
      cupo: 30,
      constraints: [{ id: "modalidad_individual", field: "true" }],
      niveles: ["BASICO"],
      allowMultiple: false,
    });
    expect(created.success).toBe(true);
    const id = created.concurso!._id;
    const first = await addParticipante(id, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_individual",
      nivel: "BASICO",
      semestre: 5,
    });
    expect(first.success).toBe(true);
    const second = await addParticipante(id, {
      codigo: TEST_CODIGO,
      tipo: "modalidad_individual",
      nivel: "BASICO",
      semestre: 5,
    });
    expect(second.success).toBe(false);
    expect(second.reason).toBe("already_registered");
  });
});
