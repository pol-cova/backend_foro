import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { participantes } from "../participantes";
import { create, list, getById, update, deleteConcurso } from "./service";
import { ConcursoSchema } from "./schema";
import { AuthSchema } from "../auth/schema";
import { cookieSchema, sharedAuthResponses } from "../auth/common";

export const concursos = new Elysia({ prefix: "/concursos" })
  .use(auth)
  .use(participantes)
  .post(
    "/",
    async ({ body, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
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
      params: t.Object({ id: t.String() }),
      response: {
        200: ConcursoSchema.concursoResponse,
        404: ConcursoSchema.concursoNotFound,
      },
    }
  )
  .patch(
    "/:id",
    async ({ body, params: { id }, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
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
    async ({ params: { id }, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
      const result = await deleteConcurso(id);
      if (!result.success) {
        set.status = 404;
        return ConcursoSchema.concursoNotFound.const;
      }
      set.status = 204;
    },
    {
      auth: true,
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        204: t.Undefined(),
        404: ConcursoSchema.concursoNotFound,
        ...sharedAuthResponses,
      },
    }
  );
