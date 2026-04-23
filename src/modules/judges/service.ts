import { randomBytes } from "crypto";
import { hash } from "bcryptjs";
import { JudgeModel as JudgeMongooseModel } from "./mongoose";
import { JudgeModel as JudgeModelType } from "./schema";

export function generatePin(length = 5): string {
  return randomBytes(4)
    .toString("base64url")
    .slice(0, length)
    .toUpperCase();
}

export async function createJudge(data: JudgeModelType["createBody"]) {
  const exists = await JudgeMongooseModel.findOne({ codigo: data.codigo });
  if (exists) return { success: false as const, reason: "conflict" as const };

  const plainPin = generatePin();
  const pinHash = await hash(plainPin, 10);

  try {
    const judge = await JudgeMongooseModel.create({
      codigo: data.codigo,
      nombre: data.nombre,
      eventoId: data.eventoId,
      nivel: data.nivel,
      pinHash,
    });

    return {
      success: true as const,
      judge: { codigo: judge.codigo, nombre: judge.nombre, eventoId: judge.eventoId, nivel: judge.nivel, pin: plainPin },
    };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false as const, reason: "conflict" as const };
    }
    throw error;
  }
}

export async function listJudges() {
  const judges = await JudgeMongooseModel.find().select("codigo nombre eventoId nivel").lean();
  return judges;
}

export async function getJudge(codigo: string) {
  const judge = await JudgeMongooseModel.findOne({ codigo }).select("codigo nombre eventoId nivel").lean();
  if (!judge) return { success: false as const, reason: "not_found" as const };
  return { success: true as const, judge };
}

export async function updateJudge(codigo: string, data: JudgeModelType["updateBody"]) {
  const judge = await JudgeMongooseModel.findOneAndUpdate(
    { codigo },
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );
  if (!judge) return { success: false as const, reason: "not_found" as const };
  return { success: true as const, judge: { codigo: judge.codigo, nombre: judge.nombre, eventoId: judge.eventoId, nivel: judge.nivel } };
}

export async function resetJudgePin(codigo: string) {
  const judge = await JudgeMongooseModel.findOne({ codigo });
  if (!judge) return { success: false as const, reason: "not_found" as const };

  const plainPin = generatePin();
  judge.pinHash = await hash(plainPin, 10);
  await judge.save();

  return { success: true as const, codigo: judge.codigo, pin: plainPin };
}

export async function deleteJudge(codigo: string) {
  const result = await JudgeMongooseModel.deleteOne({ codigo });
  if (result.deletedCount === 0) return { success: false as const, reason: "not_found" as const };
  return { success: true as const };
}
