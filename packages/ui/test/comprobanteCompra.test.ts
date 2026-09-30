import { describe, expect, it } from "vitest";
import { armarRetenciones, tiposDisponibles } from "../src/data/comprobanteCompra.js";

const EXENTA = { id: "l1", tasa_impuesto: 0 };
const GRAVADA = { id: "l2", tasa_impuesto: 0.18 };
const PROVEEDOR = { rnc: "101010101" };

function disponibles(lineas: { id: string; tasa_impuesto: number }[], proveedor: { rnc: string | null } | null) {
  return Object.fromEntries(tiposDisponibles(lineas, proveedor).map((t) => [t.tipo, t.motivoNoDisponible]));
}

describe("tipos de comprobante disponibles para una compra", () => {
  it("con artículos exentos y un proveedor con RNC se ofrecen los tres", () => {
    expect(disponibles([EXENTA], PROVEEDOR)).toEqual({ "41": null, "43": null, "47": null });
  });

  it("los gastos menores y los pagos al exterior no admiten artículos con ITBIS", () => {
    const motivos = disponibles([EXENTA, GRAVADA], PROVEEDOR);

    expect(motivos["41"]).toBeNull();
    expect(motivos["43"]).toMatch(/exentos/);
    expect(motivos["47"]).toMatch(/exentos/);
  });

  it("las compras y los pagos al exterior necesitan un proveedor; las compras, además, su RNC", () => {
    expect(disponibles([EXENTA], null)).toMatchObject({ "43": null });
    expect(disponibles([EXENTA], null)["41"]).toMatch(/proveedor/i);
    expect(disponibles([EXENTA], null)["47"]).toMatch(/proveedor/i);
    expect(disponibles([EXENTA], { rnc: null })["41"]).toMatch(/RNC/);
    expect(disponibles([EXENTA], { rnc: null })["47"]).toBeNull();
  });
});

describe("retenciones a partir del formulario", () => {
  const entradas = {
    l2: { esServicio: true, itbisRetenido: "54", isrRetenido: "50.5" },
    l1: { esServicio: false, itbisRetenido: "", isrRetenido: "" },
  };

  it("en un E41 conserva lo digitado y omite lo que quedó en blanco", () => {
    expect(armarRetenciones("41", [EXENTA, GRAVADA], entradas)).toEqual({
      l2: { esServicio: true, itbisRetenido: 54, isrRetenido: 50.5 },
      l1: { esServicio: false },
    });
  });

  it("en un E47 el ISR en blanco cuenta como cero y no lleva ITBIS retenido", () => {
    expect(armarRetenciones("47", [EXENTA, GRAVADA], entradas)).toEqual({
      l2: { esServicio: true, isrRetenido: 50.5 },
      l1: { esServicio: false, isrRetenido: 0 },
    });
  });

  it("un E43 no lleva retenciones", () => {
    expect(armarRetenciones("43", [EXENTA], entradas)).toEqual({});
  });

  it("una línea sin entradas se trata como no servicio y sin retención", () => {
    expect(armarRetenciones("41", [EXENTA], {})).toEqual({ l1: { esServicio: false } });
  });

  it("ignora el ISR que quedó escrito después de desmarcar el servicio", () => {
    const desmarcado = { l2: { esServicio: false, itbisRetenido: "", isrRetenido: "50" } };

    expect(armarRetenciones("41", [GRAVADA], desmarcado)).toEqual({ l2: { esServicio: false } });
    expect(armarRetenciones("47", [GRAVADA], desmarcado)).toEqual({ l2: { esServicio: false, isrRetenido: 0 } });
  });

  it("ignora el ITBIS retenido escrito en una línea exenta", () => {
    const exenta = { l1: { esServicio: false, itbisRetenido: "9", isrRetenido: "" } };

    expect(armarRetenciones("41", [EXENTA], exenta)).toEqual({ l1: { esServicio: false } });
  });

  it("un texto que no es un número (como un punto solo) cuenta como en blanco", () => {
    const basura = { l2: { esServicio: true, itbisRetenido: ".", isrRetenido: "5." } };

    expect(armarRetenciones("41", [GRAVADA], basura)).toEqual({
      l2: { esServicio: true, isrRetenido: 5 },
    });
    expect(
      armarRetenciones("47", [GRAVADA], { l2: { esServicio: true, itbisRetenido: "", isrRetenido: "." } }),
    ).toEqual({ l2: { esServicio: true, isrRetenido: 0 } });
  });
});
