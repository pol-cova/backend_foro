import mongoose from "mongoose";
import { ConcursoModel, type ConstraintConfig, type Participante } from "../concursos/mongoose";
import { countParticipantes, esModalidadEquipo, ocupacionPorPersonas } from "../concursos/participante-count";
import { mapParticipante } from "../concursos/mappers";
import { getEstudianteByCodigo, type EstudiantePrefill } from "../sispa/service";
import { MAX_CAMPOS_KEYS, type ParticipanteSchemaTypes } from "./schema";

type RegisterData = ParticipanteSchemaTypes["registerBody"];

type RegisterAbortReason = "not_found" | "cupo_exceeded" | "already_registered";

class RegisterAbort extends Error {
  constructor(readonly reason: RegisterAbortReason) {
    super(reason);
    this.name = "RegisterAbort";
  }
}

function isTransientTransactionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const h = (err as { hasErrorLabel?: (label: string) => boolean }).hasErrorLabel;
  if (typeof h !== "function") return false;
  return h.call(err, "TransientTransactionError") || h.call(err, "UnknownTransactionCommitResult");
}

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

  const isCuvalles = (campos["institucion"] ?? "").toLowerCase().includes("cuvalles");

  let e: EstudiantePrefill;
  if (isCuvalles || !campos["institucion"]) {
    const estudianteRes = await getEstudianteByCodigo(normalized.codigo);
    if (!estudianteRes.success) return { success: false as const, reason: "estudiante_no_encontrado" as const };
    e = estudianteRes.estudiante;
  } else {
    e = {
      codigo: normalized.codigo,
      nombre: campos["nombre_1"] ?? normalized.codigo,
      correo: campos["correo_1"] ?? "",
      carrera: campos["carrera_1"] ?? "",
      semestre: normalized.semestre,
      escuela: campos["institucion"],
    };
  }

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

  let committed:
    | {
        participante: {
          _id: string;
          tipo: string;
          codigo: string;
          nombre: string;
          carrera: string;
          semestre: number;
          correo: string;
          escuela: string;
          nivel: string;
          campos: Record<string, string>;
        };
        concursoNombre: string;
        totalParticipantes: number;
      }
    | undefined;

  for (let attempt = 0; attempt < 3; attempt++) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const doc = await ConcursoModel.findById(concursoId).session(session);
        if (!doc) throw new RegisterAbort("not_found");

        const ocupacion = ocupacionPorPersonas(doc.participantes as Participante[]);
        const nuevo = countParticipantes(participante);
        if (ocupacion + nuevo > doc.cupo) throw new RegisterAbort("cupo_exceeded");

        const allowMultiple = doc.allowMultiple === true;
        const blockCodigoTipoDuplicate = !allowMultiple && !esModalidadEquipo(normalized.tipo);
        if (blockCodigoTipoDuplicate) {
          const exists = (doc.participantes ?? []).some(
            (p) => String(p.codigo) === String(participante.codigo) && String(p.tipo) === String(normalized.tipo)
          );
          if (exists) throw new RegisterAbort("already_registered");
        }

        doc.participantes.push(participante);
        await doc.save({ session });

        const parts = doc.participantes ?? [];
        const added = parts[parts.length - 1];
        if (!added?._id) throw new RegisterAbort("not_found");

        const camposFromDb = added.campos instanceof Map ? Object.fromEntries(added.campos) : (added.campos ?? {});
        committed = {
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
          concursoNombre: doc.nombre ?? "",
          totalParticipantes: ocupacionPorPersonas(parts as Participante[]),
        };
      });
      break;
    } catch (err) {
      if (err instanceof RegisterAbort) {
        return { success: false as const, reason: err.reason };
      }
      if (isTransientTransactionError(err) && attempt < 2) continue;
      throw err;
    } finally {
      session.endSession();
    }
  }

  const out = committed!;
  return {
    success: true as const,
    participante: out.participante,
    concursoNombre: out.concursoNombre,
    totalParticipantes: out.totalParticipantes,
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
