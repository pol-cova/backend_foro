import mongoose from "mongoose";
import { ConcursoModel } from "./mongoose";
import type { ConcursoTypes } from "./schema";
import { mapConcursoToResponse } from "./mappers";

type CreateData = ConcursoTypes["createBody"];
type UpdateData = ConcursoTypes["updateBody"];

type ConstraintInput = CreateData["constraints"];

function normalizeConstraints(c: ConstraintInput): { id: string; field?: string; allowMultiple: boolean }[] {
  if (Array.isArray(c)) {
    return c.map((x) => ({ ...x, allowMultiple: x.allowMultiple === true }));
  }
  return Object.entries(c).map(([id, field]) => ({
    id,
    ...(field && { field }),
    allowMultiple: false,
  }));
}

export async function create(data: CreateData) {
  const constraints = normalizeConstraints(data.constraints);
  if (data.niveles.length === 0) return { success: false as const, reason: "niveles_empty" as const };
  if (constraints.length === 0) return { success: false as const, reason: "constraints_empty" as const };
  const concurso = await ConcursoModel.create({
    nombre: data.nombre,
    cupo: data.cupo,
    constraints,
    niveles: data.niveles,
    participantes: [],
  });
  return { success: true as const, concurso: mapConcursoToResponse(concurso.toObject()) };
}

export async function list(): Promise<ConcursoTypes["concursosListResponse"]> {
  const concursos = await ConcursoModel.find().select("-__v").lean();
  return concursos.map((c) => mapConcursoToResponse(c));
}

export async function getById(id: string) {
  if (!mongoose.isValidObjectId(id)) return { success: false as const, reason: "not_found" as const };
  const concurso = await ConcursoModel.findById(id);
  if (!concurso) return { success: false as const, reason: "not_found" as const };
  return { success: true as const, concurso: mapConcursoToResponse(concurso.toObject()) };
}

export async function update(id: string, data: UpdateData) {
  if (!mongoose.isValidObjectId(id)) return { success: false as const, reason: "not_found" as const };
  const payload: Record<string, unknown> = {};
  if (data.nombre !== undefined) payload.nombre = data.nombre;
  if (data.cupo !== undefined) payload.cupo = data.cupo;
  if (data.niveles !== undefined) {
    if (data.niveles.length === 0) return { success: false as const, reason: "niveles_empty" as const };
    payload.niveles = data.niveles;
  }
  if (data.constraints !== undefined) {
    const constraints = normalizeConstraints(data.constraints);
    if (constraints.length === 0) return { success: false as const, reason: "constraints_empty" as const };
    payload.constraints = constraints;
  }
  const concurso = await ConcursoModel.findByIdAndUpdate(id, { $set: payload }, { returnDocument: "after", runValidators: true });
  if (!concurso) return { success: false as const, reason: "not_found" as const };
  return { success: true as const, concurso: mapConcursoToResponse(concurso.toObject()) };
}

export async function deleteConcurso(id: string) {
  if (!mongoose.isValidObjectId(id)) return { success: false as const, reason: "not_found" as const };
  const result = await ConcursoModel.deleteOne({ _id: id });
  if (result.deletedCount === 0) return { success: false as const, reason: "not_found" as const };
  return { success: true as const };
}
