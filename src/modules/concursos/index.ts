import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { participantes } from "../participantes";
import { create, list, getById, update, deleteConcurso } from "./service";
import {
  attachRubricToConcurso,
  detachRubricFromConcurso,
  assignRubricsToConcurso,
  getConcursoRubrics,
  clearAssignedRubrics,
} from "../evaluations/service";
import { ConcursoSchema } from "./schema";
import { AuthSchema } from "../auth/schema";
import { cookieSchema, sharedAuthResponses } from "../auth/common";
import { RubricSchema } from "../evaluations/schema";

export const concursos = new Elysia({ prefix: "/concursos" })
  .use(auth)
  .use(participantes)
  .post(
    "/",
    async ({ body, set }) => {
      const result = await create(body);
      if (!result.success) {
        set.status = 400;
        return result.reason === "niveles_empty"
          ? ConcursoSchema.nivelesEmpty.const
          : ConcursoSchema.constraintsEmpty.const;
      }
      set.status = 201;
      return result.concurso;
    },
    {
      auth: true,
      authorize: "admin",
      body: ConcursoSchema.createBody,
      cookie: cookieSchema,
      response: {
        201: ConcursoSchema.concursoResponse,
        400: t.Union([ConcursoSchema.nivelesEmpty, ConcursoSchema.constraintsEmpty]),
        ...sharedAuthResponses,
      },
    }
  )
  .get(
    "/",
    async () => list(),
    {
      response: { 200: ConcursoSchema.concursosListResponse },
    }
  )
  .get(
    "/:id",
    async ({ params: { id }, set }) => {
      const result = await getById(id);
      if (!result.success) {
        set.status = 404;
        return ConcursoSchema.concursoNotFound.const;
      }
      return result.concurso;
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager", "judge"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: ConcursoSchema.concursoResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: ConcursoSchema.concursoNotFound,
      },
    }
  )
  .patch(
    "/:id",
    async ({ body, params: { id }, set }) => {
      const result = await update(id, body);
      if (!result.success) {
        const reasonMap = {
          niveles_empty: { status: 400 as const, message: ConcursoSchema.nivelesEmpty.const },
          constraints_empty: { status: 400 as const, message: ConcursoSchema.constraintsEmpty.const },
          not_found: { status: 404 as const, message: ConcursoSchema.concursoNotFound.const },
        };
        const { status, message } = reasonMap[result.reason];
        set.status = status;
        return message;
      }
      return result.concurso;
    },
    {
      auth: true,
      authorize: "admin",
      body: ConcursoSchema.updateBody,
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: ConcursoSchema.concursoResponse,
        400: t.Union([ConcursoSchema.nivelesEmpty, ConcursoSchema.constraintsEmpty]),
        404: ConcursoSchema.concursoNotFound,
        ...sharedAuthResponses,
      },
    }
  )
  .delete(
    "/:id",
    async ({ params: { id }, set }) => {
      const result = await deleteConcurso(id);
      if (!result.success) {
        set.status = 404;
        return ConcursoSchema.concursoNotFound.const;
      }
      set.status = 204;
    },
    {
      auth: true,
      authorize: "admin",
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        204: t.Undefined(),
        404: ConcursoSchema.concursoNotFound,
        ...sharedAuthResponses,
      },
    }
  )
  .put(
    "/:id/rubric",
    async ({ body, params: { id }, set }) => {
      const result = await attachRubricToConcurso(id, body.rubricTemplateId);
      if (!result.success) {
        if (result.reason === "concurso_not_found") {
          set.status = 404;
          return ConcursoSchema.concursoNotFound.const;
        }
        set.status = 404;
        return RubricSchema.notFound.const;
      }
      return result.concurso;
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager"],
      body: t.Object({ rubricTemplateId: t.String() }),
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: ConcursoSchema.concursoResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: t.Union([ConcursoSchema.concursoNotFound, RubricSchema.notFound]),
      },
    }
  )
  .delete(
    "/:id/rubric",
    async ({ params: { id }, set }) => {
      const result = await detachRubricFromConcurso(id);
      if (!result.success) {
        set.status = 404;
        return ConcursoSchema.concursoNotFound.const;
      }
      return result.concurso;
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: ConcursoSchema.concursoResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: ConcursoSchema.concursoNotFound,
      },
    }
  )
  .put(
    "/:id/rubrics",
    async ({ body, params: { id }, set }) => {
      const result = await assignRubricsToConcurso(id, body.rubrics);
      if (!result.success) {
        if (result.reason === "concurso_not_found") {
          set.status = 404;
          return ConcursoSchema.concursoNotFound.const;
        }
        set.status = 404;
        return RubricSchema.notFound.const;
      }
      return result.concurso;
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager"],
      body: t.Object({
        rubrics: t.Array(
          t.Object({
            label: t.String(),
            templateId: t.String(),
          })
        ),
      }),
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: ConcursoSchema.concursoResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: t.Union([ConcursoSchema.concursoNotFound, RubricSchema.notFound]),
      },
    }
  )
  .get(
    "/:id/rubrics",
    async ({ params: { id }, set }) => {
      const result = await getConcursoRubrics(id);
      if (!result.success) {
        set.status = 404;
        return ConcursoSchema.concursoNotFound.const;
      }
      return { rubrics: result.rubrics, mode: result.mode };
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          rubrics: t.Array(
            t.Object({
              label: t.String(),
              templateId: t.String(),
              name: t.String(),
              sections: t.Array(RubricSchema.rubricResponse.properties.sections.items),
            })
          ),
          mode: t.Union([t.Literal("multi"), t.Literal("legacy"), t.Literal("none")]),
        }),
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: ConcursoSchema.concursoNotFound,
      },
    }
  )
  .delete(
    "/:id/rubrics",
    async ({ params: { id }, set }) => {
      const result = await clearAssignedRubrics(id);
      if (!result.success) {
        set.status = 404;
        return ConcursoSchema.concursoNotFound.const;
      }
      return result.concurso;
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: ConcursoSchema.concursoResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: ConcursoSchema.concursoNotFound,
      },
    }
  );
