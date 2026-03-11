import { Elysia, t } from "elysia";
import { getEstudianteByCodigo } from "./service";
import { SispaSchema } from "./schema";

export const sispa = new Elysia({ prefix: "/sispa" }).get(
  "/:codigo",
  async ({ params: { codigo }, set }) => {
    const result = await getEstudianteByCodigo(codigo);
    if (!result.success) {
      set.status = result.reason === "not_found" ? 404 : 503;
      return result.reason === "not_found" ? SispaSchema.notFound.const : SispaSchema.apiError.const;
    }
    const e = result.estudiante;
    return { codigo: e.codigo, nombre: e.nombre, carrera: e.carrera, correo: e.correo, escuela: e.escuela };
  },
  {
    params: t.Object({ codigo: t.String() }),
    response: {
      200: SispaSchema.estudiantePrefill,
      404: SispaSchema.notFound,
      503: SispaSchema.apiError,
    },
  }
);
