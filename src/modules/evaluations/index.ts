import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { AuthSchema } from "../auth/schema";
import { cookieSchema, sharedAuthResponses } from "../auth/common";
import { RubricSchema, EvaluationSchema, ResultsSchema } from "./schema";
import {
  createRubric,
  listRubrics,
  getRubric,
  updateRubric,
  deleteRubric,
  createEvaluation,
  listMyEvaluations,
  listConcursoEvaluations,
  getResults,
  getScoreboard,
} from "./service";
import { addScoreboardListener, removeScoreboardListener } from "./sse";

// ─── Rubric Template Routes ───

const rubrics = new Elysia({ prefix: "/rubrics" })
  .use(auth)
  .post(
    "/",
    async ({ body, user, set }) => {
      const result = await createRubric(body, user.codigo);
      set.status = 201;
      return result.rubric;
    },
    {
      auth: true,
      authorize: ["admin", "eventManager"],
      body: RubricSchema.createBody,
      cookie: cookieSchema,
      response: {
        201: RubricSchema.rubricResponse,
        ...sharedAuthResponses,
      },
    }
  )
  .get(
    "/",
    async () => listRubrics(),
    {
      auth: true,
      authorize: ["admin", "eventManager"],
      cookie: cookieSchema,
      response: {
        200: RubricSchema.rubricsListResponse,
        ...sharedAuthResponses,
      },
    }
  )
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const result = await getRubric(id);
      if (!result.success) {
        set.status = 404;
        return RubricSchema.notFound.const;
      }
      return result.rubric;
    },
    {
      auth: true,
      authorize: ["admin", "eventManager"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: RubricSchema.rubricResponse,
        404: RubricSchema.notFound,
        ...sharedAuthResponses,
      },
    }
  )
  .patch(
    "/:id",
    async ({ body, params: { id }, set }) => {
      const result = await updateRubric(id, body);
      if (!result.success) {
        set.status = 404;
        return RubricSchema.notFound.const;
      }
      return result.rubric;
    },
    {
      auth: true,
      authorize: ["admin", "eventManager"],
      body: RubricSchema.updateBody,
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: RubricSchema.rubricResponse,
        404: RubricSchema.notFound,
        ...sharedAuthResponses,
      },
    }
  )
  .delete(
    "/:id",
    async ({ params: { id }, set }) => {
      const result = await deleteRubric(id);
      if (!result.success) {
        set.status = 404;
        return RubricSchema.notFound.const;
      }
      set.status = 204;
    },
    {
      auth: true,
      authorize: ["admin", "eventManager"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        204: t.Undefined(),
        404: RubricSchema.notFound,
        ...sharedAuthResponses,
      },
    }
  );

// ─── Evaluation Routes ───

const evaluationRoutes = new Elysia({ prefix: "/evaluations" })
  .use(auth)
  .post(
    "/",
    async ({ body, user, set }) => {
      // Judges can only evaluate their assigned concurso
      if (user.role === "judge" && user.eventoId !== body.concursoId) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }

      const result = await createEvaluation(body, user.codigo);
      if (!result.success) {
        const reasonMap: Record<string, { status: number; message: string }> = {
          concurso_not_found: { status: 404, message: "Concurso not found" },
          participant_not_found: { status: 404, message: "Participant not found" },
          no_rubric: { status: 400, message: EvaluationSchema.noRubric.const },
          rubric_not_found: { status: 400, message: "Rubric template not found" },
          invalid_scores: { status: 400, message: EvaluationSchema.invalidScores.const },
          conflict: { status: 409, message: EvaluationSchema.conflict.const },
        };
        const mapped = reasonMap[result.reason];
        if (mapped) {
          set.status = mapped.status;
          return mapped.message;
        }
        set.status = 400;
        return "Bad request";
      }
      set.status = 201;
      return result.evaluation;
    },
    {
      auth: true,
      authorize: "judge",
      body: EvaluationSchema.createBody,
      cookie: cookieSchema,
      response: {
        201: EvaluationSchema.evaluationResponse,
        400: t.Union([EvaluationSchema.noRubric, EvaluationSchema.invalidScores]),
        403: AuthSchema.forbidden,
        404: t.Union([t.Literal("Concurso not found"), t.Literal("Participant not found")]),
        409: EvaluationSchema.conflict,
        ...sharedAuthResponses,
      },
    }
  )
  .get(
    "/me",
    async ({ query, user }) => {
      const result = await listMyEvaluations(user.codigo, query.concursoId);
      if (!result.success) {
        return { evaluations: [] };
      }
      return { evaluations: result.evaluations };
    },
    {
      auth: true,
      authorize: "judge",
      cookie: cookieSchema,
      query: t.Object({
        concursoId: t.Optional(t.String()),
      }),
      response: {
        200: t.Object({
          evaluations: EvaluationSchema.evaluationsListResponse,
        }),
        ...sharedAuthResponses,
      },
    }
  );

// ─── Results & Scoreboard Routes ───

const resultsRoutes = new Elysia({ prefix: "/concursos" })
  .use(auth)
  .get(
    "/:id/evaluations",
    async ({ params: { id }, set }) => {
      const result = await listConcursoEvaluations(id);
      if (!result.success) {
        set.status = 404;
        return "Concurso not found";
      }
      return result.evaluations;
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: EvaluationSchema.evaluationsListResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: t.Literal("Concurso not found"),
      },
    }
  )
  .get(
    "/:id/results",
    async ({ params: { id }, query, set }) => {
      const result = await getResults(id, query.nivel);
      if (!result.success) {
        set.status = 404;
        return "Concurso not found";
      }
      return result.results;
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager", "judge"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      query: t.Object({
        nivel: t.Optional(t.String()),
      }),
      response: {
        200: ResultsSchema.resultsResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: t.Literal("Concurso not found"),
      },
    }
  )
  .get(
    "/:id/scoreboard",
    async ({ params: { id }, query, set }) => {
      const result = await getScoreboard(id, query.nivel);
      if (!result.success) {
        set.status = 404;
        return "Concurso not found";
      }
      return result.results;
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager", "judge"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      query: t.Object({
        nivel: t.Optional(t.String()),
      }),
      response: {
        200: ResultsSchema.scoreboardResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: t.Literal("Concurso not found"),
      },
    }
  )
  .get(
    "/:id/scoreboard/live",
    async ({ params: { id }, query }) => {
      const nivel = query.nivel;

      const stream = new ReadableStream({
        start(controller) {
          addScoreboardListener(id, controller, nivel);

          // Send initial scoreboard
          getScoreboard(id, nivel).then((result) => {
            if (result.success) {
              const payload = JSON.stringify(result.results);
              controller.enqueue(new TextEncoder().encode(`event: message\ndata: ${payload}\n\n`));
            }
          });
        },
        cancel(controller) {
          removeScoreboardListener(id, controller);
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager", "judge"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      query: t.Object({
        nivel: t.Optional(t.String()),
      }),
    }
  );

export { rubrics, evaluationRoutes, resultsRoutes };
