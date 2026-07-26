import { describe, it, expect } from "vitest";
import {
  precioBaseDesdeCosto,
  calcularPrecioVenta,
} from "../src/dominio/precio.js";

describe("precio — costo + % de ganancia (§5)", () => {
  it("deriva el precio base sin impuesto", () => {
    expect(precioBaseDesdeCosto(40, 25)).toBe(50); // 40 + 25%
    expect(precioBaseDesdeCosto(100, 0)).toBe(100);
    expect(precioBaseDesdeCosto(33.33, 30)).toBe(43.33);
  });

  it("calcula el precio final con ITBIS incluido", () => {
    // base 50 + 18% ITBIS = 59
    expect(calcularPrecioVenta({ costo: 40, pctGanancia: 25, tasaImpuesto: 0.18 })).toBe(59);
  });

  it("producto exento no suma impuesto", () => {
    expect(calcularPrecioVenta({ costo: 40, pctGanancia: 25, tasaImpuesto: 0 })).toBe(50);
  });
});

describe("precio — el valor manual manda (§5)", () => {
  it("usa el precio manual e ignora la derivación", () => {
    const p = calcularPrecioVenta({
      costo: 40,
      pctGanancia: 25,
      tasaImpuesto: 0.18,
      precioManual: 55,
    });
    expect(p).toBe(55);
  });

  it("precio manual 0 es válido y manda", () => {
    const p = calcularPrecioVenta({
      costo: 40,
      pctGanancia: 25,
      tasaImpuesto: 0.18,
      precioManual: 0,
    });
    expect(p).toBe(0);
  });

  it("precio manual null/negativo cae a la derivación", () => {
    expect(
      calcularPrecioVenta({ costo: 40, pctGanancia: 25, tasaImpuesto: 0.18, precioManual: null }),
    ).toBe(59);
    expect(
      calcularPrecioVenta({ costo: 40, pctGanancia: 25, tasaImpuesto: 0.18, precioManual: -5 }),
    ).toBe(59);
  });
});
