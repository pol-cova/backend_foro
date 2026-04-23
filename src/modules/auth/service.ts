import { compare } from "bcryptjs";
import { config } from "../../config";
import { AuthModel, LoginResult } from "./schema";
import { UserModel } from "./mongoose";
import { JudgeModel } from "../judges/mongoose";
import { EventManagerAssignmentModel } from "../eventManagers/mongoose";

interface ExternalResponse {
  respuesta?: boolean;
}

async function getManagedEventoIds(codigo: string, role: string) {
  if (role !== "eventManager") return undefined;
  const assignments = await EventManagerAssignmentModel.find({ managerCodigo: codigo }).select("eventoId").lean();
  return assignments.map((a) => a.eventoId);
}

export async function login({ codigo, password }: AuthModel["loginBody"]): Promise<LoginResult> {
  const user = await UserModel.findOne({ codigo });
  if (!user) return { success: false, reason: "forbidden" };

  if (config.testing) {
    const managedEventoIds = await getManagedEventoIds(codigo, user.role);
    return { success: true, codigo, nombre: user.nombre, role: user.role, managedEventoIds };
  }

  const response = await fetch(config.siiau.url, {
    method: "POST",
    body: JSON.stringify({ codigo, pass: password }),
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) return { success: false, reason: "invalid" };

  const data: ExternalResponse = await response.json();
  if (data.respuesta === false) return { success: false, reason: "invalid" };

  const managedEventoIds = await getManagedEventoIds(codigo, user.role);
  return { success: true, codigo, nombre: user.nombre, role: user.role, managedEventoIds };
}

export async function loginJudge({ codigo, pin }: { codigo: string; pin: string }) {
  const judge = await JudgeModel.findOne({ codigo });
  if (!judge) return { success: false as const, reason: "invalid" as const };

  try {
    const valid = await compare(pin, judge.pinHash);
    if (!valid) return { success: false as const, reason: "invalid" as const };
  } catch {
    return { success: false as const, reason: "invalid" as const };
  }

  return {
    success: true as const,
    codigo: judge.codigo,
    nombre: judge.nombre,
    role: "judge" as const,
    eventoId: judge.eventoId,
  };
}

export async function register(data: AuthModel["registerBody"]) {
  const exists = await UserModel.findOne({ codigo: data.codigo });
  if (exists) return { success: false as const, reason: "conflict" as const };

  try {
    const user = await UserModel.create({
      codigo: data.codigo,
      nombre: data.nombre,
      role: data.role ?? "eventManager",
    });
    return { success: true as const, user: { codigo: user.codigo, nombre: user.nombre, role: user.role } };
  } catch (error: any) {
    if (error.code === 11000) {
      return { success: false as const, reason: "conflict" as const };
    }
    throw error;
  }
}

export async function updateUser(codigo: string, data: AuthModel["updateBody"]) {
  const user = await UserModel.findOneAndUpdate(
    { codigo },
    { $set: data },
    { returnDocument: "after", runValidators: true }
  );
  if (!user) return { success: false as const, reason: "not_found" as const };
  return { success: true as const, user: { codigo: user.codigo, nombre: user.nombre, role: user.role } };
}

export async function listUsers() {
  const users = await UserModel.find().select("codigo nombre role").lean();
  return users;
}

export async function deleteUser(codigo: string) {
  const result = await UserModel.deleteOne({ codigo });
  if (result.deletedCount === 0) return { success: false as const, reason: "not_found" as const };
  return { success: true as const };
}
