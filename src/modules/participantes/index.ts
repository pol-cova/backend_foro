import { Elysia, t } from "elysia";
import { rateLimit } from "elysia-rate-limit";
import { config } from "../../config";
import { captureMessage, severityForHttpStatus } from "../../lib/error-tracker";
import { getCurrentRequestId } from "../../lib/logger";
import { getServerRef } from "../../lib/server-ref";
import {
  addParticipante,
  changeNivel,
  listParticipantes,
  removeParticipante,
  resendConfirmacionEmail,
  scheduleConfirmacionEmailAfterRegister,
} from "./service";
import { sendCambioNivel } from "../email/service";
import { normalizeCarrera } from "../../lib/carrera-utils";
import { ParticipanteSchema } from "./schema";
import { cookieSchema, sharedAuthResponses } from "../auth/common";
import { AuthSchema } from "../auth/schema";
import { auth } from "../auth";

type AddParticipanteReason =
  | "not_found"
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
  cupo_exceeded: { status: 409, message: ParticipanteSchema.cupoExceeded.const },
  already_registered: { status: 409, message: ParticipanteSchema.alreadyRegistered.const },
  tipo_no_permitido: { status: 400, message: ParticipanteSchema.tipoNoPermitido.const },
  nivel_no_permitido: { status: 400, message: ParticipanteSchema.nivelNoPermitido.const },
  campo_requerido: { status: 400, message: ParticipanteSchema.campoRequerido.const },
  campo_vacio: { status: 400, message: ParticipanteSchema.campoVacio.const },
  campo_excess: { status: 400, message: ParticipanteSchema.payloadTooLarge.const },
};

export const participantes = new Elysia({ prefix: "/:id/participantes" })
  .use(auth)
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
    async ({ params: { id }, set }) => {
      const result = await listParticipantes(id);
      if (!result.success) {
        set.status = 404;
        return ParticipanteSchema.concursoNotFound.const;
      }
      return result.participantes;
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager"],
      cookie: cookieSchema,
      params: t.Object({ id: t.String() }),
      response: {
        200: ParticipanteSchema.participantesListResponse,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: ParticipanteSchema.concursoNotFound,
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
      return { ...result.participante, carreraNormalizada: normalizeCarrera(result.participante.carrera) };
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
        404: ParticipanteSchema.concursoNotFound,
        409: t.Union([ParticipanteSchema.cupoExceeded, ParticipanteSchema.alreadyRegistered]),
      },
    }
  )
  .post(
    "/:participacionId/confirmacion-email",
    async ({ params: { id, participacionId }, set }) => {
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
      authorize: "admin",
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
  .patch(
    "/:participacionId/nivel",
    async ({ params: { id, participacionId }, body, set }) => {
      const result = await changeNivel(id, participacionId, body);
      if (!result.success) {
        if (result.reason === "participante_not_found") {
          set.status = 404;
          return ParticipanteSchema.participanteNotFound.const;
        }
        if (result.reason === "not_found") {
          set.status = 404;
          return ParticipanteSchema.concursoNotFound.const;
        }
        set.status = 400;
        return ParticipanteSchema.nivelNoPermitido.const;
      }
      if (result.mailTo) {
        void (async () => {
          try {
            await sendCambioNivel(result.mailTo!, {
              nombre: result.participanteName,
              concurso: result.concursoNombre,
              nivelNuevo: result.nivel,
              razon: body.razon,
            });
          } catch {}
        })();
      }
      return { ok: true as const, nivel: result.nivel };
    },
    {
      auth: true,
      authorizeEvent: ["admin", "eventManager"],
      cookie: cookieSchema,
      body: ParticipanteSchema.changeNivelBody,
      params: t.Object({ id: t.String(), participacionId: t.String() }),
      response: {
        200: ParticipanteSchema.changeNivelResponse,
        400: ParticipanteSchema.nivelNoPermitido,
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: t.Union([ParticipanteSchema.concursoNotFound, ParticipanteSchema.participanteNotFound]),
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
      authorize: "admin",
      cookie: cookieSchema,
      params: t.Object({ id: t.String(), participacionId: t.String() }),
      response: {
        204: t.Undefined(),
        401: AuthSchema.unauthorized,
        403: AuthSchema.forbidden,
        404: ParticipanteSchema.concursoNotFound,
      },
    }
  );
