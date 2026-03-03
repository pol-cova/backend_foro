import { AuthModel, SignInResult } from "./model";
import { UserModel } from "./schema";

const url = process.env.EXTERNAL_API_URL;
if (!url) {
  throw new Error("EXTERNAL_API_URL environment variable is required");
}
const EXTERNAL_API_URL: string = url;

interface ExternalAuthResponse {
  respuesta?: boolean;
}

export async function signIn({ codigo, password }: AuthModel["signInBody"]): Promise<SignInResult> {
  const user = await UserModel.findOne({ codigo });

  if (!user) {
    return { success: false, reason: "forbidden" };
  }

  const response = await fetch(EXTERNAL_API_URL, {
    method: "POST",
    body: JSON.stringify({ codigo, pass: password }),
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    return { success: false, reason: "invalid" };
  }

  const data: ExternalAuthResponse = await response.json();
  if (data.respuesta === false) {
    return { success: false, reason: "invalid" };
  }

  return {
    success: true,
    codigo,
    nombre: user.nombre,
    isAdmin: user.isAdmin,
  };
}
