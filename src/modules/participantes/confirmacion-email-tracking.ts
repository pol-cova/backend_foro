import mongoose from "mongoose";
import { ConcursoModel } from "../concursos/mongoose";

const MAX_ERROR_LEN = 500;

function truncateError(message: string): string {
  const s = message.trim();
  return s.length <= MAX_ERROR_LEN ? s : `${s.slice(0, MAX_ERROR_LEN)}…`;
}

export async function applyConfirmacionEmailResult(
  concursoId: string,
  participacionId: string,
  result: { kind: "sent" } | { kind: "skipped" } | { kind: "failed"; error: string }
): Promise<void> {
  if (!mongoose.isValidObjectId(concursoId) || !mongoose.isValidObjectId(participacionId)) return;

  const pid = new mongoose.Types.ObjectId(participacionId);

  if (result.kind === "sent") {
    await ConcursoModel.updateOne(
      { _id: concursoId, "participantes._id": pid },
      {
        $set: {
          "participantes.$[p].confirmacionEmailEstado": "sent",
          "participantes.$[p].confirmacionEmailEnviadoEn": new Date(),
        },
        $unset: { "participantes.$[p].confirmacionEmailUltimoError": "" },
      },
      { arrayFilters: [{ "p._id": pid }] }
    );
    return;
  }

  if (result.kind === "skipped") {
    await ConcursoModel.updateOne(
      { _id: concursoId, "participantes._id": pid },
      {
        $set: { "participantes.$[p].confirmacionEmailEstado": "skipped" },
        $unset: {
          "participantes.$[p].confirmacionEmailEnviadoEn": "",
          "participantes.$[p].confirmacionEmailUltimoError": "",
        },
      },
      { arrayFilters: [{ "p._id": pid }] }
    );
    return;
  }

  await ConcursoModel.updateOne(
    { _id: concursoId, "participantes._id": pid },
    {
      $set: {
        "participantes.$[p].confirmacionEmailEstado": "failed",
        "participantes.$[p].confirmacionEmailUltimoError": truncateError(result.error),
      },
    },
    { arrayFilters: [{ "p._id": pid }] }
  );
}
