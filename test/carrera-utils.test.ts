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

  it("returns N/A for empty or numeric input", () => {
    expect(normalizeCarrera("")).toBe("N/A");
    expect(normalizeCarrera("   ")).toBe("N/A");
    expect(normalizeCarrera("2")).toBe("N/A");
    expect(normalizeCarrera("123")).toBe("N/A");
  });

  it("preserves parenthesized acronyms", () => {
    expect(normalizeCarrera("INGENIERIA EN ELECTRONICA Y COMPUTACION (IELC)")).toBe(
      "Ingenieria en Electronica y Computacion (IELC)"
    );
  });

  it("title-cases all-caps input without parenthesized acronym", () => {
    expect(normalizeCarrera("INGENIERIA EN ELECTRONICA Y COMPUTACION")).toBe(
      "Ingenieria en Electronica y Computacion"
    );
  });
});
