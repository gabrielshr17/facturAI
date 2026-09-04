import { describe, it, expect } from "vitest";
import { calcularLinea, calcularTotales, procesarCobro } from "../src/dominio/factura.js";

describe("factura — desglose de ITBIS por línea", () => {
  it("extrae el ITBIS de un precio con impuesto incluido", () => {
    // 2 × 50.00 (ITBIS incl.) = 100.00 → gravado 84.75 + itbis 15.25
    const l = calcularLinea({ precioUnitario: 50, cantidad: 2, tasaImpuesto: 0.18 });
    expect(l.subtotal).toBe(100);
    expect(l.montoGravado).toBe(84.75);
    expect(l.montoItbis).toBe(15.25);
    expect(l.montoExento).toBe(0);
    // El desglose cuadra.
    expect(l.montoGravado + l.montoItbis).toBeCloseTo(l.subtotal, 2);
  });

  it("línea exenta: todo a exento, ITBIS 0", () => {
    const l = calcularLinea({ precioUnitario: 30, cantidad: 3, tasaImpuesto: 0 });
    expect(l.subtotal).toBe(90);
    expect(l.montoExento).toBe(90);
    expect(l.montoGravado).toBe(0);
    expect(l.montoItbis).toBe(0);
  });
});

describe("factura — totales (factura con gravado + exento, §10)", () => {
  it("suma gravado, exento e ITBIS por separado", () => {
    const t = calcularTotales([
      { precioUnitario: 50, cantidad: 2, tasaImpuesto: 0.18 }, // gravado
      { precioUnitario: 30, cantidad: 1, tasaImpuesto: 0 }, //     exento
    ]);
    expect(t.subtotalGravado).toBe(84.75);
    expect(t.subtotalExento).toBe(30);
    expect(t.totalItbis).toBe(15.25);
    expect(t.total).toBe(130);
    // Invariante: gravado + exento + itbis = total
    expect(t.subtotalGravado + t.subtotalExento + t.totalItbis).toBeCloseTo(t.total, 2);
  });

  it("factura vacía da todo en cero", () => {
    const t = calcularTotales([]);
    expect(t.total).toBe(0);
    expect(t.totalItbis).toBe(0);
  });
});

describe("factura — cobro y pago mixto (§7.2)", () => {
  it("efectivo simple con cambio", () => {
    const r = procesarCobro(100, [{ metodo: "efectivo", monto: 200 }]);
    expect(r.montoPagado).toBe(200);
    expect(r.suficiente).toBe(true);
    expect(r.cambio).toBe(100);
    expect(r.faltante).toBe(0);
  });

  it("pago mixto exacto: tarjeta + efectivo, sin cambio", () => {
    const r = procesarCobro(100, [
      { metodo: "tarjeta", monto: 60 },
      { metodo: "efectivo", monto: 40 },
    ]);
    expect(r.montoPagado).toBe(100);
    expect(r.suficiente).toBe(true);
    expect(r.cambio).toBe(0);
  });

  it("pago mixto con exceso en efectivo devuelve cambio", () => {
    const r = procesarCobro(100, [
      { metodo: "transferencia", monto: 60 },
      { metodo: "efectivo", monto: 50 },
    ]);
    expect(r.montoPagado).toBe(110);
    expect(r.cambio).toBe(10); // excedente 10 cubierto por efectivo
  });

  it("exceso pagado con tarjeta NO genera cambio ficticio", () => {
    const r = procesarCobro(100, [{ metodo: "tarjeta", monto: 120 }]);
    expect(r.montoPagado).toBe(120);
    expect(r.cambio).toBe(0); // no hay efectivo que devolver
  });

  it("pago insuficiente reporta faltante", () => {
    const r = procesarCobro(100, [{ metodo: "efectivo", monto: 70 }]);
    expect(r.suficiente).toBe(false);
    expect(r.faltante).toBe(30);
    expect(r.cambio).toBe(0);
  });
});
