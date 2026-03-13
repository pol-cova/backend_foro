import { Elysia, t } from "elysia";
import { addParticipante, listParticipantes, removeParticipante } from "./service";
import { ParticipanteSchema } from "./schema";
import { logger } from "../../lib/logger";
import { sendInscripcionConfirm } from "../email/service";
import { cookieSchema, sharedAuthResponses } from "../auth/common";
import { AuthSchema } from "../auth/schema";

type AddParticipanteReason =
  | "not_found"
  | "estudiante_no_encontrado"
  | "cupo_exceeded"
  | "already_registered"
  | "tipo_no_permitido"
  | "nivel_no_permitido"
  | "campo_requerido"
  | "campo_vacio";

const addParticipanteErrorMap: Record<
  AddParticipanteReason,
  { status: 400 | 404 | 409; message: string }
> = {
  not_found: { status: 404, message: ParticipanteSchema.concursoNotFound.const },
  estudiante_no_encontrado: { status: 404, message: ParticipanteSchema.estudianteNoEncontrado.const },
  cupo_exceeded: { status: 409, message: ParticipanteSchema.cupoExceeded.const },
  already_registered: { status: 409, message: ParticipanteSchema.alreadyRegistered.const },
  tipo_no_permitido: { status: 400, message: ParticipanteSchema.tipoNoPermitido.const },
  nivel_no_permitido: { status: 400, message: ParticipanteSchema.nivelNoPermitido.const },
  campo_requerido: { status: 400, message: ParticipanteSchema.campoRequerido.const },
  campo_vacio: { status: 400, message: ParticipanteSchema.campoVacio.const },
};

export const participantes = new Elysia({ prefix: "/:id/participantes" })
  .get(
    "/",
    async ({ params: { id }, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
      const result = await listParticipantes(id);
      if (!result.success) {
        set.status = 404;
        return ParticipanteSchema.concursoNotFound.const;
      }
      return result.participantes;
    },
    {
      auth: true,
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: ParticipanteSchema.participantesListResponse,
        404: ParticipanteSchema.concursoNotFound,
        ...sharedAuthResponses,
      },
    }
  )
  .post(
    "/",
    async ({ body, params: { id }, set }) => {
      const result = await addParticipante(id, body);
      if (!result.success) {
        const { status, message } = addParticipanteErrorMap[result.reason];
        set.status = status;
        return message;
      }
      if (result.concursoNombre) {
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
      body: ParticipanteSchema.registerBody,
      params: t.Object({ id: t.String() }),
      response: {
        201: ParticipanteSchema.participanteResponse,
        400: t.Union([
          ParticipanteSchema.tipoNoPermitido,
          ParticipanteSchema.nivelNoPermitido,
          ParticipanteSchema.campoRequerido,
          ParticipanteSchema.campoVacio,
        ]),
        404: t.Union([ParticipanteSchema.concursoNotFound, ParticipanteSchema.estudianteNoEncontrado]),
        409: t.Union([ParticipanteSchema.cupoExceeded, ParticipanteSchema.alreadyRegistered]),
      },
    }
  )
  .delete(
    "/:participacionId",
    async ({ params: { id, participacionId }, user, set }) => {
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
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
