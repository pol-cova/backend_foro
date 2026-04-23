import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { AuthSchema } from "../auth/schema";
import { cookieSchema } from "../auth/common";
import { JudgeSchema } from "./schema";
import { createJudge, listJudges, getJudge, updateJudge, resetJudgePin, deleteJudge } from "./service";

export const judges = new Elysia({ prefix: "/judges" })
  .use(auth)
  .post(
    "/",
    async ({ body, set }) => {
      const result = await createJudge(body);
      if (!result.success) {
        set.status = 409;
        return JudgeSchema.conflict.const;
      }
      set.status = 201;
      return result.judge;
    },
    {
      auth: true,
      authorize: "admin",
      body: JudgeSchema.createBody,
      cookie: cookieSchema,
      response: {
        201: JudgeSchema.createResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        409: JudgeSchema.conflict,
      },
    }
  )
  .get(
    "/",
    async () => listJudges(),
    {
      auth: true,
      authorize: "admin",
      cookie: cookieSchema,
      response: {
        200: JudgeSchema.judgesListResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
      },
    }
  )
  .get(
    "/:codigo",
    async ({ params: { codigo }, set }) => {
      const result = await getJudge(codigo);
      if (!result.success) {
        set.status = 404;
        return JudgeSchema.notFound.const;
      }
      return result.judge;
    },
    {
      auth: true,
      authorize: "admin",
      cookie: cookieSchema,
      params: t.Object({ codigo: t.String() }),
      response: {
        200: JudgeSchema.judgeResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: JudgeSchema.notFound,
      },
    }
  )
  .patch(
    "/:codigo",
    async ({ body, params: { codigo }, set }) => {
      const result = await updateJudge(codigo, body);
      if (!result.success) {
        set.status = 404;
        return JudgeSchema.notFound.const;
      }
      return result.judge;
    },
    {
      auth: true,
      authorize: "admin",
      body: JudgeSchema.updateBody,
      cookie: cookieSchema,
      params: t.Object({ codigo: t.String() }),
      response: {
        200: JudgeSchema.judgeResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: JudgeSchema.notFound,
      },
    }
  )
  .patch(
    "/:codigo/reset-pin",
    async ({ params: { codigo }, set }) => {
      const result = await resetJudgePin(codigo);
      if (!result.success) {
        set.status = 404;
        return JudgeSchema.notFound.const;
      }
      return { codigo: result.codigo, pin: result.pin };
    },
    {
      auth: true,
      authorize: "admin",
      cookie: cookieSchema,
      params: t.Object({ codigo: t.String() }),
      response: {
        200: JudgeSchema.resetPinResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: JudgeSchema.notFound,
      },
    }
  )
  .delete(
    "/:codigo",
    async ({ params: { codigo }, set }) => {
      const result = await deleteJudge(codigo);
      if (!result.success) {
        set.status = 404;
        return JudgeSchema.notFound.const;
      }
      set.status = 204;
    },
    {
      auth: true,
      authorize: "admin",
      cookie: cookieSchema,
      params: t.Object({ codigo: t.String() }),
      response: {
        204: t.Undefined(),
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: JudgeSchema.notFound,
      },
    }
  );
