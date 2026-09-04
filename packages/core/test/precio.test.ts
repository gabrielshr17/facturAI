import { describe, it, expect } from "vitest";
import {
  PCT_GANANCIA_POR_DEFECTO,
  precioDesdeCosto,
  pctGananciaDesdePrecio,
  calcularPrecioVenta,
} from "../src/dominio/precio.js";

describe("precio — costo + % de ganancia (§5)", () => {
  it("el % de ganancia se aplica directo sobre el costo", () => {
    expect(precioDesdeCosto(100, 20)).toBe(120); // el caso de siempre: 100 + 20% = 120
    expect(precioDesdeCosto(40, 25)).toBe(50);
    expect(precioDesdeCosto(100, 0)).toBe(100);
    expect(precioDesdeCosto(33.33, 30)).toBe(43.33);
  });

  it("el nuevo producto nace con 20% de ganancia", () => {
    expect(PCT_GANANCIA_POR_DEFECTO).toBe(20);
  });

  it("el impuesto NO se suma encima: va incluido en el precio", () => {
    // Antes esto daba 141.60 (120 + 18% de ITBIS) y el usuario veía un precio que
    // no era el que había pedido. El ITBIS se extrae de los 120 en la factura.
    expect(calcularPrecioVenta({ costo: 100, pctGanancia: 20 })).toBe(120);
    expect(calcularPrecioVenta({ costo: 40, pctGanancia: 25 })).toBe(50);
  });

  it("pctGananciaDesdePrecio es el inverso exacto", () => {
    expect(pctGananciaDesdePrecio(100, 120)).toBe(20);
    expect(pctGananciaDesdePrecio(40, 50)).toBe(25);
    expect(pctGananciaDesdePrecio(0, 120)).toBe(0); // sin costo el margen no está definido
  });
});

describe("precio — el valor manual manda (§5)", () => {
  it("usa el precio manual e ignora la derivación", () => {
    expect(calcularPrecioVenta({ costo: 40, pctGanancia: 25, precioManual: 55 })).toBe(55);
  });

  it("precio manual 0 es válido y manda", () => {
    expect(calcularPrecioVenta({ costo: 40, pctGanancia: 25, precioManual: 0 })).toBe(0);
  });

  it("precio manual null/negativo cae a la derivación", () => {
    expect(calcularPrecioVenta({ costo: 40, pctGanancia: 25, precioManual: null })).toBe(50);
    expect(calcularPrecioVenta({ costo: 40, pctGanancia: 25, precioManual: -5 })).toBe(50);
  });
});
