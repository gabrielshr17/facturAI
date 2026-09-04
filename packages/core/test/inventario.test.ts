import { describe, it, expect } from "vitest";
import { evaluarDisponibilidad } from "../src/dominio/inventario.js";

describe("inventario — evaluarDisponibilidad (§3: inventario configurable)", () => {
  it("con inventario apagado, siempre permite (sin validar existencia)", () => {
    const r = evaluarDisponibilidad({
      inventarioActivo: false,
      existencia: 0,
      politica: "bloquear",
      cantidadSolicitada: 100,
    });
    expect(r.permitido).toBe(true);
    expect(r.faltante).toBe(0);
  });

  it("con existencia suficiente, permite sin importar la política", () => {
    const r = evaluarDisponibilidad({
      inventarioActivo: true,
      existencia: 10,
      politica: "bloquear",
      cantidadSolicitada: 5,
    });
    expect(r.permitido).toBe(true);
    expect(r.faltante).toBe(0);
  });

  it("política 'bloquear' rechaza cuando falta existencia", () => {
    const r = evaluarDisponibilidad({
      inventarioActivo: true,
      existencia: 2,
      politica: "bloquear",
      cantidadSolicitada: 5,
    });
    expect(r.permitido).toBe(false);
    expect(r.faltante).toBe(3);
  });

  it("política 'advertir' permite igual, pero informa el faltante", () => {
    const r = evaluarDisponibilidad({
      inventarioActivo: true,
      existencia: 2,
      politica: "advertir",
      cantidadSolicitada: 5,
    });
    expect(r.permitido).toBe(true);
    expect(r.faltante).toBe(3);
  });

  it("trata existencia NULL como cero", () => {
    const r = evaluarDisponibilidad({
      inventarioActivo: true,
      existencia: null,
      politica: "bloquear",
      cantidadSolicitada: 1,
    });
    expect(r.permitido).toBe(false);
    expect(r.faltante).toBe(1);
  });
});
