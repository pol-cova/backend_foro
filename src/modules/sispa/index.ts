import { Elysia, t } from "elysia";
import { auth } from "../auth";
import { AuthSchema } from "../auth/schema";
import { getEstudianteByCodigo } from "./service";
import { SispaSchema } from "./schema";
import { cookieSchema } from "../auth/common";

export const sispa = new Elysia({ prefix: "/sispa" })
  .use(auth)
  .get(
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
      auth: true,
      cookie: cookieSchema,
      params: t.Object({ codigo: t.String() }),
      response: {
        200: SispaSchema.estudiantePrefill,
        404: SispaSchema.notFound,
        503: SispaSchema.apiError,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
      },
    }
  );
