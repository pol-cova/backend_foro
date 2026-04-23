import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import mongoose from "mongoose";
import { Elysia } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { auth } from "../src/modules/auth";
import { rubrics, evaluationRoutes, resultsRoutes } from "../src/modules/evaluations";
import { concursos } from "../src/modules/concursos";
import { judges } from "../src/modules/judges";
import { RubricTemplateModel } from "../src/modules/evaluations/mongoose";
import { EvaluationModel } from "../src/modules/evaluations/mongoose";
import { ConcursoModel } from "../src/modules/concursos/mongoose";
import { UserModel } from "../src/modules/auth/mongoose";
import { JudgeModel } from "../src/modules/judges/mongoose";
import { config } from "../src/config";

async function createAdminToken(app: Elysia, codigo: string) {
  const res = await app.handle(
    new Request("http://localhost/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, password: "any" }),
    })
  );
  const data = await res.json();
  return data.token;
}

async function createJudgeToken(app: Elysia, codigo: string, pin: string) {
  const res = await app.handle(
    new Request("http://localhost/auth/login/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, pin }),
    })
  );
  const data = await res.json();
  return data.token;
}

describe("Export Feature", () => {
  let app: Elysia;
  let adminToken: string;
  let judgeToken: string;
  let concursoId: string;
  let rubricId: string;
  let participantId: string;

  beforeAll(async () => {
    await mongoose.connect(config.database.url);

    // Clean up
    await RubricTemplateModel.deleteMany({});
    await EvaluationModel.deleteMany({});
    await ConcursoModel.deleteMany({});
    await UserModel.deleteMany({ codigo: { $in: ["ADMIN01", "JUDGE01"] } });
    await JudgeModel.deleteMany({ codigo: "JUDGE01" });

    // Create admin user
    await UserModel.create({ codigo: "ADMIN01", nombre: "Admin Test", role: "admin" });

    // Build app with auth
    app = new Elysia()
      .use(jwt({ name: "jwt", secret: config.jwt.secret }))
      .use(auth)
      .use(judges)
      .use(concursos)
      .use(rubrics)
      .use(evaluationRoutes)
      .use(resultsRoutes);

    // Login as admin
    adminToken = await createAdminToken(app, "ADMIN01");

    // Create a concurso
    const concursoRes = await app.handle(
      new Request("http://localhost/concursos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          nombre: "Export Test Concurso",
          cupo: 100,
          constraints: { individual: "nombre_proyecto" },
          niveles: ["Básico", "Intermedio"],
        }),
      })
    );
    const concursoData = await concursoRes.json();
    concursoId = concursoData._id;

    // Add a participant
    const participantRes = await app.handle(
      new Request(`http://localhost/concursos/${concursoId}/participantes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          tipo: "individual",
          codigo: "STUDENT01",
          nombre: "Student One",
          carrera: "ISC",
          semestre: 5,
          correo: "student@test.com",
          escuela: "CUCEI",
          nivel: "Básico",
          campos: { nombre_proyecto: "Test Project" },
        }),
      })
    );
    const participantData = await participantRes.json();
    participantId = participantData._id;

    // Create a rubric
    const rubricRes = await app.handle(
      new Request("http://localhost/rubrics", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Test Rubric",
          sections: [
            {
              title: "Section 1",
              criteria: [
                { id: "c1", question: "Q1", minScore: 1, maxScore: 10 },
                { id: "c2", question: "Q2", minScore: 1, maxScore: 10 },
              ],
            },
          ],
        }),
      })
    );
    const rubricData = await rubricRes.json();
    rubricId = rubricData._id;

    // Attach rubric
    await app.handle(
      new Request(`http://localhost/concursos/${concursoId}/rubric`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ rubricTemplateId: rubricId }),
      })
    );

    // Create a judge
    const judgeRes = await app.handle(
      new Request("http://localhost/judges", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          codigo: "JUDGE01",
          nombre: "Judge One",
          eventoId: concursoId,
        }),
      })
    );
    const judgeData = await judgeRes.json();
    judgeToken = await createJudgeToken(app, "JUDGE01", judgeData.pin);

    // Submit evaluation
    await app.handle(
      new Request("http://localhost/evaluations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${judgeToken}`,
        },
        body: JSON.stringify({
          concursoId,
          participantId,
          scores: [
            { criterionId: "c1", value: 8 },
            { criterionId: "c2", value: 9 },
          ],
        }),
      })
    );
  });

  afterAll(async () => {
    await RubricTemplateModel.deleteMany({});
    await EvaluationModel.deleteMany({});
    await ConcursoModel.deleteMany({});
    await UserModel.deleteMany({ codigo: { $in: ["ADMIN01", "JUDGE01"] } });
    await JudgeModel.deleteMany({ codigo: "JUDGE01" });
    await mongoose.disconnect();
  });

  describe("Export Participants", () => {
    it("should export participants as xlsx", async () => {
      const res = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/export/participants`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      const disposition = res.headers.get("content-disposition");
      expect(disposition).toContain("attachment");
      expect(disposition).toContain("participantes");

      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it("should return 404 for missing concurso", async () => {
      const res = await app.handle(
        new Request("http://localhost/concursos/000000000000000000000000/export/participants", {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(res.status).toBe(404);
    });
  });

  describe("Export Evaluations", () => {
    it("should export evaluations as xlsx", async () => {
      const res = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/export/evaluations`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      const disposition = res.headers.get("content-disposition");
      expect(disposition).toContain("attachment");
      expect(disposition).toContain("evaluaciones");

      const buffer = await res.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    it("should return 404 for missing concurso", async () => {
      const res = await app.handle(
        new Request("http://localhost/concursos/000000000000000000000000/export/evaluations", {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(res.status).toBe(404);
    });
  });

  describe("Export Auth", () => {
    it("should reject judge access to exports", async () => {
      const res = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/export/participants`, {
          headers: { Authorization: `Bearer ${judgeToken}` },
        })
      );

      expect(res.status).toBe(403);
    });
  });
});
