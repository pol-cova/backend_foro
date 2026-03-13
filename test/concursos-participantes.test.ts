import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { create, list, getById } from "../src/modules/concursos/service";
import { addParticipante } from "../src/modules/participantes/service";
import { ConcursoModel } from "../src/modules/concursos/mongoose";

let memoryServer: MongoMemoryServer;

beforeAll(async () => {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
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
});
