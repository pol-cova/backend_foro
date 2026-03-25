import "dotenv/config";
import mongoose from "mongoose";
import { config } from "../src/config";
import { logger } from "../src/lib/logger";
import { ConcursoModel } from "../src/modules/concursos/mongoose";

async function clearParticipantes() {
  await mongoose.connect(config.database.url);

  const result = await ConcursoModel.updateMany({}, { $set: { participantes: [] } });

  logger.info(`Cleared participantes from ${result.modifiedCount} concursos`);
  await mongoose.disconnect();
}

clearParticipantes();
