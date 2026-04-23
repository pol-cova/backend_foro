import mongoose from "mongoose";
import { RubricTemplateModel, EvaluationModel } from "./mongoose";
import { ConcursoModel } from "../concursos/mongoose";
import { mapConcursoToResponse } from "../concursos/mappers";
import { broadcastScoreboardUpdate } from "./sse";
import type { RubricTypes, EvaluationTypes } from "./schema";

type RubricCreateData = RubricTypes["createBody"];
type RubricUpdateData = RubricTypes["updateBody"];
type EvaluationCreateData = EvaluationTypes["createBody"];

// ─── Rubric Template Service ───

interface RubricTemplateDoc {
  _id: mongoose.Types.ObjectId;
  name: string;
  sections: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRubricToResponse(rubric: RubricTemplateDoc) {
  return {
    _id: String(rubric._id),
    name: rubric.name,
    sections: rubric.sections,
    createdBy: rubric.createdBy,
    createdAt: rubric.createdAt,
    updatedAt: rubric.updatedAt,
  };
}

export async function createRubric(data: RubricCreateData, createdBy: string) {
  const rubric = await RubricTemplateModel.create({
    name: data.name,
    sections: data.sections,
    createdBy,
  });
  return { success: true as const, rubric: mapRubricToResponse(rubric.toObject()) };
}

export async function listRubrics() {
  const rubrics = await RubricTemplateModel.find().select("-__v").lean();
  return rubrics.map(mapRubricToResponse);
}

export async function getRubric(id: string) {
  if (!mongoose.isValidObjectId(id)) return { success: false as const, reason: "not_found" as const };
  const rubric = await RubricTemplateModel.findById(id).select("-__v").lean();
  if (!rubric) return { success: false as const, reason: "not_found" as const };
  return { success: true as const, rubric: mapRubricToResponse(rubric) };
}

export async function updateRubric(id: string, data: RubricUpdateData) {
  if (!mongoose.isValidObjectId(id)) return { success: false as const, reason: "not_found" as const };
  const payload: Record<string, unknown> = {};
  if (data.name !== undefined) payload.name = data.name;
  if (data.sections !== undefined) payload.sections = data.sections;
  const rubric = await RubricTemplateModel.findByIdAndUpdate(id, { $set: payload }, { returnDocument: "after", runValidators: true }).select("-__v").lean();
  if (!rubric) return { success: false as const, reason: "not_found" as const };
  return { success: true as const, rubric: mapRubricToResponse(rubric) };
}

export async function deleteRubric(id: string) {
  if (!mongoose.isValidObjectId(id)) return { success: false as const, reason: "not_found" as const };
  const result = await RubricTemplateModel.deleteOne({ _id: id });
  if (result.deletedCount === 0) return { success: false as const, reason: "not_found" as const };
  return { success: true as const };
}

// ─── Concurso Rubric Attachment ───

export async function attachRubricToConcurso(concursoId: string, rubricTemplateId: string) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "concurso_not_found" as const };
  if (!mongoose.isValidObjectId(rubricTemplateId)) return { success: false as const, reason: "rubric_not_found" as const };

  const rubric = await RubricTemplateModel.findById(rubricTemplateId).lean();
  if (!rubric) return { success: false as const, reason: "rubric_not_found" as const };

  const concurso = await ConcursoModel.findByIdAndUpdate(
    concursoId,
    { $set: { rubricTemplateId: new mongoose.Types.ObjectId(rubricTemplateId) } },
    { returnDocument: "after", runValidators: true }
  );
  if (!concurso) return { success: false as const, reason: "concurso_not_found" as const };

  return { success: true as const, concurso: mapConcursoToResponse(concurso.toObject()) };
}

export async function detachRubricFromConcurso(concursoId: string) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "concurso_not_found" as const };

  const concurso = await ConcursoModel.findByIdAndUpdate(
    concursoId,
    { $unset: { rubricTemplateId: 1 } },
    { returnDocument: "after", runValidators: true }
  );
  if (!concurso) return { success: false as const, reason: "concurso_not_found" as const };

  return { success: true as const, concurso: mapConcursoToResponse(concurso.toObject()) };
}

// ─── Evaluation Service ───

export async function createEvaluation(data: EvaluationCreateData, judgeCodigo: string) {
  if (!mongoose.isValidObjectId(data.concursoId)) return { success: false as const, reason: "concurso_not_found" as const };
  if (!mongoose.isValidObjectId(data.participantId)) return { success: false as const, reason: "participant_not_found" as const };

  const concurso = await ConcursoModel.findById(data.concursoId).lean();
  if (!concurso) return { success: false as const, reason: "concurso_not_found" as const };

  if (!concurso.rubricTemplateId) return { success: false as const, reason: "no_rubric" as const };

  const rubric = await RubricTemplateModel.findById(concurso.rubricTemplateId).lean();
  if (!rubric) return { success: false as const, reason: "rubric_not_found" as const };

  // Build a map of all criteria from the rubric
  const criteriaMap = new Map<string, { minScore: number; maxScore: number }>();
  for (const section of rubric.sections) {
    for (const criterion of section.criteria) {
      criteriaMap.set(criterion.id, { minScore: criterion.minScore, maxScore: criterion.maxScore });
    }
  }

  // Validate no duplicate criterionIds
  const submittedIds = data.scores.map((s) => s.criterionId);
  const uniqueIds = new Set(submittedIds);
  if (uniqueIds.size !== submittedIds.length) {
    return { success: false as const, reason: "invalid_scores" as const };
  }

  // Validate all criteria are scored
  if (uniqueIds.size !== criteriaMap.size) {
    return { success: false as const, reason: "invalid_scores" as const };
  }

  // Validate each score is within bounds
  let totalScore = 0;
  for (const score of data.scores) {
    const criterion = criteriaMap.get(score.criterionId);
    if (!criterion) return { success: false as const, reason: "invalid_scores" as const };
    if (score.value < criterion.minScore || score.value > criterion.maxScore) {
      return { success: false as const, reason: "invalid_scores" as const };
    }
    totalScore += score.value;
  }

  // Validate participant exists in concurso
  const participantExists = concurso.participantes.some(
    (p) => p._id?.toString() === data.participantId
  );
  if (!participantExists) return { success: false as const, reason: "participant_not_found" as const };

  try {
    const evaluation = await EvaluationModel.create({
      concursoId: new mongoose.Types.ObjectId(data.concursoId),
      judgeCodigo,
      participantId: new mongoose.Types.ObjectId(data.participantId),
      scores: data.scores,
      totalScore,
      notes: data.notes,
    });

    // Broadcast realtime update to connected scoreboard listeners
    void broadcastScoreboardUpdate(data.concursoId);

    return { success: true as const, evaluation: mapEvaluationToResponse(evaluation.toObject()) };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false as const, reason: "conflict" as const };
    }
    throw error;
  }
}

