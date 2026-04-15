import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replSet: MongoMemoryReplSet | undefined;

export async function connectMongoMemoryReplSet(): Promise<void> {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });
  await mongoose.connect(replSet.getUri());
}

export async function stopMongoMemoryReplSet(): Promise<void> {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
    replSet = undefined;
  }
}
