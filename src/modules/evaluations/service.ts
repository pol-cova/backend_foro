import mongoose from "mongoose";
import { RubricTemplateModel, EvaluationModel } from "./mongoose";
import { ConcursoModel } from "../concursos/mongoose";
import { JudgeModel } from "../judges/mongoose";
import { mapConcursoToResponse } from "../concursos/mappers";
import { broadcastScoreboardUpdate } from "./sse";
import type { RubricTypes, EvaluationTypes } from "./schema";

type RubricCreateData = RubricTypes["createBody"];
type RubricUpdateData = RubricTypes["updateBody"];
type EvaluationCreateData = EvaluationTypes["createBody"];

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

export async function assignRubricsToConcurso(
  concursoId: string,
  rubrics: Array<{ label: string; templateId: string }>
) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "concurso_not_found" as const };

  // Validate all templateIds exist
  for (const rubric of rubrics) {
    if (!mongoose.isValidObjectId(rubric.templateId)) {
      return { success: false as const, reason: "rubric_not_found" as const };
    }
    const exists = await RubricTemplateModel.findById(rubric.templateId).lean();
    if (!exists) return { success: false as const, reason: "rubric_not_found" as const };
  }

  const concurso = await ConcursoModel.findByIdAndUpdate(
    concursoId,
    {
      $set: {
        assignedRubrics: rubrics.map((r) => ({
          label: r.label,
          templateId: new mongoose.Types.ObjectId(r.templateId),
        })),
        rubricTemplateId: null,
      },
    },
    { returnDocument: "after", runValidators: true }
  );
  if (!concurso) return { success: false as const, reason: "concurso_not_found" as const };

  return { success: true as const, concurso: mapConcursoToResponse(concurso.toObject()) };
}

export async function getConcursoRubrics(concursoId: string) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "concurso_not_found" as const };

  const concurso = await ConcursoModel.findById(concursoId).lean();
  if (!concurso) return { success: false as const, reason: "concurso_not_found" as const };

  // Multi-rubric mode
  if (concurso.assignedRubrics && concurso.assignedRubrics.length > 0) {
    const templateIds = concurso.assignedRubrics.map((r) => r.templateId);
    const rubrics = await RubricTemplateModel.find({ _id: { $in: templateIds } }).select("-__v").lean();

    const rubricMap = new Map(rubrics.map((r) => [String(r._id), r]));

    const assigned = concurso.assignedRubrics.map((ar) => {
      const rubric = rubricMap.get(String(ar.templateId));
      return {
        label: ar.label,
        templateId: String(ar.templateId),
        name: rubric?.name || "Unknown",
        sections: rubric?.sections || [],
      };
    });

    return { success: true as const, rubrics: assigned, mode: "multi" as const };
  }

  // Legacy single-rubric mode
  if (concurso.rubricTemplateId) {
    const rubric = await RubricTemplateModel.findById(concurso.rubricTemplateId).select("-__v").lean();
    if (!rubric) return { success: true as const, rubrics: [], mode: "legacy" as const };
    return {
      success: true as const,
      rubrics: [
        {
          label: "Default",
          templateId: String(rubric._id),
          name: rubric.name,
          sections: rubric.sections,
        },
      ],
      mode: "legacy" as const,
    };
  }

  return { success: true as const, rubrics: [], mode: "none" as const };
}

export async function clearAssignedRubrics(concursoId: string) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "concurso_not_found" as const };

  const concurso = await ConcursoModel.findByIdAndUpdate(
    concursoId,
    { $set: { assignedRubrics: [] } },
    { returnDocument: "after", runValidators: true }
  );
  if (!concurso) return { success: false as const, reason: "concurso_not_found" as const };

  return { success: true as const, concurso: mapConcursoToResponse(concurso.toObject()) };
}

