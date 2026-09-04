import { describe, it, expect } from "vitest";
import { esCorreoValido, esRncValido, esCedulaValida, esDocumentoValido } from "../src/dominio/validacion.js";

describe("validación — correo (§5)", () => {
  it("acepta correos válidos", () => {
    expect(esCorreoValido("juan@example.com")).toBe(true);
    expect(esCorreoValido("  ventas@laesperanza.do  ")).toBe(true);
  });
  it("rechaza correos inválidos", () => {
    expect(esCorreoValido("juan@")).toBe(false);
    expect(esCorreoValido("juan.com")).toBe(false);
    expect(esCorreoValido("")).toBe(false);
  });
});

describe("validación — RNC (§6: 9 dígitos con verificador DGII)", () => {
  it("acepta un RNC con dígito verificador correcto", () => {
    expect(esRncValido("101023122")).toBe(true);
    expect(esRncValido("101-02312-2")).toBe(true); // con separadores
  });
  it("rechaza longitud incorrecta o verificador malo", () => {
    expect(esRncValido("12345678")).toBe(false); // 8 dígitos
    expect(esRncValido("101023121")).toBe(false); // verificador incorrecto
  });
});

describe("validación — cédula (11 dígitos, Luhn)", () => {
  it("acepta una cédula con verificador correcto", () => {
    expect(esCedulaValida("00101912343")).toBe(true);
  });
  it("rechaza longitud o verificador incorrecto", () => {
    expect(esCedulaValida("123")).toBe(false);
    expect(esCedulaValida("00101912340")).toBe(false);
  });
});

describe("validación — documento opcional", () => {
  it("documento vacío es válido (opcional)", () => {
    expect(esDocumentoValido(null, null)).toBe(true);
    expect(esDocumentoValido("rnc", null)).toBe(true);
  });
  it("valida según el tipo", () => {
    expect(esDocumentoValido("rnc", "101023122")).toBe(true);
    expect(esDocumentoValido("rnc", "111111111")).toBe(false);
  });
});
