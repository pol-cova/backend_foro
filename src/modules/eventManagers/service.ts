import { EventManagerAssignmentModel } from "./mongoose";
import { EventManagerModel as EventManagerModelType } from "./schema";

export async function createAssignment(data: EventManagerModelType["createAssignmentBody"]) {
  const exists = await EventManagerAssignmentModel.findOne({
    managerCodigo: data.managerCodigo,
    eventoId: data.eventoId,
  });
  if (exists) return { success: false as const, reason: "conflict" as const };

  const assignment = await EventManagerAssignmentModel.create({
    managerCodigo: data.managerCodigo,
    eventoId: data.eventoId,
  });

  return {
    success: true as const,
    assignment: { managerCodigo: assignment.managerCodigo, eventoId: assignment.eventoId },
  };
}

export async function listAssignments() {
  const assignments = await EventManagerAssignmentModel.find()
    .select("managerCodigo eventoId")
    .lean();
  return assignments;
}

export async function deleteAssignment(managerCodigo: string, eventoId: string) {
  const result = await EventManagerAssignmentModel.deleteOne({ managerCodigo, eventoId });
  if (result.deletedCount === 0) return { success: false as const, reason: "not_found" as const };
  return { success: true as const };
}
