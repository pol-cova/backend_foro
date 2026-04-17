import { describe, expect, it } from "bun:test";
import { mapParticipante, mapConcursoToResponse } from "../src/modules/concursos/mappers";

describe("concursos mappers", () => {
  describe("mapParticipante", () => {
    it("maps plain object campos to Record", () => {
      const raw = {
        _id: "abc123",
        tipo: "modalidad_individual",
        codigo: "123",
        nombre: "Test",
        carrera: "CS",
        semestre: 5,
        correo: "a@b.com",
        escuela: "CUV",
        nivel: "Avanzado",
        campos: { proyecto: "X" },
      };
      const result = mapParticipante(raw);
      expect(result._id).toBe("abc123");
      expect(result.campos).toEqual({ proyecto: "X" });
      expect(result.confirmacionEmailEstado).toBe("unknown");
    });

    it("converts Map campos to Record", () => {
      const raw = {
        _id: "id1",
        tipo: "modalidad_individual",
        codigo: "123",
        nombre: "Test",
        carrera: "CS",
        semestre: 5,
        correo: "a@b.com",
        escuela: "CUV",
        nivel: "Avanzado",
        campos: new Map([["key", "value"]]),
      };
      const result = mapParticipante(raw);
      expect(result.campos).toEqual({ key: "value" });
      expect(result.confirmacionEmailEstado).toBe("unknown");
    });

    it("handles missing campos", () => {
      const raw = {
        tipo: "modalidad_individual",
        codigo: "123",
        nombre: "Test",
        carrera: "CS",
        semestre: 5,
        correo: "a@b.com",
        escuela: "CUV",
        nivel: "Avanzado",
      };
      const result = mapParticipante(raw);
      expect(result.campos).toEqual({});
      expect(result.confirmacionEmailEstado).toBe("unknown");
    });
  });

  describe("mapConcursoToResponse", () => {
    it("maps concurso with participants", () => {
      const raw = {
        _id: "conc1",
        nombre: "Expo",
        cupo: 10,
        constraints: [{ id: "Individual", field: "proyecto" }],
        niveles: ["Basico", "Avanzado"],
        participantes: [
          {
            _id: "p1",
            tipo: "modalidad_individual",
            codigo: "123",
            nombre: "A",
            carrera: "CS",
            semestre: 5,
            correo: "a@b.com",
            escuela: "CUV",
            nivel: "Avanzado",
            campos: { proyecto: "P" },
            confirmacionEmailEstado: "sent",
            confirmacionEmailEnviadoEn: new Date("2026-01-15T12:00:00.000Z"),
          },
        ],
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-02"),
      };
      const result = mapConcursoToResponse(raw);
      expect(result._id).toBe("conc1");
      expect(result.nombre).toBe("Expo");
      expect(result.participantes).toHaveLength(1);
      expect(result.participantes_totales).toBe(1);
      expect(result.individuales).toBe(1);
      expect(result.equipo).toBe(0);
      expect(result.participantes[0].nombre).toBe("A");
      expect(result.participantes[0].campos).toEqual({ proyecto: "P" });
      expect(result.participantes[0].confirmacionEmailEstado).toBe("sent");
      expect(result.participantes[0].confirmacionEmailEnviadoEn).toEqual(new Date("2026-01-15T12:00:00.000Z"));
    });

    it("provides default dates when missing", () => {
      const raw = {
        _id: "c1",
        nombre: "N",
        cupo: 5,
        constraints: [],
        niveles: ["X"],
        participantes: [],
      };
      const result = mapConcursoToResponse(raw);
      expect(result.participantes_totales).toBe(0);
      expect(result.individuales).toBe(0);
      expect(result.equipo).toBe(0);
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });
  });
});
