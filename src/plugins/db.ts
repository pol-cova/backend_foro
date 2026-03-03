import { Elysia } from "elysia";
import mongoose from "mongoose";

export const database = new Elysia({ name: "database" })
  .onStart(async () => {
    try {
      await mongoose.connect(process.env.DATABASE_URL as string);
      console.log("Connected to MongoDB");
    } catch (error) {
      console.error("Failed to connect to MongoDB:", error);
      process.exit(1);
    }
  })
  .onStop(async () => {
    await mongoose.disconnect();
  });