interface EvaluationDoc {
  _id: mongoose.Types.ObjectId;
  concursoId: mongoose.Types.ObjectId;
  judgeCodigo: string;
  participantId: mongoose.Types.ObjectId;
  scores: unknown;
  totalScore: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapEvaluationToResponse(evaluation: EvaluationDoc) {
  return {
    _id: String(evaluation._id),
    concursoId: String(evaluation.concursoId),
    judgeCodigo: evaluation.judgeCodigo,
    participantId: String(evaluation.participantId),
    scores: evaluation.scores,
    totalScore: evaluation.totalScore,
    notes: evaluation.notes,
    createdAt: evaluation.createdAt,
    updatedAt: evaluation.updatedAt,
  };
}

export async function listMyEvaluations(judgeCodigo: string, concursoId?: string) {
  const query: Record<string, unknown> = { judgeCodigo };
  if (concursoId) {
    if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "invalid_concurso_id" as const };
    query.concursoId = new mongoose.Types.ObjectId(concursoId);
  }
  const evaluations = await EvaluationModel.find(query).select("-__v").lean();
  return { success: true as const, evaluations: evaluations.map(mapEvaluationToResponse) };
}

export async function listConcursoEvaluations(concursoId: string) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "not_found" as const };
  const evaluations = await EvaluationModel.find({ concursoId: new mongoose.Types.ObjectId(concursoId) }).select("-__v").lean();
  return { success: true as const, evaluations: evaluations.map(mapEvaluationToResponse) };
}

// ─── Results & Scoreboard ───

interface ParticipantResult {
  participantId: string;
  participantNombre: string;
  nivel: string;
  evaluationsCount: number;
  criterionAverages: Array<{ criterionId: string; question: string; average: number }>;
  finalScore: number;
}

export async function getResults(concursoId: string, nivel?: string) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "not_found" as const };

  const concurso = await ConcursoModel.findById(concursoId).lean();
  if (!concurso) return { success: false as const, reason: "not_found" as const };

  const evaluations = await EvaluationModel.find({ concursoId: new mongoose.Types.ObjectId(concursoId) }).lean();

  let participants = concurso.participantes;
  if (nivel) {
    participants = participants.filter((p) => p.nivel === nivel);
  }

  // Get rubric for criterion metadata
  let criteriaQuestions = new Map<string, string>();
  if (concurso.rubricTemplateId) {
    const rubric = await RubricTemplateModel.findById(concurso.rubricTemplateId).lean();
    if (rubric) {
      for (const section of rubric.sections) {
        for (const criterion of section.criteria) {
          criteriaQuestions.set(criterion.id, criterion.question);
        }
      }
    }
  }

  const results: ParticipantResult[] = participants.map((participant) => {
    const participantEvaluations = evaluations.filter(
      (e) => e.participantId.toString() === participant._id?.toString()
    );

    const evaluationsCount = participantEvaluations.length;

    if (evaluationsCount === 0) {
      return {
        participantId: String(participant._id),
        participantNombre: participant.nombre,
        nivel: participant.nivel,
        evaluationsCount: 0,
        criterionAverages: [],
        finalScore: 0,
      };
    }

    // Calculate criterion averages
    const criterionScores = new Map<string, number[]>();
    for (const evaluation of participantEvaluations) {
      for (const score of evaluation.scores) {
        if (!criterionScores.has(score.criterionId)) {
          criterionScores.set(score.criterionId, []);
        }
        criterionScores.get(score.criterionId)!.push(score.value);
      }
    }

    const criterionAverages = Array.from(criterionScores.entries()).map(([criterionId, scores]) => ({
      criterionId,
      question: criteriaQuestions.get(criterionId) || criterionId,
      average: scores.reduce((a, b) => a + b, 0) / scores.length,
    }));

    // Calculate final score (average of total scores)
    const finalScore = participantEvaluations.reduce((sum, e) => sum + e.totalScore, 0) / evaluationsCount;

    return {
      participantId: String(participant._id),
      participantNombre: participant.nombre,
      nivel: participant.nivel,
      evaluationsCount,
      criterionAverages,
      finalScore,
    };
  });

  return { success: true as const, results };
}

export async function getScoreboard(concursoId: string, nivel?: string) {
  const result = await getResults(concursoId, nivel);
  if (!result.success) return result;

  // Sort by finalScore descending
  const sortedResults = [...result.results].sort((a, b) => b.finalScore - a.finalScore);

  return { success: true as const, results: sortedResults };
}
