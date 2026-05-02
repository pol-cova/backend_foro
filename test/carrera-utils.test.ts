import { describe, expect, it } from "bun:test";
import { normalizeCarrera } from "../src/lib/carrera-utils";

describe("normalizeCarrera", () => {
  it("title-cases a lowercase string", () => {
    expect(normalizeCarrera("ingeniería en sistemas computacionales")).toBe(
      "Ingeniería en Sistemas Computacionales"
    );
  });

  it("lowercases stop words mid-string", () => {
    expect(normalizeCarrera("LICENCIATURA EN ADMINISTRACION")).toBe(
      "Licenciatura en Administracion"
    );
  });

  it("capitalizes the first word even if it is a stop word", () => {
    expect(normalizeCarrera("en sistemas")).toBe("En Sistemas");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeCarrera("  arquitectura  ")).toBe("Arquitectura");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeCarrera("")).toBe("");
    expect(normalizeCarrera("   ")).toBe("");
  });
});
