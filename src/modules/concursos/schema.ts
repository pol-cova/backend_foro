import { t, type UnwrapSchema } from "elysia";

const constraintConfig = t.Object({
  id: t.String(),
  field: t.Optional(t.String()),
});

const constraintInput = t.Union([
  t.Record(t.String(), t.Union([t.String(), t.Null()])),
  t.Array(constraintConfig),
]);

const participanteResponse = t.Object({
  _id: t.String(),
  tipo: t.String(),
  codigo: t.String(),
  nombre: t.String(),
  carrera: t.String(),
  semestre: t.Number(),
  correo: t.String(),
  escuela: t.String(),
  nivel: t.String(),
  campos: t.Record(t.String(), t.String()),
});

export const ConcursoSchema = {
  createBody: t.Object({
    nombre: t.String(),
    cupo: t.Number(),
    constraints: constraintInput,
    niveles: t.Array(t.String()),
  }),
  updateBody: t.Object({
    nombre: t.Optional(t.String()),
    cupo: t.Optional(t.Number()),
    constraints: t.Optional(constraintInput),
    niveles: t.Optional(t.Array(t.String())),
  }),
  concursoResponse: t.Object({
    _id: t.String(),
    nombre: t.String(),
    cupo: t.Number(),
    constraints: t.Array(constraintConfig),
    niveles: t.Array(t.String()),
    participantes: t.Array(participanteResponse),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  }),
  concursosListResponse: t.Array(
    t.Object({
      _id: t.String(),
      nombre: t.String(),
      cupo: t.Number(),
      constraints: t.Array(constraintConfig),
      niveles: t.Array(t.String()),
      participantes: t.Array(participanteResponse),
      createdAt: t.Date(),
      updatedAt: t.Date(),
    })
  ),
  concursoNotFound: t.Literal("Concurso not found"),
  nivelesEmpty: t.Literal("niveles must have at least one value"),
  constraintsEmpty: t.Literal("constraints must have at least one entry"),
} as const;

export type ConcursoTypes = {
  [k in keyof typeof ConcursoSchema]: UnwrapSchema<(typeof ConcursoSchema)[k]>;
};
