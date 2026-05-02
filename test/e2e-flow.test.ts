import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { Elysia } from "elysia";
import { auth } from "../src/modules/auth";
import { concursos } from "../src/modules/concursos";
import { judges } from "../src/modules/judges";
import { rubrics, evaluationRoutes, resultsRoutes } from "../src/modules/evaluations";
import { ConcursoModel } from "../src/modules/concursos/mongoose";
import { UserModel } from "../src/modules/auth/mongoose";
import { JudgeModel } from "../src/modules/judges/mongoose";
import { RubricTemplateModel, EvaluationModel } from "../src/modules/evaluations/mongoose";
import { connectMongoMemoryReplSet, stopMongoMemoryReplSet } from "./mongo-memory-replset";

const ADMIN_CODIGO = process.env.TEST_ADMIN_CODIGO ?? process.env.SISPA_CODIGO ?? "219640329";
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? process.env.SISPA_PASSWORD;
const JUEZ_CODIGO = "299999999";
const ESTUDIANTE_CODIGO = process.env.TEST_ESTUDIANTE_CODIGO ?? "218807823";

const itWithCreds = ADMIN_PASSWORD ? it : it.skip;

const app = new Elysia().use(auth).use(concursos).use(judges).use(rubrics).use(evaluationRoutes).use(resultsRoutes);

async function login(codigo: string, password: string) {
  const res = await app.handle(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, password }),
    })
  );
  const body = (await res.json()) as { token: string };
  const cookie = res.headers.get("set-cookie")?.split(";")[0] ?? "";
  return { token: body.token, cookie };
}

function authHeaders(token: string, cookie: string) {
  return {
    "Content-Type": "application/json",
    authorization: `Bearer ${token}`,
    ...(cookie && { cookie }),
  };
}

beforeAll(async () => {
  await connectMongoMemoryReplSet();
});

beforeEach(async () => {
  await Promise.all([
    ConcursoModel.deleteMany({}),
    UserModel.deleteMany({ codigo: ADMIN_CODIGO }),
    JudgeModel.deleteMany({}),
    RubricTemplateModel.deleteMany({}),
    EvaluationModel.deleteMany({}),
  ]);
  await UserModel.create({ codigo: ADMIN_CODIGO, nombre: "Admin E2E", role: "admin" });
});

afterAll(async () => {
  await stopMongoMemoryReplSet();
});

describe("e2e full flow", () => {
  itWithCreds(
    "crear concurso -> agregar participante -> crear rúbrica -> asignar juez -> evaluar",
    async () => {
      const { token, cookie } = await login(ADMIN_CODIGO, ADMIN_PASSWORD!);
      const headers = authHeaders(token, cookie);

      // 1. Crear concurso
      const concursoRes = await app.handle(
        new Request("http://localhost/concursos", {
          method: "POST",
          headers,
          body: JSON.stringify({
            nombre: "Expo Foro E2E",
            cupo: 30,
            sharedFields: ["carrera_o_semestre", "correo", "institucion", "nombre_completo", "telefono"],
            constraints: [{ id: "modalidad_individual", fields: ["descripcion_proyecto"] }],
            niveles: ["Licenciatura", "Posgrado"],
            allowMultiple: false,
          }),
        })
      );
      expect(concursoRes.status).toBe(201);
      const concurso = (await concursoRes.json()) as { _id: string };
      expect(concurso._id).toBeTruthy();

      // 2. Registrar participante
      const participanteRes = await app.handle(
        new Request(`http://localhost/concursos/${concurso._id}/participantes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            codigo: ESTUDIANTE_CODIGO,
            tipo: "modalidad_individual",
            nivel: "Licenciatura",
            semestre: 6,
            campos: {
              carrera_o_semestre: "Ingeniería en Sistemas Computacionales",
              correo: "estudiante@test.com",
              descripcion_proyecto: "Sistema de detección de fraudes con ML",
              institucion: "CUVALLES",
              nombre_completo: "Ana García López",
              telefono: "3310000001",
            },
          }),
        })
      );
      expect(participanteRes.status).toBe(201);
      const participante = (await participanteRes.json()) as { _id: string; codigo: string };
      expect(participante.codigo).toBe(ESTUDIANTE_CODIGO);

      // 3. Crear rúbrica
      const rubricaRes = await app.handle(
        new Request("http://localhost/rubrics", {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: "Rúbrica General E2E",
            sections: [
              {
                title: "Presentación",
                criteria: [
                  { id: "claridad", question: "¿Qué tan clara fue la presentación?", minScore: 0, maxScore: 10 },
                  { id: "dominio", question: "¿Demostró dominio del tema?", minScore: 0, maxScore: 10 },
                ],
              },
            ],
          }),
        })
      );
      expect(rubricaRes.status).toBe(201);
      const rubrica = (await rubricaRes.json()) as { _id: string };
      expect(rubrica._id).toBeTruthy();

      // 4. Asignar rúbrica al concurso
      const assignRubricRes = await app.handle(
        new Request(`http://localhost/concursos/${concurso._id}/rubric`, {
          method: "PUT",
          headers,
          body: JSON.stringify({ rubricTemplateId: rubrica._id }),
        })
      );
      expect(assignRubricRes.status).toBe(200);

      // 5. Crear juez asignado al concurso
      const juezRes = await app.handle(
        new Request("http://localhost/judges", {
          method: "POST",
          headers,
          body: JSON.stringify({
            codigo: JUEZ_CODIGO,
            nombre: "Dr. Juez E2E",
            eventoId: concurso._id,
          }),
        })
      );
      expect(juezRes.status).toBe(201);
      const juez = (await juezRes.json()) as { codigo: string; pin: string };
      expect(juez.codigo).toBe(JUEZ_CODIGO);
      expect(juez.pin).toBeTruthy();

      // 6. Juez inicia sesión (endpoint dedicado para jueces)
      const juezLoginRes = await app.handle(
        new Request("http://localhost/auth/login/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ codigo: JUEZ_CODIGO, pin: juez.pin }),
        })
      );
      expect(juezLoginRes.status).toBe(200);
      const juezLoginBody = (await juezLoginRes.json()) as { token: string };
      const juezCookie = juezLoginRes.headers.get("set-cookie")?.split(";")[0] ?? "";
      const juezHeaders = authHeaders(juezLoginBody.token, juezCookie);

      // 7. Juez evalúa al participante
      const evalRes = await app.handle(
        new Request("http://localhost/evaluations", {
          method: "POST",
          headers: juezHeaders,
          body: JSON.stringify({
            concursoId: concurso._id,
            participantId: participante._id,
            scores: [
              { criterionId: "claridad", value: 8 },
              { criterionId: "dominio", value: 9 },
            ],
            notes: "Excelente presentación",
          }),
        })
      );
      expect(evalRes.status).toBe(201);
      const evaluacion = (await evalRes.json()) as { _id: string };
      expect(evaluacion._id).toBeTruthy();

      // 8. Verificar resultados en DB
      const saved = await ConcursoModel.findById(concurso._id).lean();
      expect(saved?.participantes?.length).toBe(1);
    }
  );
});
