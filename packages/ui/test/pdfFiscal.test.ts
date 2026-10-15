import { describe, expect, it } from "vitest";
import { generarPdfRecibo } from "../src/impresion/pdf.js";
import type { ReciboDatos } from "../src/impresion/recibo.js";

function datos(cambios: Partial<ReciboDatos> = {}): ReciboDatos {
  return {
    negocio: {
      nombre_comercial: "Suplidora Marohi",
      razon_social: "Suplidora Marohi SRL",
      rnc: "132069031",
      direccion: "Federico Velasquez #72",
      telefono: "8095389401",
      ancho_impresora_default: 80,
    },
    factura: {
      numero_interno: 10,
      fecha_hora: "2026-10-09T16:15:47.766Z",
      subtotal_gravado: 42.37,
      subtotal_exento: 0,
      total_itbis: 7.63,
      total: 50,
      monto_pagado: 50,
      cambio: 0,
      notas: null,
    },
    lineas: [
      {
        descripcion: "Arroz Selecto 5 lb",
        cantidad: 1,
        precio_unitario: 50,
        subtotal: 50,
        tasa_impuesto: 0.18,
        monto_itbis: 7.63,
      },
    ],
    pagos: [{ metodo: "efectivo", monto: 50 }],
    cliente: null,
    comprobante: {
      ncf: "E310000001001",
      tipoEcfEtiqueta: "Factura de Crédito Fiscal Electrónica",
      fechaVencimientoSecuencia: "2028-12-31",
      receptorDocumento: "131880681",
      receptorNombre: "DOCUMENTOS ELECTRONICOS DE 03",
      codigoSeguridad: "AbC123",
      fechaFirma: "09-10-2026 12:15:44",
      qrUrl: "https://ecf.dgii.gov.do/certecf/consultatimbre?x=1",
      referencia: null,
    },
    ...cambios,
  };
}

function textoPdf(d: ReciboDatos): string {
  return generarPdfRecibo(d).output();
}

describe("PDF de la representación impresa según el modelo de la DGII", () => {
  it("usa los rótulos del modelo en el encabezado, el comprador y el timbre", () => {
    const t = textoPdf(datos());

    for (const esperado of [
      "Factura de Crédito Fiscal Electrónica",
      "e-NCF: E310000001001",
      "Fecha Vencimiento: 31-12-2028",
      "Fecha Emisión: ",
      "09-10-2026",
      "Razón Social Cliente: ",
      "DOCUMENTOS ELECTRONICOS DE 03",
      "RNC Cliente: ",
      "131880681",
      "Código de Seguridad: AbC123",
      "Fecha Firma: 09-10-2026 12:15:44",
    ]) {
      expect(t).toContain(esperado);
    }
  });

  it("la tabla lleva Cantidad, Unidad de Medida y los totales del modelo, sin número de ticket ni pagos", () => {
    const t = textoPdf(datos());

    for (const esperado of ["Cantidad", "Unidad de", "Medida", "Subtotal Gravado", "Total ITBIS", "Total"]) {
      expect(t).toContain(esperado);
    }
    expect(t).not.toContain("No. 10");
    expect(t).not.toContain("Efectivo");
    expect(t).not.toContain("Cambio");
  });

  it("una nota muestra el NCF modificado y el motivo", () => {
    const base = datos();
    const t = textoPdf({
      ...base,
      comprobante: {
        ...base.comprobante!,
        tipoEcfEtiqueta: "Nota de Crédito Electrónica",
        ncf: "E340000001001",
        fechaVencimientoSecuencia: null,
        referencia: { ncfModificado: "E310000001002", codigoModificacion: "Anula el NCF modificado" },
      },
    });

    expect(t).toContain("NCF Modificado: E310000001002");
    expect(t).toContain("Anula el NCF modificado");
    expect(t).not.toContain("Fecha Vencimiento");
  });

  it("un recibo sin comprobante fiscal conserva su formato", () => {
    const t = textoPdf(datos({ comprobante: null }));

    expect(t).toContain("FACTURA");
    expect(t).toContain("No. 10");
  });
});
