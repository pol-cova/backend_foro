import mongoose from "mongoose";
import { ConcursoModel, type ConstraintConfig, type Participante } from "../concursos/mongoose";
import { countParticipantes, esModalidadEquipo, ocupacionPorPersonas } from "../concursos/participante-count";
import { mapParticipante } from "../concursos/mappers";
import { sendInscripcionConfirm, type InscripcionConfirmPayload } from "../email/service";
import { applyConfirmacionEmailResult } from "./confirmacion-email-tracking";
import { MAX_CAMPOS_KEYS, type ParticipanteSchemaTypes } from "./schema";

type RegisterData = ParticipanteSchemaTypes["registerBody"];

function normalizeInput(data: RegisterData): RegisterData {
  const codigo = String(data.codigo ?? "").trim();
  const tipo = String(data.tipo ?? "").trim();
  const nivel = String(data.nivel ?? "").trim();
  const semestre = typeof data.semestre === "number" ? data.semestre : Number(data.semestre) || 1;
  const campos: Record<string, string> = {};
  for (const [k, v] of Object.entries(data.campos ?? {})) {
    if (typeof v === "string") campos[k] = v.trim();
  }
  return { codigo, tipo, nivel, semestre, campos };
}

const CAMPO_ALIASES: Record<string, string[]> = {
  proyecto: ["descripcion_proyecto"],
  descripcion_proyecto: ["descripcion"],
  proyecto_desc: ["descripcion_proyecto", "descripcion"],
};

function findConstraint(constraints: ConstraintConfig[], tipo: string) {
  return constraints.find((c) => c.id === tipo);
}

function resolveCampo(
  campos: Record<string, string>,
  fieldName: string
): { value: string; source: string } | { missing: true } | { empty: true } {
  const keysToTry = [fieldName, ...(CAMPO_ALIASES[fieldName] ?? [])];
  for (const key of keysToTry) {
    const v = campos[key];
    if (v !== undefined) {
      if (v.trim() === "") return { empty: true };
      return { value: v, source: key };
    }
  }
  return { missing: true };
}

function pickIndexedField(campos: Record<string, string>, base: string): string | undefined {
  if (campos[base]?.trim()) return campos[base].trim();
  const re = new RegExp(`^${base}_(\\d+)$`, "i");
  const matches: { index: number; value: string }[] = [];
  for (const [k, v] of Object.entries(campos)) {
    const m = re.exec(k);
    if (m && v.trim()) matches.push({ index: Number(m[1]), value: v.trim() });
  }
  matches.sort((a, b) => a.index - b.index);
  return matches[0]?.value;
}

function getRequiredFields(constraint: ConstraintConfig): string[] {
  if (constraint.fields && constraint.fields.length > 0) return constraint.fields;
  if (constraint.field && constraint.field !== "true" && constraint.field !== "false") {
    return [constraint.field];
  }
  return [];
}

