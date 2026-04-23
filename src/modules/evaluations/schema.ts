import { t, type UnwrapSchema } from "elysia";

const criterionSchema = t.Object({
  id: t.String(),
  question: t.String(),
  description: t.Optional(t.String()),
  minScore: t.Number(),
  maxScore: t.Number(),
});

const rubricSectionSchema = t.Object({
  title: t.Optional(t.String()),
  criteria: t.Array(criterionSchema),
});

const rubricTemplateResponse = t.Object({
  _id: t.String(),
  name: t.String(),
  sections: t.Array(rubricSectionSchema),
  createdBy: t.String(),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const RubricSchema = {
  createBody: t.Object({
    name: t.String(),
    sections: t.Array(rubricSectionSchema),
  }),
  updateBody: t.Object({
    name: t.Optional(t.String()),
    sections: t.Optional(t.Array(rubricSectionSchema)),
  }),
  rubricResponse: rubricTemplateResponse,
  rubricsListResponse: t.Array(rubricTemplateResponse),
  notFound: t.Literal("Rubric template not found"),
} as const;

export type RubricTypes = {
  [k in keyof typeof RubricSchema]: UnwrapSchema<(typeof RubricSchema)[k]>;
};

const scoreEntrySchema = t.Object({
  criterionId: t.String(),
  value: t.Number(),
});

const evaluationResponse = t.Object({
  _id: t.String(),
  concursoId: t.String(),
  judgeCodigo: t.String(),
  participantId: t.String(),
  scores: t.Array(scoreEntrySchema),
  totalScore: t.Number(),
  notes: t.Optional(t.String()),
  createdAt: t.Date(),
  updatedAt: t.Date(),
});

export const EvaluationSchema = {
  createBody: t.Object({
    concursoId: t.String(),
    participantId: t.String(),
    scores: t.Array(scoreEntrySchema),
    notes: t.Optional(t.String()),
  }),
  evaluationResponse,
  evaluationsListResponse: t.Array(evaluationResponse),
  notFound: t.Literal("Evaluation not found"),
  conflict: t.Literal("Evaluation already exists for this judge and participant"),
  noRubric: t.Literal("Concurso does not have a rubric"),
  invalidScores: t.Literal("Invalid scores provided"),
} as const;

export type EvaluationTypes = {
  [k in keyof typeof EvaluationSchema]: UnwrapSchema<(typeof EvaluationSchema)[k]>;
};

const criterionAverageSchema = t.Object({
  criterionId: t.String(),
  question: t.String(),
  average: t.Number(),
});

const participantResultSchema = t.Object({
  participantId: t.String(),
  participantNombre: t.String(),
  nivel: t.String(),
  evaluationsCount: t.Number(),
  totalJudgesForLevel: t.Number(),
  isComplete: t.Boolean(),
  criterionAverages: t.Array(criterionAverageSchema),
  finalScore: t.Union([t.Number(), t.Null()]),
});

export const ResultsSchema = {
  resultsResponse: t.Array(participantResultSchema),
  scoreboardResponse: t.Array(participantResultSchema),
} as const;

export type ResultsTypes = {
  [k in keyof typeof ResultsSchema]: UnwrapSchema<(typeof ResultsSchema)[k]>;
};
