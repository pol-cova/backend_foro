import { describe, expect, it } from "bun:test";
import {
  codigosValidosEnInscripcion,
  countParticipantes,
  esModalidadEquipo,
  esModalidadIndividual,
  ocupacionPorPersonas,
  resumenParticipacionConcurso,
} from "../src/modules/concursos/participante-count";
import type { Participante } from "../src/modules/concursos/mongoose";

describe("participante-count", () => {
  it("cuenta solo codigo raiz para individual sin slots", () => {
    expect(countParticipantes({ codigo: "219640329", campos: {} })).toBe(1);
  });

  it("deduplica codigo raiz con codigo_1 identico", () => {
    expect(
      countParticipantes({
        codigo: "219640329",
        campos: { codigo_1: "219640329" },
      })
    ).toBe(1);
  });

  it("cuenta tres codigos distintos en equipo", () => {
    expect(
      countParticipantes({
        codigo: "111",
        campos: { codigo_1: "222", codigo_2: "333" },
      })
    ).toBe(3);
  });

  it("ignora N/A y vacios en slots", () => {
    expect(
      countParticipantes({
        codigo: "111",
        campos: {
          codigo_1: "N/A",
          codigo_2: "n/a",
          codigo_3: "-",
          codigo_4: "222",
        },
      })
    ).toBe(2);
  });

  it("codigosValidosEnInscripcion ignora claves que no son codigo_N", () => {
    const set = codigosValidosEnInscripcion("1", { otro_codigo: "999", codigo_1: "2" });
    expect([...set].sort()).toEqual(["1", "2"]);
  });

  it("resumenParticipacionConcurso separa modalidades", () => {
    const list: Participante[] = [
      {
        tipo: "modalidad_individual",
        codigo: "A",
        nombre: "x",
        carrera: "c",
        semestre: 1,
        correo: "e",
        escuela: "s",
        nivel: "n",
        campos: {},
      },
      {
        tipo: "modalidad_equipo",
        codigo: "1",
        nombre: "x",
        carrera: "c",
        semestre: 1,
        correo: "e",
        escuela: "s",
        nivel: "n",
        campos: { codigo_1: "2", codigo_2: "3" },
      },
    ];
    expect(resumenParticipacionConcurso(list)).toEqual({
      participantes_totales: 4,
      individuales: 1,
      equipo: 3,
    });
  });

  it("modalidad desconocida suma solo a totales", () => {
    const list: Participante[] = [
      {
        tipo: "otra_modalidad",
        codigo: "X",
        nombre: "x",
        carrera: "c",
        semestre: 1,
        correo: "e",
        escuela: "s",
        nivel: "n",
        campos: {},
      },
    ];
    expect(resumenParticipacionConcurso(list)).toEqual({
      participantes_totales: 1,
      individuales: 0,
      equipo: 0,
    });
  });

  it("esModalidadIndividual y esModalidadEquipo", () => {
    expect(esModalidadIndividual("modalidad_individual")).toBe(true);
    expect(esModalidadEquipo("modalidad_equipo")).toBe(true);
    expect(esModalidadIndividual("modalidad_equipo")).toBe(false);
  });

  it("ocupacionPorPersonas", () => {
    const list: Participante[] = [
      { tipo: "modalidad_individual", codigo: "1", nombre: "", carrera: "", semestre: 1, correo: "", escuela: "", nivel: "", campos: {} },
      { tipo: "modalidad_equipo", codigo: "2", nombre: "", carrera: "", semestre: 1, correo: "", escuela: "", nivel: "", campos: { codigo_1: "3" } },
    ];
    expect(ocupacionPorPersonas(list)).toBe(3);
  });
});
