import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { config } from "../../config";
import { captureMessage, severityForHttpStatus } from "../../lib/error-tracker";
import { getCurrentRequestId } from "../../lib/logger";
import { getServerRef } from "../../lib/server-ref";
import {
  addParticipante,
  listParticipantes,
  removeParticipante,
  resendConfirmacionEmail,
  scheduleConfirmacionEmailAfterRegister,
} from "./service";
import { ParticipanteSchema } from "./schema";
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
  | "campo_vacio"
  | "campo_excess";

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
  campo_excess: { status: 400, message: ParticipanteSchema.payloadTooLarge.const },
};

export const participantes = new Elysia({ prefix: "/:id/participantes" })
  .use(
    rateLimit({
      ...config.rateLimit,
      skip: (req) => req.method !== "POST",
      scoping: "scoped",
      injectServer: () => getServerRef(),
    } as Parameters<typeof rateLimit>[0])
  )
  .get(
    "/",
    async ({ params: { id }, set, ...rest }) => {
      const user = (rest as unknown as { user: { isAdmin: boolean } }).user;
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
        captureMessage(`Participante registration failed: ${result.reason}`, severityForHttpStatus(status), {
          requestId: getCurrentRequestId(),
          tags: {
            flow: "participante_register",
            reason: result.reason,
          },
          extra: { concursoId: id },
        });
        set.status = status;
        return message;
      }
      const mailTo = result.participante.campos?.correo?.trim() || result.participante.correo;
      if (result.concursoNombre) {
        scheduleConfirmacionEmailAfterRegister(id, result.participante._id, result.concursoNombre, mailTo, {
          nombre: result.participante.nombre,
          concurso: result.concursoNombre,
          tipo: result.participante.tipo,
          nivel: result.participante.nivel,
          campos: result.participante.campos,
          totalParticipantes: result.totalParticipantes,
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
          ParticipanteSchema.payloadTooLarge,
        ]),
        404: t.Union([ParticipanteSchema.concursoNotFound, ParticipanteSchema.estudianteNoEncontrado]),
        409: t.Union([ParticipanteSchema.cupoExceeded, ParticipanteSchema.alreadyRegistered]),
      },
    }
  )
  .post(
    "/:participacionId/confirmacion-email",
    async ({ params: { id, participacionId }, set, ...rest }) => {
      const user = (rest as unknown as { user: { isAdmin: boolean } }).user;
      if (!user.isAdmin) {
        set.status = 403;
        return AuthSchema.forbidden.const;
      }
      const outcome = await resendConfirmacionEmail(id, participacionId);
      if (!outcome.ok) {
        if (outcome.reason === "not_found") {
          set.status = 404;
          return ParticipanteSchema.concursoNotFound.const;
        }
        if (outcome.reason === "participante_not_found") {
          set.status = 404;
          return ParticipanteSchema.participanteNotFound.const;
        }
        if (outcome.reason === "no_correo") {
          set.status = 400;
          return ParticipanteSchema.confirmacionEmailNoCorreo.const;
        }
        set.status = 502;
        return ParticipanteSchema.confirmacionEmailSmtpFailed.const;
      }
      return { ok: true as const };
    },
    {
      auth: true,
      cookie: cookieSchema,
      params: t.Object({ id: t.String(), participacionId: t.String() }),
      response: {
        200: ParticipanteSchema.confirmacionEmailResendOk,
        400: ParticipanteSchema.confirmacionEmailNoCorreo,
        404: t.Union([ParticipanteSchema.concursoNotFound, ParticipanteSchema.participanteNotFound]),
        502: ParticipanteSchema.confirmacionEmailSmtpFailed,
        ...sharedAuthResponses,
      },
    }
  )
  .delete(
    "/:participacionId",
    async ({ params: { id, participacionId }, set, ...rest }) => {
      const user = (rest as unknown as { user: { isAdmin: boolean } }).user;
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
