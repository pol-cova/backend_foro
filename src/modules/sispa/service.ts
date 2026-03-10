import { config } from "../../config";

const ESCUELA = "Centro Universitario de los Valles";

let accessToken: string | null = null;
let tokenExpiry = 0;

interface LoginResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface PerfilResponse {
  alumno?: {
    codigo: string;
    nombre: string;
    apellido_p: string;
    apellido_m: string;
    email: string;
    semestre: number;
    carrera: string;
  };
  error?: string;
}

async function ensureToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry - 60_000) return accessToken;
  const refreshed = await refreshToken();
  if (refreshed) return accessToken!;
  await login();
  return accessToken!;
}

async function login(): Promise<void> {
  const res = await fetch(`${config.sispa.url}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo: config.sispa.codigo, password: config.sispa.password }),
  });
  const data: LoginResponse = await res.json();
  if (data.error || !data.access_token) throw new Error("SISPA auth failed");
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
}

async function refreshToken(): Promise<boolean> {
  if (!accessToken) return false;
  const res = await fetch(`${config.sispa.url}/api/auth/refresh`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data: LoginResponse = await res.json();
  if (!data.access_token) return false;
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
  return true;
}

export type EstudiantePrefill = {
  codigo: string;
  nombre: string;
  carrera: string;
  semestre: number;
  correo: string;
  escuela: string;
};

export async function getEstudianteByCodigo(
  codigoEst: string,
  retried = false
): Promise<{ success: true; estudiante: EstudiantePrefill } | { success: false; reason: "not_found" | "api_error" }> {
  const token = await ensureToken();
  const res = await fetch(`${config.sispa.url}/api/perfil`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ codigo: codigoEst }),
  });

  if (res.status === 401 && !retried) {
    accessToken = null;
    const refreshed = await refreshToken();
    if (!refreshed) await login();
    return getEstudianteByCodigo(codigoEst, true);
  }

  if (res.status === 404) return { success: false, reason: "not_found" };
  if (!res.ok) return { success: false, reason: "api_error" };

  const data: PerfilResponse = await res.json();
  if (data.error || !data.alumno) return { success: false, reason: "not_found" };

  const a = data.alumno;
  const nombre = [a.nombre, a.apellido_p, a.apellido_m].filter(Boolean).join(" ");
  const semestre = typeof a.semestre === "number" ? a.semestre : Number(a.semestre) || 0;
  const estudiante = {
    codigo: a.codigo,
    nombre: nombre || a.codigo,
    carrera: a.carrera,
    semestre,
    correo: a.email,
    escuela: ESCUELA,
  };
  return { success: true, estudiante };
}
