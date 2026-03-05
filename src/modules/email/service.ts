import { renderToStaticMarkup } from "react-dom/server";
import nodemailer from "nodemailer";
import { config } from "../../config";
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

export async function sendInscripcionConfirm(to: string, payload: InscripcionConfirmPayload) {
  if (!to?.trim()) return;
  if (!isPayloadValid(payload)) return;

  const subject = `Inscripcion confirmada - ${payload.concurso}`;
  const html = renderToStaticMarkup(SuccessEmail(payload));

  try {
    await transporter.sendMail({
      from: config.smtp.from,
      to: to.trim(),
      subject,
      html,
    });
  } catch (err) {
    logger.error("sendInscripcionConfirm failed", { module: "email", error: err });
    throw err;
  }
}