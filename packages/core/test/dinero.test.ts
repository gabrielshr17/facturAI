import { describe, it, expect } from "vitest";
import { redondear2, ajustarCentavo, calcularCambio, sumar } from "../src/dominio/dinero.js";

describe("dinero — redondeo a 2 decimales (§5)", () => {
  it("redondea a 2 decimales medio-arriba", () => {
    expect(redondear2(1.005)).toBe(1.01); // caso clásico de coma flotante
    expect(redondear2(2.675)).toBe(2.68);
    expect(redondear2(0.1 + 0.2)).toBe(0.3);
  });

  it("no rompe con no-finitos", () => {
    expect(redondear2(NaN)).toBe(0);
    expect(redondear2(Infinity)).toBe(0);
  });

  it("ajustarCentavo redondea al centavo más cercano", () => {
    expect(ajustarCentavo(10.014)).toBe(10.01);
    expect(ajustarCentavo(10.015)).toBe(10.02);
  });
});

describe("dinero — cambio (§5: cambio al centavo más cercano)", () => {
  it("calcula el cambio pagado - total", () => {
    expect(calcularCambio(84.75, 100)).toBe(15.25);
    expect(calcularCambio(50, 50)).toBe(0);
  });

  it("nunca devuelve cambio negativo", () => {
    expect(calcularCambio(100, 80)).toBe(0);
  });

  it("ajusta el cambio al centavo", () => {
    expect(calcularCambio(33.333, 50)).toBe(16.67);
  });
});

describe("dinero — sumar", () => {
  it("suma redondeando el resultado", () => {
    expect(sumar([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sumar([10.005, 10.005])).toBe(20.01);
    expect(sumar([])).toBe(0);
  });
});
