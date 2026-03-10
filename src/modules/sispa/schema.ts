import { t, type UnwrapSchema } from "elysia";

export const SispaSchema = {
  estudiantePrefill: t.Object({
    codigo: t.String(),
    nombre: t.String(),
    carrera: t.String(),
    correo: t.String(),
    escuela: t.String(),
  }),
  notFound: t.Literal("Estudiante no encontrado"),
  apiError: t.Literal("Servicio no disponible"),
} as const;

export type SispaSchemaTypes = {
  [k in keyof typeof SispaSchema]: UnwrapSchema<(typeof SispaSchema)[k]>;
};