export async function addParticipante(concursoId: string, data: RegisterData) {
  const normalized = normalizeInput(data);
  if (!normalized.codigo) return { success: false as const, reason: "campo_vacio" as const };
  if (Object.keys(normalized.campos ?? {}).length > MAX_CAMPOS_KEYS) {
    return { success: false as const, reason: "campo_excess" as const };
  }

  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "not_found" as const };

  const concurso = await ConcursoModel.findById(concursoId)
    .select("constraints sharedFields niveles allowMultiple maxRegistrationsPerPerson cupo nombre")
    .lean();
  if (!concurso) return { success: false as const, reason: "not_found" as const };

  const constraint = findConstraint(concurso.constraints, normalized.tipo);
  if (!constraint) return { success: false as const, reason: "tipo_no_permitido" as const };
  if (!concurso.niveles.includes(normalized.nivel)) return { success: false as const, reason: "nivel_no_permitido" as const };

  const campos: Record<string, string> = normalized.campos ?? {};
  const shared = concurso.sharedFields ?? [];
  const tipoSpecific = getRequiredFields(constraint);
  const requiredFields = [...shared, ...tipoSpecific];
  for (const fieldName of requiredFields) {
    const resolved = resolveCampo(campos, fieldName);
    if ("missing" in resolved) return { success: false as const, reason: "campo_requerido" as const };
    if ("empty" in resolved) return { success: false as const, reason: "campo_vacio" as const };
  }

  const e = {
    codigo: normalized.codigo,
    nombre: campos["nombre_completo"] ?? pickIndexedField(campos, "nombre") ?? normalized.codigo,
    correo: pickIndexedField(campos, "correo") ?? "",
    carrera: campos["carrera_o_semestre"] ?? pickIndexedField(campos, "carrera") ?? "",
    semestre: normalized.semestre,
    escuela: campos["institucion"] ?? "CUVALLES",
  };

  const camposOut: Record<string, string> = {};
  for (const fieldName of requiredFields) {
    const resolved = resolveCampo(campos, fieldName);
    if ("value" in resolved) camposOut[fieldName] = resolved.value;
  }
  for (const [k, v] of Object.entries(normalized.campos ?? {})) {
    if (/^codigo_\d+$/i.test(k) && typeof v === "string") {
      camposOut[k] = v;
    }
  }

  const participante: Participante = {
    tipo: normalized.tipo,
    codigo: e.codigo,
    nombre: e.nombre,
    carrera: e.carrera,
    semestre: normalized.semestre,
    correo: e.correo,
    escuela: e.escuela,
    nivel: normalized.nivel,
    campos: camposOut,
  };

  const doc = await ConcursoModel.findById(concursoId);
  if (!doc) return { success: false as const, reason: "not_found" as const };

  const ocupacion = ocupacionPorPersonas(doc.participantes as Participante[]);
  const nuevo = countParticipantes(participante);
  if (ocupacion + nuevo > doc.cupo) return { success: false as const, reason: "cupo_exceeded" as const };

  const maxRegistrations = doc.maxRegistrationsPerPerson ?? (doc.allowMultiple === true ? Infinity : 1);
  if (!esModalidadEquipo(normalized.tipo)) {
    const existingCount = (doc.participantes ?? []).filter(
      (p) => String(p.codigo) === String(participante.codigo) && String(p.tipo) === String(normalized.tipo)
    ).length;
    if (existingCount >= maxRegistrations) return { success: false as const, reason: "already_registered" as const };
  }

  doc.participantes.push(participante);
  await doc.save();

  const parts = doc.participantes ?? [];
  const added = parts[parts.length - 1];
  if (!added?._id) return { success: false as const, reason: "not_found" as const };

  const camposFromDb = added.campos instanceof Map ? Object.fromEntries(added.campos) : (added.campos ?? {});

  return {
    success: true as const,
    participante: {
      _id: String(added._id),
      tipo: added.tipo,
      codigo: added.codigo,
      nombre: added.nombre,
      carrera: added.carrera,
      semestre: added.semestre,
      correo: added.correo,
      escuela: added.escuela,
      nivel: added.nivel,
      campos: camposFromDb as Record<string, string>,
      confirmacionEmailEstado: "unknown" as const,
      confirmacionEmailEnviadoEn: undefined,
      confirmacionEmailUltimoError: undefined,
    },
    concursoNombre: doc.nombre ?? "",
    totalParticipantes: ocupacionPorPersonas(parts as Participante[]),
  };
}

