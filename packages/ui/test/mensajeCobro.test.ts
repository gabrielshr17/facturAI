import { describe, expect, it } from "vitest";
import { mensajeCobroFiscal } from "../src/utilidades/mensajeCobro.js";

describe("mensajeCobroFiscal", () => {
  it("dice el NCF, el total y que la DGII lo aceptó", () => {
    expect(mensajeCobroFiscal({ ncf: "E310000000001", estado_dgii: "aceptado", total: 118 })).toBe(
      "Comprobante E310000000001 emitido por RD$ 118.00: aceptado por la DGII.",
    );
  });

  it("explica que un comprobante pendiente sigue en proceso", () => {
    const mensaje = mensajeCobroFiscal({ ncf: "E320000000002", estado_dgii: "pendiente", total: 50.5 });
    expect(mensaje).toContain("E320000000002");
    expect(mensaje).toContain("RD$ 50.50");
    expect(mensaje).toContain("en proceso");
  });

  it("cubre todos los estados de la DGII", () => {
    for (const estado of ["aceptado", "aceptado_condicional", "pendiente", "rechazado", "contingencia"] as const) {
      expect(mensajeCobroFiscal({ ncf: "E310000000001", estado_dgii: estado, total: 1 })).not.toContain("undefined");
    }
  });
});
