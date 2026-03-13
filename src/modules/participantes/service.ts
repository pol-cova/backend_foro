import mongoose from "mongoose";
import { ConcursoModel, type ConstraintConfig, type Participante } from "../concursos/mongoose";
import { mapParticipante } from "../concursos/mappers";
import { getEstudianteByCodigo } from "../sispa/service";
import type { ParticipanteSchemaTypes } from "./schema";

type RegisterData = ParticipanteSchemaTypes["registerBody"];

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
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "not_found" as const };
  const concurso = await ConcursoModel.findById(concursoId);
  if (!concurso) return { success: false as const, reason: "not_found" as const };

  const constraint = findConstraint(concurso.constraints, data.tipo);
  if (!constraint) return { success: false as const, reason: "tipo_no_permitido" as const };
  if (!concurso.niveles.includes(data.nivel)) return { success: false as const, reason: "nivel_no_permitido" as const };

  const campos: Record<string, string> = data.campos ?? {};
  const requiredFields = getRequiredFields(constraint);
  for (const fieldName of requiredFields) {
    const resolved = resolveCampo(campos, fieldName);
    if ("missing" in resolved) return { success: false as const, reason: "campo_requerido" as const };
    if ("empty" in resolved) return { success: false as const, reason: "campo_vacio" as const };
  }

  const { participantes, cupo } = concurso;
  if (participantes.length >= cupo) return { success: false as const, reason: "cupo_exceeded" as const };

  const allowMultiple = concurso.allowMultiple === true;
  if (!allowMultiple) {
    const alreadyInSameTipo = participantes.some(
      (p) => String(p.codigo) === String(data.codigo) && String(p.tipo) === String(data.tipo)
    );
    if (alreadyInSameTipo) return { success: false as const, reason: "already_registered" as const };
  }

  const estudianteRes = await getEstudianteByCodigo(data.codigo);
  if (!estudianteRes.success) return { success: false as const, reason: "estudiante_no_encontrado" as const };
  const e = estudianteRes.estudiante;

  const camposOut: Record<string, string> = {};
  for (const fieldName of requiredFields) {
    const resolved = resolveCampo(campos, fieldName);
    if ("value" in resolved) camposOut[fieldName] = resolved.value;
  }

  const participante: Participante = {
    tipo: data.tipo,
    codigo: e.codigo,
    nombre: e.nombre,
    carrera: e.carrera,
    semestre: e.semestre,
    correo: e.correo,
    escuela: e.escuela,
    nivel: data.nivel,
    campos: camposOut,
  };

  const updated = await ConcursoModel.findByIdAndUpdate(
    concursoId,
    { $push: { participantes: participante } },
    { returnDocument: "after" }
  );
  const parts = updated?.participantes ?? [];
  const added = parts[parts.length - 1];
  if (!added) return { success: false as const, reason: "not_found" as const };

  const camposOut = added.campos instanceof Map ? Object.fromEntries(added.campos) : (added.campos ?? {});
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
      campos: camposOut as Record<string, string>,
    },
    concursoNombre: updated?.nombre ?? "",
    totalParticipantes: parts.length,
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
