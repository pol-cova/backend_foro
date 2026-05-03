import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { ConcursoModel } from "../concursos/mongoose";
import { EvaluationModel } from "./mongoose";
import { RubricTemplateModel } from "./mongoose";
import { normalizeCarrera } from "../../lib/carrera-utils";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, "_").substring(0, 50);
}

const MEMBER_FIELDS = ["nombre", "codigo", "correo", "tel", "carrera", "semestre"] as const;
const SKIP_IN_SHARED = new Set([...MEMBER_FIELDS.flatMap((f) => [1, 2, 3].map((i) => `${f}_${i}`))]);

function expandParticipante(p: { tipo: string; codigo: string; nombre: string; carrera: string; semestre: number; correo: string; escuela: string; nivel: string; campos: Record<string, string> }) {
  const campos = p.campos;

  if (p.tipo !== "modalidad_equipo") {
    return [{
      codigo: p.codigo,
      nombre: p.nombre,
      carrera: p.carrera,
      semestre: String(p.semestre),
      correo: p.correo,
      telefono: "",
      escuela: p.escuela,
      nivel: p.nivel,
      tipo: p.tipo,
      nombre_equipo: "Individual",
      descripcion_proyecto: campos["descripcion_proyecto"] ?? "",
      institucion: campos["institucion"] ?? p.escuela,
    }];
  }

  const shared = {
    escuela: p.escuela,
    nivel: p.nivel,
    tipo: p.tipo,
    nombre_equipo: campos["nombre_equipo"] ?? "",
    descripcion_proyecto: campos["descripcion_proyecto"] ?? "",
    institucion: campos["institucion"] ?? p.escuela,
  };

  const members = [];
  for (let i = 1; i <= 10; i++) {
    const nombre = campos[`nombre_${i}`];
    if (!nombre || nombre.trim() === "" || nombre.trim().toUpperCase() === "N/A") break;
    members.push({
      codigo: campos[`codigo_${i}`] ?? "",
      nombre,
      carrera: campos[`carrera_${i}`] ?? "",
      semestre: campos[`semestre_${i}`] ?? "",
      correo: campos[`correo_${i}`] ?? "",
      telefono: campos[`tel_${i}`] ?? "",
      ...shared,
    });
  }

  return members.length > 0 ? members : [{
    codigo: p.codigo,
    nombre: p.nombre,
    carrera: p.carrera,
    semestre: String(p.semestre),
    correo: p.correo,
    telefono: "",
    ...shared,
  }];
}

function buildCarreraCanonical(rawCarreras: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const byBase = new Map<string, string[]>();
  for (const c of rawCarreras) {
    const base = c.replace(/\s*\([^)]*\)\s*$/, "").trim().toUpperCase();
    const list = byBase.get(base) ?? [];
    list.push(c);
    byBase.set(base, list);
  }
  for (const versions of byBase.values()) {
    const canonical = versions.find((v) => /\([^)]+\)/.test(v)) ?? versions[0];
    for (const v of versions) map.set(v.toUpperCase(), canonical);
  }
  return map;
}

export async function exportParticipants(concursoId: string) {
  if (!mongoose.isValidObjectId(concursoId)) {
    return { success: false as const, reason: "not_found" as const };
  }

  const concurso = await ConcursoModel.findById(concursoId).lean();
  if (!concurso) {
    return { success: false as const, reason: "not_found" as const };
  }

  const headers = [
    "No.", "Nombre Equipo", "Codigo", "Nombre", "Carrera",
    "Semestre", "Correo", "Telefono", "Institucion", "Nivel", "Tipo",
    "Descripcion Proyecto",
  ];

  // First pass: collect all raw carrera values to build canonical map
  const allCarreras: string[] = [];
  for (const p of concurso.participantes ?? []) {
    const campos = p.campos instanceof Map ? Object.fromEntries(p.campos) : (p.campos ?? {});
    for (let i = 1; i <= 10; i++) {
      const c = campos[`carrera_${i}`];
      if (!c || c.trim().toUpperCase() === "N/A") break;
      allCarreras.push(c);
    }
    if (p.carrera) allCarreras.push(p.carrera);
  }
  const carreraCanonical = buildCarreraCanonical(allCarreras);

  const resolveCarrera = (raw: string) =>
    normalizeCarrera(carreraCanonical.get(raw.toUpperCase()) ?? raw);

  let rowNum = 1;
  const rows: Record<string, string | number>[] = [];

  for (const p of concurso.participantes ?? []) {
    const campos = p.campos instanceof Map ? Object.fromEntries(p.campos) : (p.campos ?? {});
    const members = expandParticipante({ ...p, campos });
    for (const m of members) {
      rows.push({
        "No.": rowNum++,
        "Nombre Equipo": m.nombre_equipo,
        Codigo: m.codigo,
        Nombre: m.nombre,
        Carrera: resolveCarrera(m.carrera),
        Semestre: m.semestre,
        Correo: m.correo,
        Telefono: m.telefono,
        Institucion: m.institucion,
        Nivel: m.nivel,
        Tipo: m.tipo,
        "Descripcion Proyecto": m.descripcion_proyecto,
      });
    }
  }

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Participantes");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = `participantes_${sanitizeFilename(concurso.nombre)}.xlsx`;

  return { success: true as const, buffer, filename };
}

export async function exportEvaluations(concursoId: string) {
  if (!mongoose.isValidObjectId(concursoId)) {
    return { success: false as const, reason: "not_found" as const };
  }

  const concurso = await ConcursoModel.findById(concursoId).lean();
  if (!concurso) {
    return { success: false as const, reason: "not_found" as const };
  }

  // Get rubric for criterion metadata
  let criteriaList: Array<{ id: string; question: string }> = [];
  if (concurso.rubricTemplateId) {
    const rubric = await RubricTemplateModel.findById(concurso.rubricTemplateId).lean();
    if (rubric) {
      for (const section of rubric.sections) {
        for (const criterion of section.criteria) {
          criteriaList.push({ id: criterion.id, question: criterion.question });
        }
      }
    }
  }

  const evaluations = await EvaluationModel.find({
    concursoId: new mongoose.Types.ObjectId(concursoId),
  }).lean();

  // Build headers
  const headers = [
    "No.",
    "Juez",
    "Codigo Participante",
    "Nombre Participante",
    "Nivel",
  ];
  for (const criterion of criteriaList) {
    headers.push(criterion.question);
  }
  headers.push("Puntaje Total", "Notas");

  // Build rows
  const rows = evaluations.map((evaluation, index) => {
    // Find participant
    const participant = concurso.participantes.find(
      (p) => p._id?.toString() === evaluation.participantId.toString()
    );

    const row: Record<string, string | number> = {
      "No.": index + 1,
      Juez: evaluation.judgeCodigo,
      "Codigo Participante": participant?.codigo ?? "",
      "Nombre Participante": participant?.nombre ?? "",
      Nivel: participant?.nivel ?? "",
    };

    // Add scores for each criterion
    for (const criterion of criteriaList) {
      const score = evaluation.scores.find((s) => s.criterionId === criterion.id);
      row[criterion.question] = score?.value ?? "";
    }

    row["Puntaje Total"] = evaluation.totalScore;
    row.Notas = evaluation.notes ?? "";

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Evaluaciones");

  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  const filename = `evaluaciones_${sanitizeFilename(concurso.nombre)}.xlsx`;

  return { success: true as const, buffer, filename };
}
