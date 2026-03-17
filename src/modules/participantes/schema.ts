import { t, type UnwrapSchema } from "elysia";

const participanteResponse = t.Object({
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
});

const MAX_CAMPO_KEY = 64;
const MAX_CAMPO_VALUE = 2048;
const MAX_CAMPOS_KEYS = 50;

export const ParticipanteSchema = {
  registerBody: t.Object({
    codigo: t.String({ minLength: 1, maxLength: 32 }),
    tipo: t.String({ minLength: 1, maxLength: 64 }),
    nivel: t.String({ minLength: 1, maxLength: 64 }),
    semestre: t.Number({ minimum: 1, maximum: 30 }),
    campos: t.Optional(
      t.Record(t.String({ maxLength: MAX_CAMPO_KEY }), t.String({ maxLength: MAX_CAMPO_VALUE }))
    ),
  }),
  participanteResponse,
  participantesListResponse: t.Array(participanteResponse),
  concursoNotFound: t.Literal("Concurso not found"),
  cupoExceeded: t.Literal("Cupo exceeded"),
  tipoNoPermitido: t.Literal("Participation mode not allowed for this concurso"),
  nivelNoPermitido: t.Literal("Nivel not allowed for this concurso"),
  campoRequerido: t.Literal("Required field missing for this participation mode"),
  campoVacio: t.Literal("Field must not be empty"),
  estudianteNoEncontrado: t.Literal("Estudiante no encontrado"),
  alreadyRegistered: t.Literal("Student already registered for this concurso"),
  payloadTooLarge: t.Literal("Too many registration fields"),
} as const;

export { MAX_CAMPOS_KEYS };

export type ParticipanteSchemaTypes = {
  [k in keyof typeof ParticipanteSchema]: UnwrapSchema<(typeof ParticipanteSchema)[k]>;
};
