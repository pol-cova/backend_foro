import mongoose from "mongoose";

export interface ConstraintConfig {
  id: string;
  field?: string;
  fields?: string[];
}

export type ConfirmacionEmailEstado = "unknown" | "skipped" | "sent" | "failed";

export interface Participante {
  _id?: mongoose.Types.ObjectId;
  tipo: string;
  codigo: string;
  nombre: string;
  carrera: string;
  semestre: number;
  correo: string;
  escuela: string;
  nivel: string;
  campos: Record<string, string>;
  confirmacionEmailEstado?: ConfirmacionEmailEstado;
  confirmacionEmailEnviadoEn?: Date;
  confirmacionEmailUltimoError?: string;
}

export interface Concurso {
  _id?: mongoose.Types.ObjectId;
  nombre: string;
  cupo: number;
  sharedFields?: string[];
  constraints: ConstraintConfig[];
  niveles: string[];
  participantes: Participante[];
  allowMultiple?: boolean;
  rubricTemplateId?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

const constraintSchema = new mongoose.Schema<ConstraintConfig>(
  {
    id: { type: String, required: true },
    field: String,
    fields: [String],
  },
  { _id: false }
);

const participanteSchema = new mongoose.Schema<Participante>(
  {
    tipo: { type: String, required: true },
    codigo: { type: String, required: true },
    nombre: { type: String, required: true },
    carrera: { type: String, required: true },
    semestre: { type: Number, required: true },
    correo: { type: String, required: true },
    escuela: { type: String, required: true },
    nivel: { type: String, required: true },
    campos: { type: mongoose.Schema.Types.Mixed, default: {} },
    confirmacionEmailEstado: {
      type: String,
      enum: ["unknown", "skipped", "sent", "failed"],
    },
    confirmacionEmailEnviadoEn: { type: Date },
    confirmacionEmailUltimoError: { type: String },
  },
  { _id: true }
);

const concursoSchema = new mongoose.Schema<Concurso>(
  {
    nombre: { type: String, required: true },
    cupo: { type: Number, required: true },
    sharedFields: { type: [String], default: [] },
    constraints: { type: [constraintSchema], required: true },
    niveles: { type: [String], required: true },
    participantes: { type: [participanteSchema], default: [] },
    allowMultiple: { type: Boolean, default: false },
    rubricTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: "RubricTemplate" },
  },
  { timestamps: true }
);

export const ConcursoModel = mongoose.model<Concurso>("Concurso", concursoSchema);
