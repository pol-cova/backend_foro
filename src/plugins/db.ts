import { Elysia } from "elysia";
import mongoose from "mongoose";
import { config } from "../config";
import { logger } from "../lib/logger";

export const database = new Elysia({ name: "database" })
  .onStart(async () => {
    try {
      await mongoose.connect(config.database.url);
      logger.info("Connected to MongoDB");
    } catch (error) {
      logger.error("Failed to connect to MongoDB", { error });
      process.exit(1);
    }
  })
  .onStop(async () => {
    await mongoose.disconnect();
  });
