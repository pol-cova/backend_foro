import mongoose from "mongoose";
import { ConcursoModel, type ConstraintConfig, type Participante } from "../concursos/mongoose";
import { mapParticipante } from "../concursos/mappers";
import { getEstudianteByCodigo } from "../sispa/service";
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
    .select("constraints sharedFields niveles allowMultiple cupo nombre")
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

  const estudianteRes = await getEstudianteByCodigo(normalized.codigo);
  if (!estudianteRes.success) return { success: false as const, reason: "estudiante_no_encontrado" as const };
  const e = estudianteRes.estudiante;

  const camposOut: Record<string, string> = {};
  for (const fieldName of requiredFields) {
    const resolved = resolveCampo(campos, fieldName);
    if ("value" in resolved) camposOut[fieldName] = resolved.value;
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

  const allowMultiple = concurso.allowMultiple === true;
  const filter: Record<string, unknown> = {
    _id: new mongoose.Types.ObjectId(concursoId),
    $expr: { $lt: [{ $size: { $ifNull: ["$participantes", []] } }, "$cupo"] },
  };
  if (!allowMultiple) {
    filter["participantes"] = {
      $not: { $elemMatch: { codigo: normalized.codigo, tipo: normalized.tipo } },
    };
  }

  const updated = await ConcursoModel.findOneAndUpdate(
    filter,
    { $push: { participantes: participante } },
    { returnDocument: "after" }
  );

  if (!updated) {
    const fallback = await ConcursoModel.findById(concursoId)
      .select("participantes cupo nombre")
      .lean();
    if (!fallback) return { success: false as const, reason: "not_found" as const };
    if ((fallback.participantes?.length ?? 0) >= fallback.cupo) {
      return { success: false as const, reason: "cupo_exceeded" as const };
    }
    if (!allowMultiple) {
      const exists = (fallback.participantes ?? []).some(
        (p) => String(p.codigo) === String(normalized.codigo) && String(p.tipo) === String(normalized.tipo)
      );
      if (exists) return { success: false as const, reason: "already_registered" as const };
    }
    return { success: false as const, reason: "cupo_exceeded" as const };
  }

  const parts = updated.participantes ?? [];
  const added = parts[parts.length - 1];
  if (!added) return { success: false as const, reason: "not_found" as const };
  const totalParticipantes = parts.length;

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
    },
    concursoNombre: updated.nombre ?? "",
    totalParticipantes,
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