export function scheduleConfirmacionEmailAfterRegister(
  concursoId: string,
  participacionId: string,
  concursoNombre: string,
  mailTo: string,
  payload: InscripcionConfirmPayload
): void {
  if (!concursoNombre?.trim()) return;
  void (async () => {
    try {
      const sent = await sendInscripcionConfirm(mailTo, payload);
      if (sent) await applyConfirmacionEmailResult(concursoId, participacionId, { kind: "sent" });
      else await applyConfirmacionEmailResult(concursoId, participacionId, { kind: "skipped" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await applyConfirmacionEmailResult(concursoId, participacionId, { kind: "failed", error: msg });
    }
  })();
}

export type ResendConfirmacionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "not_found" | "participante_not_found" | "no_correo" | "smtp_failed";
    };

export async function resendConfirmacionEmail(
  concursoId: string,
  participacionId: string
): Promise<ResendConfirmacionResult> {
  if (!mongoose.isValidObjectId(concursoId) || !mongoose.isValidObjectId(participacionId)) {
    return { ok: false, reason: "not_found" };
  }

  const doc = await ConcursoModel.findById(concursoId).select("nombre participantes").lean();
  if (!doc) return { ok: false, reason: "not_found" };

  const parts = doc.participantes ?? [];
  const raw = parts.find((p) => String(p._id) === participacionId);
  if (!raw) return { ok: false, reason: "participante_not_found" };

  const camposRaw = raw.campos instanceof Map ? Object.fromEntries(raw.campos) : (raw.campos ?? {});
  const campos = camposRaw as Record<string, string>;
  const mailTo = (campos["correo"] ?? "").trim() || String(raw.correo ?? "").trim();
  if (!mailTo) return { ok: false, reason: "no_correo" };

  const totalParticipantes = ocupacionPorPersonas(parts as Participante[]);
  const payload: InscripcionConfirmPayload = {
    nombre: raw.nombre,
    concurso: doc.nombre ?? "",
    tipo: raw.tipo,
    nivel: raw.nivel,
    campos,
    totalParticipantes,
  };

  try {
    const sent = await sendInscripcionConfirm(mailTo, payload);
    if (sent) {
      await applyConfirmacionEmailResult(concursoId, participacionId, { kind: "sent" });
      return { ok: true };
    }
    await applyConfirmacionEmailResult(concursoId, participacionId, { kind: "skipped" });
    return { ok: false, reason: "no_correo" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await applyConfirmacionEmailResult(concursoId, participacionId, { kind: "failed", error: msg });
    return { ok: false, reason: "smtp_failed" };
  }
}

export async function changeNivel(
  concursoId: string,
  participacionId: string,
  data: { nivel: string; razon: string }
): Promise<
  | { success: true; nivel: string; mailTo: string | null; participanteName: string; concursoNombre: string }
  | { success: false; reason: "not_found" | "participante_not_found" | "nivel_no_permitido" | "mismo_nivel" }
> {
  if (!mongoose.isValidObjectId(concursoId) || !mongoose.isValidObjectId(participacionId)) {
    return { success: false, reason: "not_found" };
  }

  const concurso = await ConcursoModel.findById(concursoId)
    .select("nombre niveles participantes")
    .lean();
  if (!concurso) return { success: false, reason: "not_found" };

  if (!concurso.niveles.includes(data.nivel)) {
    return { success: false, reason: "nivel_no_permitido" };
  }

  const participante = (concurso.participantes ?? []).find(
    (p) => String(p._id) === participacionId
  );
  if (!participante) return { success: false, reason: "participante_not_found" };

  if (participante.nivel === data.nivel) {
    return { success: false, reason: "mismo_nivel" };
  }

  await ConcursoModel.findOneAndUpdate(
    { _id: concursoId, "participantes._id": new mongoose.Types.ObjectId(participacionId) },
    { $set: { "participantes.$.nivel": data.nivel } }
  );

  const camposRaw = participante.campos instanceof Map
    ? Object.fromEntries(participante.campos)
    : (participante.campos ?? {});
  const campos = camposRaw as Record<string, string>;
  const mailTo = (campos["correo"] ?? "").trim() || String(participante.correo ?? "").trim() || null;

  return {
    success: true,
    nivel: data.nivel,
    mailTo,
    participanteName: participante.nombre,
    concursoNombre: concurso.nombre ?? "",
  };
}

export async function listParticipantes(concursoId: string) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "not_found" as const };
  const concurso = await ConcursoModel.findById(concursoId).lean();
  if (!concurso) return { success: false as const, reason: "not_found" as const };
  const participantes = (concurso.participantes ?? []).map((p) => mapParticipante(p));
  return { success: true as const, participantes };
}

export async function removeParticipante(concursoId: string, participacionId: string) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const };
  if (!mongoose.isValidObjectId(participacionId)) return { success: false as const };
  const result = await ConcursoModel.findByIdAndUpdate(
    concursoId,
    { $pull: { participantes: { _id: new mongoose.Types.ObjectId(participacionId) } } }
  );
  if (!result) return { success: false as const };
  return { success: true as const };
}
