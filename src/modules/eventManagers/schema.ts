import { t, type UnwrapSchema } from "elysia";

export const EventManagerSchema = {
  createAssignmentBody: t.Object({
    managerCodigo: t.String(),
    eventoId: t.String(),
  }),

  assignmentResponse: t.Object({
    managerCodigo: t.String(),
    eventoId: t.String(),
  }),

  assignmentsListResponse: t.Array(
    t.Object({
      managerCodigo: t.String(),
      eventoId: t.String(),
    })
  ),

  notFound: t.Literal("Assignment not found"),
  conflict: t.Literal("Assignment already exists"),
} as const;

export type EventManagerModel = {
  [k in keyof typeof EventManagerSchema]: UnwrapSchema<(typeof EventManagerSchema)[k]>;
};
