import mongoose from "mongoose";

export interface EventManagerAssignment {
  managerCodigo: string;
  eventoId: string;
  createdAt: Date;
  updatedAt: Date;
}

const assignmentSchema = new mongoose.Schema<EventManagerAssignment>(
  {
    managerCodigo: { type: String, required: true },
    eventoId: { type: String, required: true },
  },
  { timestamps: true }
);

assignmentSchema.index({ managerCodigo: 1, eventoId: 1 }, { unique: true });

export const EventManagerAssignmentModel = mongoose.model<EventManagerAssignment>(
  "EventManagerAssignment",
  assignmentSchema
);
