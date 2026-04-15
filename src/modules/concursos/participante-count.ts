import type { Participante } from "./mongoose";

const CODIGO_SLOT = /^codigo_\d+$/i;

function ensureRecord(campos: Record<string, string> | Map<string, string> | undefined): Record<string, string> {
  if (campos instanceof Map) return Object.fromEntries(campos) as Record<string, string>;
  if (campos && typeof campos === "object" && !Array.isArray(campos)) return campos as Record<string, string>;
  return {};
}

function isValidCodigo(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (/^(n\/a|na|-)$/i.test(t)) return false;
  return true;
}

export function codigosValidosEnInscripcion(codigo: string, campos: Record<string, string> | Map<string, string> | undefined): Set<string> {
  const out = new Set<string>();
  const c = ensureRecord(campos);
  if (isValidCodigo(codigo)) out.add(String(codigo).trim());
  for (const [k, v] of Object.entries(c)) {
    if (!CODIGO_SLOT.test(k)) continue;
    if (isValidCodigo(v)) out.add(v.trim());
  }
  return out;
}

export function countParticipantes(p: Pick<Participante, "codigo" | "campos">): number {
  return codigosValidosEnInscripcion(p.codigo, p.campos).size;
}

export function esModalidadIndividual(tipo: string): boolean {
  return tipo === "modalidad_individual";
}

export function esModalidadEquipo(tipo: string): boolean {
  return tipo === "modalidad_equipo";
}

export function resumenParticipacionConcurso(participantes: Participante[]): {
  participantes_totales: number;
  individuales: number;
  equipo: number;
} {
  let participantes_totales = 0;
  let individuales = 0;
  let equipo = 0;
  for (const p of participantes) {
    const n = countParticipantes(p);
    participantes_totales += n;
    if (esModalidadIndividual(p.tipo)) individuales += n;
    else if (esModalidadEquipo(p.tipo)) equipo += n;
  }
  return { participantes_totales, individuales, equipo };
}

export function ocupacionPorPersonas(participantes: Participante[] | undefined): number {
  const list = participantes ?? [];
  let sum = 0;
  for (const p of list) {
    sum += countParticipantes(p);
  }
  return sum;
}