export async function createEvaluation(data: EvaluationCreateData, judgeCodigo: string) {
  if (!mongoose.isValidObjectId(data.concursoId)) return { success: false as const, reason: "concurso_not_found" as const };
  if (!mongoose.isValidObjectId(data.participantId)) return { success: false as const, reason: "participant_not_found" as const };

  const concurso = await ConcursoModel.findById(data.concursoId).lean();
  if (!concurso) return { success: false as const, reason: "concurso_not_found" as const };

  // Determine which rubric to use
  let selectedRubricTemplateId: mongoose.Types.ObjectId;
  const hasMultiRubrics = concurso.assignedRubrics && concurso.assignedRubrics.length > 0;

  if (hasMultiRubrics) {
    // Multi-rubric mode: rubricTemplateId is required
    if (!data.rubricTemplateId || !mongoose.isValidObjectId(data.rubricTemplateId)) {
      return { success: false as const, reason: "no_rubric" as const };
    }
    // Validate the rubric is assigned to this concurso
    const isAssigned = concurso.assignedRubrics!.some(
      (ar) => ar.templateId.toString() === data.rubricTemplateId
    );
    if (!isAssigned) {
      return { success: false as const, reason: "rubric_not_allowed" as const };
    }
    selectedRubricTemplateId = new mongoose.Types.ObjectId(data.rubricTemplateId);
  } else if (concurso.rubricTemplateId) {
    // Legacy single-rubric mode
    selectedRubricTemplateId = concurso.rubricTemplateId;
  } else {
    return { success: false as const, reason: "no_rubric" as const };
  }

  const rubric = await RubricTemplateModel.findById(selectedRubricTemplateId).lean();
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
  const participant = concurso.participantes.find(
    (p) => p._id?.toString() === data.participantId
  );
  if (!participant) return { success: false as const, reason: "participant_not_found" as const };

  // Validate judge level assignment
  const judge = await JudgeModel.findOne({ codigo: judgeCodigo }).lean();
  if (judge?.nivel && judge.nivel !== participant.nivel) {
    return { success: false as const, reason: "level_mismatch" as const };
  }

  try {
    const evaluation = await EvaluationModel.create({
      concursoId: new mongoose.Types.ObjectId(data.concursoId),
      judgeCodigo,
      participantId: new mongoose.Types.ObjectId(data.participantId),
      rubricTemplateId: selectedRubricTemplateId,
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
  rubricTemplateId: mongoose.Types.ObjectId;
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
    rubricTemplateId: String(evaluation.rubricTemplateId),
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

interface ParticipantResult {
  participantId: string;
  participantNombre: string;
  nivel: string;
  evaluationsCount: number;
  totalJudgesForLevel: number;
  isComplete: boolean;
  criterionAverages: Array<{ criterionId: string; question: string; average: number }>;
  finalScore: number | null;
  rubricTemplateId?: string;
}

export async function getResults(concursoId: string, nivel?: string) {
  if (!mongoose.isValidObjectId(concursoId)) return { success: false as const, reason: "not_found" as const };

  const concurso = await ConcursoModel.findById(concursoId).lean();
  if (!concurso) return { success: false as const, reason: "not_found" as const };

  const evaluations = await EvaluationModel.find({ concursoId: new mongoose.Types.ObjectId(concursoId) }).lean();

  // Count total judges per level for this concurso
  const judgesForConcurso = await JudgeModel.find({ eventoId: concursoId }).lean();
  const judgesPerLevel = new Map<string, number>();
  for (const judge of judgesForConcurso) {
    // Judges without a nivel are grouped under "__any__" so they don't
    // count toward any specific level's total (legacy backward-compat)
    const level = judge.nivel || "__any__";
    judgesPerLevel.set(level, (judgesPerLevel.get(level) || 0) + 1);
  }

  let participants = concurso.participantes;
  if (nivel) {
    participants = participants.filter((p) => p.nivel === nivel);
  }

  // Load all rubrics that were used in evaluations for criterion metadata and max scores
  const usedRubricIds = [...new Set(evaluations.map((e) => e.rubricTemplateId?.toString()).filter(Boolean))];
  const rubrics = usedRubricIds.length > 0
    ? await RubricTemplateModel.find({ _id: { $in: usedRubricIds.map((id) => new mongoose.Types.ObjectId(id)) } }).lean()
    : [];

  const rubricMap = new Map<string, { sections: any[]; maxPossible: number }>();
  const criteriaQuestions = new Map<string, string>();

  for (const rubric of rubrics) {
    const rubricId = String(rubric._id);
    let maxPossible = 0;
    for (const section of rubric.sections) {
      for (const criterion of section.criteria) {
        maxPossible += criterion.maxScore;
        criteriaQuestions.set(criterion.id, criterion.question);
      }
    }
    rubricMap.set(rubricId, { sections: rubric.sections, maxPossible });
  }

  const results: ParticipantResult[] = participants.map((participant) => {
    const participantEvaluations = evaluations.filter(
      (e) => e.participantId.toString() === participant._id?.toString()
    );

    const evaluationsCount = participantEvaluations.length;

    // Total judges for this participant's level
    const totalJudgesForLevel = judgesPerLevel.get(participant.nivel) || 0;
    const hasLevelSpecificJudges = totalJudgesForLevel > 0;
    const isComplete = hasLevelSpecificJudges ? evaluationsCount === totalJudgesForLevel : true;

    if (!isComplete) {
      return {
        participantId: String(participant._id),
        participantNombre: participant.nombre,
        nivel: participant.nivel,
        evaluationsCount,
        totalJudgesForLevel,
        isComplete: false,
        criterionAverages: [],
        finalScore: null,
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

    // Calculate final score as normalized percentage
    // Each evaluation's totalScore is converted to a percentage of its rubric's max possible
    // Then we average those percentages
    let totalPercentage = 0;
    let validEvaluations = 0;
    let primaryRubricTemplateId: string | undefined;

    for (const evaluation of participantEvaluations) {
      const rubricId = evaluation.rubricTemplateId?.toString();
      if (!rubricId) continue;
      if (!primaryRubricTemplateId) primaryRubricTemplateId = rubricId;

      const rubricInfo = rubricMap.get(rubricId);
      if (rubricInfo && rubricInfo.maxPossible > 0) {
        const percentage = (evaluation.totalScore / rubricInfo.maxPossible) * 100;
        totalPercentage += percentage;
        validEvaluations++;
      }
    }

    const finalScore = validEvaluations > 0 ? totalPercentage / validEvaluations : 0;

    return {
      participantId: String(participant._id),
      participantNombre: participant.nombre,
      nivel: participant.nivel,
      evaluationsCount,
      totalJudgesForLevel,
      isComplete: true,
      criterionAverages,
      finalScore,
      rubricTemplateId: primaryRubricTemplateId,
    };
  });

  return { success: true as const, results };
}

export async function getScoreboard(concursoId: string, nivel?: string) {
  const result = await getResults(concursoId, nivel);
  if (!result.success) return result;

  // Sort: completed entries first (by finalScore desc), then incomplete entries
  const sortedResults = [...result.results].sort((a, b) => {
    if (a.isComplete && !b.isComplete) return -1;
    if (!a.isComplete && b.isComplete) return 1;
    if (!a.isComplete && !b.isComplete) return 0;
    return (b.finalScore || 0) - (a.finalScore || 0);
  });

  return { success: true as const, results: sortedResults };
}
