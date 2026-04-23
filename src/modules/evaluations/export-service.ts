import mongoose from "mongoose";
import * as XLSX from "xlsx";
import { ConcursoModel } from "../concursos/mongoose";
import { EvaluationModel } from "./mongoose";
import { RubricTemplateModel } from "./mongoose";

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9\-_]/g, "_").substring(0, 50);
}

export async function exportParticipants(concursoId: string) {
  if (!mongoose.isValidObjectId(concursoId)) {
    return { success: false as const, reason: "not_found" as const };
  }

  const concurso = await ConcursoModel.findById(concursoId).lean();
  if (!concurso) {
    return { success: false as const, reason: "not_found" as const };
  }

  const participants = concurso.participantes ?? [];

  // Build headers
  const headers = [
    "No.",
    "Codigo",
    "Nombre",
    "Carrera",
    "Semestre",
    "Correo",
    "Escuela",
    "Nivel",
    "Tipo",
  ];

  // Collect all unique campo keys
  const campoKeys = new Set<string>();
  for (const p of participants) {
    const campos = p.campos instanceof Map ? Object.fromEntries(p.campos) : (p.campos ?? {});
    for (const key of Object.keys(campos)) {
      campoKeys.add(key);
    }
  }
  const sortedCampoKeys = Array.from(campoKeys).sort();
  headers.push(...sortedCampoKeys);

  // Build rows
  const rows = participants.map((p, index) => {
    const campos = p.campos instanceof Map ? Object.fromEntries(p.campos) : (p.campos ?? {});
    const row: Record<string, string | number> = {
      "No.": index + 1,
      Codigo: p.codigo,
      Nombre: p.nombre,
      Carrera: p.carrera,
      Semestre: p.semestre,
      Correo: p.correo,
      Escuela: p.escuela,
      Nivel: p.nivel,
      Tipo: p.tipo,
    };
    for (const key of sortedCampoKeys) {
      row[key] = campos[key] ?? "";
    }
    return row;
  });

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
