import mongoose from "mongoose";

export interface Judge {
  codigo: string;
  nombre: string;
  eventoId: string;
  pinHash: string;
  createdAt: Date;
  updatedAt: Date;
}

const judgeSchema = new mongoose.Schema<Judge>(
  {
    codigo: { type: String, required: true, unique: true },
    nombre: { type: String, required: true },
    eventoId: { type: String, required: true },
    pinHash: { type: String, required: true },
  },
  { timestamps: true }
);

export const JudgeModel = mongoose.model<Judge>("Judge", judgeSchema);
