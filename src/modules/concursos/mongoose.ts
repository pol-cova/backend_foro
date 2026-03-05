import mongoose from "mongoose";

export interface ConstraintConfig {
  id: string;
  field?: string;
}

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
}

export interface Concurso {
  _id?: mongoose.Types.ObjectId;
  nombre: string;
  cupo: number;
  constraints: ConstraintConfig[];
  niveles: string[];
  participantes: Participante[];
  createdAt?: Date;
  updatedAt?: Date;
}

const constraintSchema = new mongoose.Schema<ConstraintConfig>(
  { id: { type: String, required: true }, field: String },
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
  },
  { _id: true }
);

const concursoSchema = new mongoose.Schema<Concurso>(
  {
    nombre: { type: String, required: true },
    cupo: { type: Number, required: true },
    constraints: { type: [constraintSchema], required: true },
    niveles: { type: [String], required: true },
    participantes: { type: [participanteSchema], default: [] },
  },
  { timestamps: true }
);

export const ConcursoModel = mongoose.model<Concurso>("Concurso", concursoSchema);
