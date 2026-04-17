import { render } from "@react-email/render";
import nodemailer from "nodemailer";
import { config } from "../../config";
import { captureException } from "../../lib/error-tracker";
import { logger } from "../../lib/logger";
import SuccessEmail from "./success";

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth:
    config.smtp.user && config.smtp.pass
      ? { user: config.smtp.user, pass: config.smtp.pass }
      : undefined,
});

type MailCaptureEntry = { to: string; payload: InscripcionConfirmPayload };

let mailCapture: ((entry: MailCaptureEntry) => void) | null = null;

export function setMailCapture(cb: ((entry: MailCaptureEntry) => void) | null) {
  mailCapture = cb;
}

export function clearMailCapture() {
  mailCapture = null;
}

export interface InscripcionConfirmPayload {
  nombre: string;
  concurso: string;
  tipo: string;
  nivel: string;
  campos: Record<string, string>;
  totalParticipantes: number;
}

function isPayloadValid(payload: InscripcionConfirmPayload): boolean {
  return Boolean(
    payload.nombre?.trim() &&
      payload.concurso?.trim() &&
      typeof payload.totalParticipantes === "number"
  );
}

function sanitizePayload(payload: InscripcionConfirmPayload): InscripcionConfirmPayload {
  const campos = payload.campos ?? {};
  const sanitizedCampos: Record<string, string> = {};
  for (const [key, value] of Object.entries(campos)) {
    if (value != null && typeof value === "object") continue;
    const str = String(value ?? "").trim();
    if (str && str.toUpperCase() !== "N/A") sanitizedCampos[key] = str;
  }
  return {
    nombre: String(payload.nombre ?? "").trim(),
    concurso: String(payload.concurso ?? "").trim(),
    tipo: String(payload.tipo ?? "").trim(),
    nivel: String(payload.nivel ?? "").trim(),
    campos: sanitizedCampos,
    totalParticipantes: Number(payload.totalParticipantes) || 0,
  };
}

export async function sendInscripcionConfirm(to: string, payload: InscripcionConfirmPayload): Promise<boolean> {
  if (!to?.trim()) {
    logger.warn("sendInscripcionConfirm skipped: empty correo", { module: "email", to });
    return false;
  }
  if (!isPayloadValid(payload)) {
    logger.warn("sendInscripcionConfirm skipped: invalid payload", { module: "email", payload });
    return false;
  }

  if (config.testing) {
    if (mailCapture) mailCapture({ to: to.trim(), payload: sanitizePayload(payload) });
    return true;
  }

  const subject = `Inscripcion confirmada - ${payload.concurso}`;
  const sanitized = sanitizePayload(payload);
  const html = await render(SuccessEmail(sanitized));

  try {
    await transporter.sendMail({
      from: config.smtp.from,
      to: to.trim(),
      subject,
      html,
    });
    logger.info("sendInscripcionConfirm sent", { module: "email", to: to.trim(), subject });
    return true;
  } catch (err) {
    logger.error("sendInscripcionConfirm failed", { module: "email", error: err });
    captureException(err, {
      tags: { source: "email", action: "sendInscripcionConfirm" },
      extra: { to: to.trim(), subject },
    });
    throw err;
  }
}