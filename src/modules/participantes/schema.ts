import { t, type UnwrapSchema } from "elysia";

export const ParticipanteSchema = {
  registerBody: t.Object({
    codigo: t.String(),
    tipo: t.String(),
    nivel: t.String(),
    campos: t.Optional(t.Record(t.String(), t.String())),
  }),
  participanteResponse: t.Object({
    _id: t.String(),
    tipo: t.String(),
    nivel: t.String(),
    codigo: t.String(),
    nombre: t.String(),
    carrera: t.String(),
    semestre: t.Number(),
    correo: t.String(),
    escuela: t.String(),
    campos: t.Record(t.String(), t.String()),
  }),
  concursoNotFound: t.Literal("Concurso not found"),
  cupoExceeded: t.Literal("Cupo exceeded"),
  tipoNoPermitido: t.Literal("Participation mode not allowed for this concurso"),
  nivelNoPermitido: t.Literal("Nivel not allowed for this concurso"),
  campoRequerido: t.Literal("Required field missing for this participation mode"),
  estudianteNoEncontrado: t.Literal("Estudiante no encontrado"),
} as const;

export type ParticipanteSchemaTypes = {
  [k in keyof typeof ParticipanteSchema]: UnwrapSchema<(typeof ParticipanteSchema)[k]>;
};
