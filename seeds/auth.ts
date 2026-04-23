import "dotenv/config";
import mongoose from "mongoose";
import { config } from "../src/config";
import { logger } from "../src/lib/logger";
import { UserModel } from "../src/modules/auth/mongoose";

const users = [
  { codigo: "219640329", nombre: "Paul Contreras", role: "admin" },
  { codigo: "2952399", nombre: "Erick Guerrero", role: "admin" },
  { codigo: "123456789", nombre: "Non Admin User", role: "eventManager" },
];

async function seed() {
  await mongoose.connect(config.database.url);

  await Promise.all(
    users.map(async (user) => {
      await UserModel.updateOne({ codigo: user.codigo }, { $set: user }, { upsert: true });
      logger.info("Seeded", { nombre: user.nombre });
    })
  );

  await mongoose.disconnect();
}

seed();
