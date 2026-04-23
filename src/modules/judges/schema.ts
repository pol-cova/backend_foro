import { t, type UnwrapSchema } from "elysia";

export const JudgeSchema = {
  createBody: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    eventoId: t.String(),
  }),
  createResponse: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    eventoId: t.String(),
    pin: t.String(),
  }),

  judgeResponse: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    eventoId: t.String(),
  }),

  judgesListResponse: t.Array(
    t.Object({
      codigo: t.String(),
      nombre: t.String(),
      eventoId: t.String(),
    })
  ),

  updateBody: t.Object({
    nombre: t.Optional(t.String()),
    eventoId: t.Optional(t.String()),
  }),

  resetPinResponse: t.Object({
    codigo: t.String(),
    pin: t.String(),
  }),

  notFound: t.Literal("Judge not found"),
  conflict: t.Literal("Judge already exists"),
} as const;

export type JudgeModel = {
  [k in keyof typeof JudgeSchema]: UnwrapSchema<(typeof JudgeSchema)[k]>;
};
