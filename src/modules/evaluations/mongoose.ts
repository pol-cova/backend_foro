import mongoose from "mongoose";

export interface Criterion {
  id: string;
  question: string;
  description?: string;
  minScore: number;
  maxScore: number;
}

export interface RubricSection {
  title?: string;
  criteria: Criterion[];
}

export interface RubricTemplate {
  _id?: mongoose.Types.ObjectId;
  name: string;
  sections: RubricSection[];
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const criterionSchema = new mongoose.Schema<Criterion>(
  {
    id: { type: String, required: true },
    question: { type: String, required: true },
    description: { type: String },
    minScore: { type: Number, required: true },
    maxScore: { type: Number, required: true },
  },
  { _id: false }
);

const rubricSectionSchema = new mongoose.Schema<RubricSection>(
  {
    title: { type: String },
    criteria: { type: [criterionSchema], required: true },
  },
  { _id: false }
);

const rubricTemplateSchema = new mongoose.Schema<RubricTemplate>(
  {
    name: { type: String, required: true },
    sections: { type: [rubricSectionSchema], required: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export const RubricTemplateModel = mongoose.model<RubricTemplate>("RubricTemplate", rubricTemplateSchema);

export interface ScoreEntry {
  criterionId: string;
  value: number;
}

export interface Evaluation {
  _id?: mongoose.Types.ObjectId;
  concursoId: mongoose.Types.ObjectId;
  judgeCodigo: string;
  participantId: mongoose.Types.ObjectId;
  rubricTemplateId: mongoose.Types.ObjectId;
  scores: ScoreEntry[];
  totalScore: number;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const scoreEntrySchema = new mongoose.Schema<ScoreEntry>(
  {
    criterionId: { type: String, required: true },
    value: { type: Number, required: true },
  },
  { _id: false }
);

const evaluationSchema = new mongoose.Schema<Evaluation>(
  {
    concursoId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Concurso" },
    judgeCodigo: { type: String, required: true },
    participantId: { type: mongoose.Schema.Types.ObjectId, required: true },
    rubricTemplateId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "RubricTemplate" },
    scores: { type: [scoreEntrySchema], required: true },
    totalScore: { type: Number, required: true },
    notes: { type: String },
  },
  { timestamps: true }
);

evaluationSchema.index({ concursoId: 1, judgeCodigo: 1, participantId: 1 }, { unique: true });
evaluationSchema.index({ concursoId: 1 });

export const EvaluationModel = mongoose.model<Evaluation>("Evaluation", evaluationSchema);
