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

describe("Evaluation System", () => {
  let app: Elysia;
  let adminToken: string;
  let judgeToken: string;
  let concursoId: string;
  let otherConcursoId: string;
  let rubricId: string;
  let participantId: string;

  beforeAll(async () => {
    await mongoose.connect(config.database.url);

    // Clean up
    await RubricTemplateModel.deleteMany({});
    await EvaluationModel.deleteMany({});
    await ConcursoModel.deleteMany({});
    await UserModel.deleteMany({ codigo: { $in: ["ADMIN01", "EVMGR01", "JUDGE01", "JUDGE02", "JUDGE03"] } });
    await JudgeModel.deleteMany({ codigo: { $in: ["JUDGE01", "JUDGE02", "JUDGE03"] } });

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

    // Create first concurso
    const concursoRes = await app.handle(
      new Request("http://localhost/concursos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          nombre: "Test Concurso",
          cupo: 100,
          constraints: { individual: "nombre_proyecto" },
          niveles: ["Básico", "Intermedio"],
        }),
      })
    );
    const concursoData = await concursoRes.json();
    concursoId = concursoData._id;

    // Create second concurso (for cross-concurso auth tests)
    const otherConcursoRes = await app.handle(
      new Request("http://localhost/concursos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          nombre: "Other Concurso",
          cupo: 100,
          constraints: { individual: "nombre_proyecto" },
          niveles: ["Básico"],
        }),
      })
    );
    const otherConcursoData = await otherConcursoRes.json();
    otherConcursoId = otherConcursoData._id;

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

    // Create a judge for first concurso
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

    // Login as judge
    judgeToken = await createJudgeToken(app, "JUDGE01", judgeData.pin);
  });

  afterAll(async () => {
    await RubricTemplateModel.deleteMany({});
    await EvaluationModel.deleteMany({});
    await ConcursoModel.deleteMany({});
    await UserModel.deleteMany({ codigo: { $in: ["ADMIN01", "EVMGR01", "JUDGE01", "JUDGE02", "JUDGE03"] } });
    await JudgeModel.deleteMany({ codigo: { $in: ["JUDGE01", "JUDGE02", "JUDGE03"] } });
    await mongoose.disconnect();
  });

  describe("Rubric Template CRUD", () => {
    it("should create a rubric template", async () => {
      const res = await app.handle(
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

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.name).toBe("Test Rubric");
      expect(data.sections).toHaveLength(1);
      rubricId = data._id;
    });

    it("should list rubric templates", async () => {
      const res = await app.handle(
        new Request("http://localhost/rubrics", {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
    });

    it("should get a rubric template by id", async () => {
      const res = await app.handle(
        new Request(`http://localhost/rubrics/${rubricId}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data._id).toBe(rubricId);
    });

    it("should update a rubric template", async () => {
      const res = await app.handle(
        new Request(`http://localhost/rubrics/${rubricId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ name: "Updated Rubric" }),
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe("Updated Rubric");
    });
  });

  describe("Attach Rubric to Concurso", () => {
    it("should attach a rubric to a concurso", async () => {
      const res = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/rubric`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ rubricTemplateId: rubricId }),
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.rubricTemplateId).toBe(rubricId);
    });
  });

  describe("Evaluation Submission", () => {
    it("should allow a judge to submit an evaluation", async () => {
      const res = await app.handle(
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

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.totalScore).toBe(17);
      expect(data.judgeCodigo).toBe("JUDGE01");
    });

    it("should reject duplicate evaluation", async () => {
      const res = await app.handle(
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
              { criterionId: "c1", value: 5 },
              { criterionId: "c2", value: 5 },
            ],
          }),
        })
      );

      expect(res.status).toBe(409);
    });

    it("should reject evaluation with out-of-range scores", async () => {
      const res = await app.handle(
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
              { criterionId: "c1", value: 15 },
              { criterionId: "c2", value: 9 },
            ],
          }),
        })
      );

      expect(res.status).toBe(400);
    });

    it("should reject evaluation with incomplete scores", async () => {
      const res = await app.handle(
        new Request("http://localhost/evaluations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${judgeToken}`,
          },
          body: JSON.stringify({
            concursoId,
            participantId,
            scores: [{ criterionId: "c1", value: 8 }],
          }),
        })
      );

      expect(res.status).toBe(400);
    });

    it("should allow judge to view their evaluations", async () => {
      const res = await app.handle(
        new Request(`http://localhost/evaluations/me?concursoId=${concursoId}`, {
          headers: { Authorization: `Bearer ${judgeToken}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.evaluations).toHaveLength(1);
      expect(data.evaluations[0].judgeCodigo).toBe("JUDGE01");
    });
  });

  describe("Results & Scoreboard", () => {
    it("should return results for a concurso", async () => {
      const res = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/results`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].finalScore).toBe(17);
      expect(data[0].evaluationsCount).toBe(1);
    });

    it("should return scoreboard sorted by finalScore", async () => {
      const res = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/scoreboard`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      // Should be sorted descending
      for (let i = 1; i < data.length; i++) {
        expect(data[i - 1].finalScore).toBeGreaterThanOrEqual(data[i].finalScore);
      }
    });

    it("should filter results by nivel", async () => {
      const res = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/results?nivel=Básico`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.every((r: any) => r.nivel === "Básico")).toBe(true);
    });

    it("should allow judge to view scoreboard", async () => {
      const res = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/scoreboard`, {
          headers: { Authorization: `Bearer ${judgeToken}` },
        })
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
    });
  });

  describe("Realtime Scoreboard (SSE)", () => {
    it("should push scoreboard updates when evaluation is submitted", async () => {
      // Add another participant
      const participantRes = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/participantes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            tipo: "individual",
            codigo: "STUDENT02",
            nombre: "Student Two",
            carrera: "ISC",
            semestre: 6,
            correo: "student2@test.com",
            escuela: "CUCEI",
            nivel: "Intermedio",
            campos: { nombre_proyecto: "Another Project" },
          }),
        })
      );
      const participantData = await participantRes.json();
      const participant2Id = participantData._id;

      // Create another judge
      const judgeRes = await app.handle(
        new Request("http://localhost/judges", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            codigo: "JUDGE02",
            nombre: "Judge Two",
            eventoId: concursoId,
          }),
        })
      );
      const judgeData = await judgeRes.json();
      const judge2Token = await createJudgeToken(app, "JUDGE02", judgeData.pin);

      // Open SSE connection
      const sseRes = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/scoreboard/live`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );

      expect(sseRes.status).toBe(200);
      expect(sseRes.headers.get("content-type")).toContain("text/event-stream");
      expect(sseRes.body).not.toBeNull();

      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();

      // Helper to read one SSE event
      async function readEvent(): Promise<unknown> {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) return null;
          if (value instanceof Uint8Array) {
            buffer += decoder.decode(value, { stream: true });
          }
          const end = buffer.indexOf("\n\n");
          if (end !== -1) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const match = event.match(/^data: (.+)$/m);
            if (match) return JSON.parse(match[1]);
          }
        }
      }

      // Read initial scoreboard
      const initial = await readEvent();
      expect(initial).toBeDefined();
      expect(Array.isArray(initial)).toBe(true);

      // Submit evaluation from second judge
      const evalRes = await app.handle(
        new Request("http://localhost/evaluations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${judge2Token}`,
          },
          body: JSON.stringify({
            concursoId,
            participantId: participant2Id,
            scores: [
              { criterionId: "c1", value: 7 },
              { criterionId: "c2", value: 8 },
            ],
          }),
        })
      );
      expect(evalRes.status).toBe(201);

      // Read updated scoreboard from SSE
      const updated = await readEvent();
      expect(updated).toBeDefined();
      expect(Array.isArray(updated)).toBe(true);

      // The updated scoreboard should include the new evaluation
      const results = updated as Array<{ participantId: string; finalScore: number }>;
      const newParticipantResult = results.find(
        (r) => r.participantId === participant2Id
      );
      expect(newParticipantResult).toBeDefined();
      expect(newParticipantResult!.finalScore).toBe(15);

      // Clean up
      reader.cancel();
      await JudgeModel.deleteOne({ codigo: "JUDGE02" });
    });

    it("should filter SSE updates by nivel", async () => {
      // Open SSE connection with nivel filter
      const sseRes = await app.handle(
        new Request(
          `http://localhost/concursos/${concursoId}/scoreboard/live?nivel=Básico`,
          {
            headers: { Authorization: `Bearer ${adminToken}` },
          }
        )
      );

      expect(sseRes.status).toBe(200);
      const reader = sseRes.body!.getReader();
      const decoder = new TextDecoder();

      async function readEvent(): Promise<unknown> {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done || !value) return null;
          if (value instanceof Uint8Array) {
            buffer += decoder.decode(value, { stream: true });
          }
          const end = buffer.indexOf("\n\n");
          if (end !== -1) {
            const event = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const match = event.match(/^data: (.+)$/m);
            if (match) return JSON.parse(match[1]);
          }
        }
      }

      const initial = await readEvent();
      expect(initial).toBeDefined();
      const results = initial as Array<{ nivel: string }>;
      expect(results.every((r) => r.nivel === "Básico")).toBe(true);

      reader.cancel();
    });
  });

  describe("Auth & Authorization", () => {
    it("should reject judge evaluating wrong concurso", async () => {
      // Create judge for other concurso
      const judgeRes = await app.handle(
        new Request("http://localhost/judges", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            codigo: "JUDGE03",
            nombre: "Judge Three",
            eventoId: otherConcursoId,
          }),
        })
      );
      const judgeData = await judgeRes.json();
      const wrongJudgeToken = await createJudgeToken(app, "JUDGE03", judgeData.pin);

      const res = await app.handle(
        new Request("http://localhost/evaluations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${wrongJudgeToken}`,
          },
          body: JSON.stringify({
            concursoId,
            participantId,
            scores: [
              { criterionId: "c1", value: 5 },
              { criterionId: "c2", value: 5 },
            ],
          }),
        })
      );

      expect(res.status).toBe(403);
      await JudgeModel.deleteOne({ codigo: "JUDGE03" });
    });

    it("should reject unassigned eventManager attaching rubric", async () => {
      // Create eventManager user (not assigned to any concurso)
      await UserModel.create({
        codigo: "EVMGR01",
        nombre: "Event Manager Test",
        role: "eventManager",
      });

      const evMgrToken = await createAdminToken(app, "EVMGR01");

      const res = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/rubric`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${evMgrToken}`,
          },
          body: JSON.stringify({ rubricTemplateId: rubricId }),
        })
      );

      expect(res.status).toBe(403);
      await UserModel.deleteOne({ codigo: "EVMGR01" });
    });

    it("should reject duplicate criterionIds in evaluation", async () => {
      const res = await app.handle(
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
              { criterionId: "c1", value: 5 },
              { criterionId: "c1", value: 6 },
            ],
          }),
        })
      );

      expect(res.status).toBe(400);
    });
  });

  describe("Score Calculation Validation", () => {
    it("should correctly average multiple judge evaluations", async () => {
      // Add another participant for this test
      const participantRes = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/participantes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            tipo: "individual",
            codigo: "STUDENT03",
            nombre: "Student Three",
            carrera: "ISC",
            semestre: 7,
            correo: "student3@test.com",
            escuela: "CUCEI",
            nivel: "Intermedio",
            campos: { nombre_proyecto: "Third Project" },
          }),
        })
      );
      const participantData = await participantRes.json();
      const participant3Id = participantData._id;

      // Create two judges
      const judge1Res = await app.handle(
        new Request("http://localhost/judges", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            codigo: "JUDGE02",
            nombre: "Judge Two",
            eventoId: concursoId,
          }),
        })
      );
      const judge1Data = await judge1Res.json();
      const judge1Token = await createJudgeToken(app, "JUDGE02", judge1Data.pin);

      const judge2Res = await app.handle(
        new Request("http://localhost/judges", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            codigo: "JUDGE03",
            nombre: "Judge Three",
            eventoId: concursoId,
          }),
        })
      );
      const judge2Data = await judge2Res.json();
      const judge2Token = await createJudgeToken(app, "JUDGE03", judge2Data.pin);

      // Judge 1: c1=6, c2=8 → total=14
      const eval1Res = await app.handle(
        new Request("http://localhost/evaluations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${judge1Token}`,
          },
          body: JSON.stringify({
            concursoId,
            participantId: participant3Id,
            scores: [
              { criterionId: "c1", value: 6 },
              { criterionId: "c2", value: 8 },
            ],
          }),
        })
      );
      expect(eval1Res.status).toBe(201);

      // Judge 2: c1=8, c2=10 → total=18
      const eval2Res = await app.handle(
        new Request("http://localhost/evaluations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${judge2Token}`,
          },
          body: JSON.stringify({
            concursoId,
            participantId: participant3Id,
            scores: [
              { criterionId: "c1", value: 8 },
              { criterionId: "c2", value: 10 },
            ],
          }),
        })
      );
      expect(eval2Res.status).toBe(201);

      // Verify results
      const resultsRes = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/results`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );
      expect(resultsRes.status).toBe(200);
      const allResults = await resultsRes.json() as Array<{
        participantId: string;
        evaluationsCount: number;
        finalScore: number;
        criterionAverages: Array<{ criterionId: string; average: number }>;
      }>;

      const participant3Result = allResults.find(
        (r) => r.participantId === participant3Id
      );
      expect(participant3Result).toBeDefined();
      expect(participant3Result!.evaluationsCount).toBe(2);
      // finalScore = (14 + 18) / 2 = 16
      expect(participant3Result!.finalScore).toBe(16);

      // c1 average = (6 + 8) / 2 = 7
      const c1Avg = participant3Result!.criterionAverages.find(
        (c) => c.criterionId === "c1"
      );
      expect(c1Avg).toBeDefined();
      expect(c1Avg!.average).toBe(7);

      // c2 average = (8 + 10) / 2 = 9
      const c2Avg = participant3Result!.criterionAverages.find(
        (c) => c.criterionId === "c2"
      );
      expect(c2Avg).toBeDefined();
      expect(c2Avg!.average).toBe(9);

      await JudgeModel.deleteMany({ codigo: { $in: ["JUDGE02", "JUDGE03"] } });
    });

    it("should return zero scores for unevaluated participants", async () => {
      // Add a participant without any evaluations
      const participantRes = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/participantes`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            tipo: "individual",
            codigo: "STUDENT04",
            nombre: "Student Four",
            carrera: "ISC",
            semestre: 1,
            correo: "student4@test.com",
            escuela: "CUCEI",
            nivel: "Básico",
            campos: { nombre_proyecto: "Unevaluated Project" },
          }),
        })
      );
      const participantData = await participantRes.json();
      const participant4Id = participantData._id;

      const resultsRes = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/results`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );
      expect(resultsRes.status).toBe(200);
      const allResults = await resultsRes.json() as Array<{
        participantId: string;
        evaluationsCount: number;
        finalScore: number;
        criterionAverages: unknown[];
      }>;

      const unevaluatedResult = allResults.find(
        (r) => r.participantId === participant4Id
      );
      expect(unevaluatedResult).toBeDefined();
      expect(unevaluatedResult!.evaluationsCount).toBe(0);
      expect(unevaluatedResult!.finalScore).toBe(0);
      expect(unevaluatedResult!.criterionAverages).toHaveLength(0);
    });

    it("should correctly sort scoreboard by finalScore descending", async () => {
      const scoreboardRes = await app.handle(
        new Request(`http://localhost/concursos/${concursoId}/scoreboard`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      );
      expect(scoreboardRes.status).toBe(200);
      const scoreboard = await scoreboardRes.json() as Array<{
        finalScore: number;
      }>;

      // Verify strict descending order
      for (let i = 1; i < scoreboard.length; i++) {
        expect(scoreboard[i - 1].finalScore).toBeGreaterThanOrEqual(
          scoreboard[i].finalScore
        );
      }
    });
  });
});
