import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { AuthSchema } from "../auth/schema";
import { cookieSchema } from "../auth/common";
import { EventManagerSchema } from "./schema";
import { createAssignment, listAssignments, deleteAssignment } from "./service";

export const eventManagers = new Elysia({ prefix: "/event-managers" })
  .use(auth)
  .post(
    "/assignments",
    async ({ body, set }) => {
      const result = await createAssignment(body);
      if (!result.success) {
        set.status = 409;
        return EventManagerSchema.conflict.const;
      }
      set.status = 201;
      return result.assignment;
    },
    {
      auth: true,
      authorize: "admin",
      body: EventManagerSchema.createAssignmentBody,
      cookie: cookieSchema,
      response: {
        201: EventManagerSchema.assignmentResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        409: EventManagerSchema.conflict,
      },
    }
  )
  .get(
    "/assignments",
    async () => listAssignments(),
    {
      auth: true,
      authorize: "admin",
      cookie: cookieSchema,
      response: {
        200: EventManagerSchema.assignmentsListResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
      },
    }
  )
  .delete(
    "/assignments/:managerCodigo/:eventoId",
    async ({ params: { managerCodigo, eventoId }, set }) => {
      const result = await deleteAssignment(managerCodigo, eventoId);
      if (!result.success) {
        set.status = 404;
        return EventManagerSchema.notFound.const;
      }
      set.status = 204;
    },
    {
      auth: true,
      authorize: "admin",
      cookie: cookieSchema,
      params: t.Object({ managerCodigo: t.String(), eventoId: t.String() }),
      response: {
        204: t.Undefined(),
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: EventManagerSchema.notFound,
      },
    }
  );
