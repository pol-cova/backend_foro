import type { ConcursoTypes } from "./schema";
import type { ConfirmacionEmailEstado, Participante } from "./mongoose";
import { resumenParticipacionConcurso } from "./participante-count";
import { normalizeCarrera } from "../../lib/carrera-utils";

type ConcursoOut = ConcursoTypes["concursoResponse"];
type ParticipanteOut = ConcursoOut["participantes"][number];

interface MongooseParticipante {
  _id?: unknown;
  tipo: string;
  codigo: string;
  nombre: string;
  carrera: string;
  semestre: number;
  correo: string;
  escuela: string;
  nivel: string;
  campos?: Record<string, string> | Map<string, string>;
  confirmacionEmailEstado?: ConfirmacionEmailEstado;
  confirmacionEmailEnviadoEn?: Date;
  confirmacionEmailUltimoError?: string;
}

function mapConfirmacionEstado(raw: MongooseParticipante): ConfirmacionEmailEstado {
  const e = raw.confirmacionEmailEstado;
  if (e === "skipped" || e === "sent" || e === "failed" || e === "unknown") return e;
  return "unknown";
}

interface MongooseConcurso {
  _id?: unknown;
  nombre: string;
  cupo: number;
  sharedFields?: string[];
  constraints: ConcursoOut["constraints"];
  niveles: string[];
  participantes?: MongooseParticipante[];
  allowMultiple?: boolean;
  maxRegistrationsPerPerson?: number;
  rubricTemplateId?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

function ensureRecord(obj: unknown): Record<string, string> {
  if (obj instanceof Map) return Object.fromEntries(obj) as Record<string, string>;
  if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj as Record<string, string>;
  return {};
}

export function mapParticipante(raw: MongooseParticipante): ParticipanteOut {
  const campos = ensureRecord(raw.campos);
  return {
    _id: String(raw._id ?? ""),
    tipo: raw.tipo,
    codigo: raw.codigo,
    nombre: raw.nombre,
    carrera: raw.carrera,
    carreraNormalizada: normalizeCarrera(raw.carrera),
    semestre: raw.semestre,
    correo: raw.correo,
    escuela: raw.escuela,
    nivel: raw.nivel,
    campos,
    confirmacionEmailEstado: mapConfirmacionEstado(raw),
    confirmacionEmailEnviadoEn: raw.confirmacionEmailEnviadoEn,
    confirmacionEmailUltimoError: raw.confirmacionEmailUltimoError,
  };
}

export function mapConcursoToResponse(raw: MongooseConcurso): ConcursoOut {
  const participantes = (raw.participantes ?? []).map((p) => mapParticipante(p));
  const rawParts = (raw.participantes ?? []) as Participante[];
  const { participantes_totales, individuales, equipo } = resumenParticipacionConcurso(rawParts);
  return {
    _id: String(raw._id ?? ""),
    nombre: raw.nombre,
    cupo: raw.cupo,
    sharedFields: raw.sharedFields ?? [],
    constraints: raw.constraints,
    niveles: raw.niveles,
    participantes,
    participantes_totales,
    individuales,
    equipo,
    allowMultiple: raw.allowMultiple ?? false,
    maxRegistrationsPerPerson: raw.maxRegistrationsPerPerson,
    rubricTemplateId: raw.rubricTemplateId ? String(raw.rubricTemplateId) : undefined,
    createdAt: raw.createdAt ?? new Date(),
    updatedAt: raw.updatedAt ?? new Date(),
  };
}
