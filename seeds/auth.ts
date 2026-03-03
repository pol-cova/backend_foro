import "dotenv/config";
import mongoose from "mongoose";
import { UserModel } from "../src/modules/auth/schema";

const users = [
  { codigo: "219640329", nombre: "Paul Contreras", isAdmin: true },
  { codigo: "2952399", nombre: "Erick Guerrero", isAdmin: true },
  { codigo: "123456789", nombre: "Admin User", isAdmin: false },
];

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

async function seed() {
  await mongoose.connect(DATABASE_URL);

  await Promise.all(
    users.map(async (user) => {
      await UserModel.updateOne({ codigo: user.codigo }, { $set: user }, { upsert: true });
      console.log(`Seeded: ${user.nombre}`);
    })
  );

  await mongoose.disconnect();
}

seed();
