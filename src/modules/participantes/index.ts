import { Elysia, t } from "elysia";
import { addParticipante, removeParticipante } from "./service";
import { ParticipanteSchema } from "./schema";
import { logger } from "../../lib/logger";
import { sendInscripcionConfirm } from "../email/service";
import { cookieSchema, sharedAuthResponses } from "../auth/common";

type AddParticipanteReason = "not_found" | "estudiante_no_encontrado" | "cupo_exceeded" | "tipo_no_permitido" | "nivel_no_permitido" | "campo_requerido";

const addParticipanteErrorMap: Record<
  AddParticipanteReason,
  { status: 400 | 404 | 409; message: string }
> = {
  not_found: { status: 404, message: ParticipanteSchema.concursoNotFound.const },
  estudiante_no_encontrado: { status: 404, message: ParticipanteSchema.estudianteNoEncontrado.const },
  cupo_exceeded: { status: 409, message: ParticipanteSchema.cupoExceeded.const },
  tipo_no_permitido: { status: 400, message: ParticipanteSchema.tipoNoPermitido.const },
  nivel_no_permitido: { status: 400, message: ParticipanteSchema.nivelNoPermitido.const },
  campo_requerido: { status: 400, message: ParticipanteSchema.campoRequerido.const },
};

export const participantes = new Elysia({ prefix: "/:id/participantes" })
  .post(
    "/",
    async ({ body, params: { id }, set }) => {
      const result = await addParticipante(id, body);
      if (!result.success) {
        const { status, message } = addParticipanteErrorMap[result.reason];
        set.status = status;
        return message;
      }
      if (result.concursoNombre && result.totalParticipantes !== undefined) {
        sendInscripcionConfirm(result.participante.correo, {
          nombre: result.participante.nombre,
          concurso: result.concursoNombre,
          tipo: result.participante.tipo,
          nivel: result.participante.nivel,
          campos: result.participante.campos,
          totalParticipantes: result.totalParticipantes,
        }).catch((err) => {
          logger.error("sendInscripcionConfirm failed", { module: "participantes", error: err });
        });
      }
      set.status = 201;
      return result.participante;
    },
    {
      auth: true,
      body: ParticipanteSchema.registerBody,
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        201: ParticipanteSchema.participanteResponse,
        400: t.Union([
          ParticipanteSchema.tipoNoPermitido,
          ParticipanteSchema.nivelNoPermitido,
          ParticipanteSchema.campoRequerido,
        ]),
        404: t.Union([ParticipanteSchema.concursoNotFound, ParticipanteSchema.estudianteNoEncontrado]),
        409: ParticipanteSchema.cupoExceeded,
        ...sharedAuthResponses,
      },
    }
  )
  .delete(
    "/:participacionId",
    async ({ params: { id, participacionId }, set }) => {
      const result = await removeParticipante(id, participacionId);
      if (!result.success) {
        set.status = 404;
        return ParticipanteSchema.concursoNotFound.const;
      }
      set.status = 204;
    },
    {
      auth: true,
      cookie: cookieSchema,
      params: t.Object({ id: t.String(), participacionId: t.String() }),
      response: {
        204: t.Undefined(),
        404: ParticipanteSchema.concursoNotFound,
        ...sharedAuthResponses,
      },
    }
  );
