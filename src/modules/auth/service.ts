import { config } from "../../config";
import { AuthModel, LoginResult } from "./schema";
import { UserModel } from "./mongoose";

interface ExternalResponse {
  respuesta?: boolean;
}

export async function login({ codigo, password }: AuthModel["loginBody"]): Promise<LoginResult> {
  const user = await UserModel.findOne({ codigo });
  if (!user) return { success: false, reason: "forbidden" };

  const response = await fetch(config.siiau.url, {
    method: "POST",
    body: JSON.stringify({ codigo, pass: password }),
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) return { success: false, reason: "invalid" };

  const data: ExternalResponse = await response.json();
  if (data.respuesta === false) return { success: false, reason: "invalid" };

  return { success: true, codigo, nombre: user.nombre, isAdmin: user.isAdmin };
}

export async function register(data: AuthModel["registerBody"]) {
  const exists = await UserModel.findOne({ codigo: data.codigo });
  if (exists) return { success: false as const, reason: "conflict" as const };

  const user = await UserModel.create({
    codigo: data.codigo,
    nombre: data.nombre,
    isAdmin: data.isAdmin ?? false,
  });
  return { success: true as const, user: { codigo: user.codigo, nombre: user.nombre, isAdmin: user.isAdmin } };
}

export async function updateUser(codigo: string, data: AuthModel["updateBody"]) {
  const user = await UserModel.findOneAndUpdate(
    { codigo },
    { $set: data },
    { new: true, runValidators: true }
  );
  if (!user) return { success: false as const, reason: "not_found" as const };
  return { success: true as const, user: { codigo: user.codigo, nombre: user.nombre, isAdmin: user.isAdmin } };
}

export async function listUsers() {
  const users = await UserModel.find().select("codigo nombre isAdmin").lean();
  return users;
}

export async function deleteUser(codigo: string) {
  const result = await UserModel.deleteOne({ codigo });
  if (result.deletedCount === 0) return { success: false as const, reason: "not_found" as const };
  return { success: true as const };
}
