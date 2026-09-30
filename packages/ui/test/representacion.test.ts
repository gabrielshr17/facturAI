import { describe, expect, it } from "vitest";
import type { Cliente, ComprobanteFiscal, Factura, SecuenciaNcf } from "@sfr/core";
import { comprobanteParaRecibo, datosReciboNotaDebito, encabezadoFiscal } from "../src/impresion/representacion.js";

function comprobante(cambios: Partial<ComprobanteFiscal>): ComprobanteFiscal {
  return {
    id: "c1",
    factura_id: "f1",
    compra_id: null,
    tipo_ecf: "32",
    ncf: "E320000000001",
    secuencia_id: "s1",
    rnc_emisor: "131880738",
    receptor_documento_tipo: null,
    receptor_documento_numero: null,
    receptor_nombre: null,
    fecha_emision: "2026-10-01T18:30:00.000Z",
    monto_gravado: 0,
    monto_exento: 0,
    monto_itbis: 0,
    total: 0,
    estado_dgii: "aceptado",
    track_id_dgii: null,
    codigo_seguridad: null,
    xml_firmado_ruta: null,
    qr_url: null,
    fecha_transmision: null,
    fecha_firma: null,
    xml_firmado: null,
    motivo_rechazo: null,
    entrega_estado: "no_aplica",
    entrega_detalle: null,
    acuse_recibo_xml: null,
    created_at: "2026-10-01T18:30:00.000Z",
    updated_at: "2026-10-01T18:30:00.000Z",
    deleted_at: null,
    ...cambios,
  };
}

const SECUENCIAS = {
  async obtener(): Promise<SecuenciaNcf | undefined> {
    return { vencimiento: "2027-12-31" } as SecuenciaNcf;
  },
};

function xmlConReferencia(ncf: string, codigo: number): string {
  return (
    "<ECF><Encabezado></Encabezado><InformacionReferencia>" +
    `<NCFModificado>${ncf}</NCFModificado><FechaNCFModificado>25-09-2026</FechaNCFModificado>` +
    `<CodigoModificacion>${codigo}</CodigoModificacion></InformacionReferencia></ECF>`
  );
}

describe("representación impresa de notas de crédito y débito", () => {
  it("una nota de débito muestra vencimiento, e-NCF modificado y el código de modificación en palabras", async () => {
    const ri = await comprobanteParaRecibo(
      comprobante({
        tipo_ecf: "33",
        ncf: "E330000000001",
        xml_firmado: xmlConReferencia("E310000000007", 3),
      }),
      SECUENCIAS,
    );

    expect(encabezadoFiscal(ri)).toEqual([
      "Nota de Débito Electrónica",
      "e-NCF: E330000000001",
      "Válido hasta: 31-12-2027",
      "e-NCF modificado: E310000000007",
      "Código de modificación: Corrige montos del NCF modificado",
    ]);
  });

  it("una nota de crédito no muestra vencimiento pero sí lo que modifica", async () => {
    const ri = await comprobanteParaRecibo(
      comprobante({
        tipo_ecf: "34",
        ncf: "E340000000001",
        xml_firmado: xmlConReferencia("E320000000001", 1),
      }),
      SECUENCIAS,
    );

    expect(encabezadoFiscal(ri)).toEqual([
      "Nota de Crédito Electrónica",
      "e-NCF: E340000000001",
      "e-NCF modificado: E320000000001",
      "Código de modificación: Anula el NCF modificado",
    ]);
  });

  it("un comprobante que no es nota no muestra referencia aunque traiga XML", async () => {
    const ri = await comprobanteParaRecibo(comprobante({ xml_firmado: "<ECF></ECF>" }), SECUENCIAS);

    expect(encabezadoFiscal(ri)).toEqual(["Factura de Consumo Electrónica", "e-NCF: E320000000001"]);
  });

  it("si la nota no guardó su XML, imprime sin referencia en lugar de fallar", async () => {
    const ri = await comprobanteParaRecibo(comprobante({ tipo_ecf: "34", ncf: "E340000000001" }), SECUENCIAS);

    expect(encabezadoFiscal(ri)).toEqual(["Nota de Crédito Electrónica", "e-NCF: E340000000001"]);
  });
});

describe("recibo de una nota de débito", () => {
  it("imprime una sola línea con el cargo, su ITBIS y la referencia al comprobante original", async () => {
    const nota = comprobante({
      tipo_ecf: "33",
      ncf: "E330000000001",
      monto_gravado: 50,
      monto_itbis: 9,
      total: 59,
      fecha_emision: "2026-10-05T14:00:00.000Z",
      receptor_nombre: "FERRETERIA EJEMPLO SRL",
      receptor_documento_numero: "101010101",
      xml_firmado: xmlConReferencia("E310000000007", 3),
    });

    const datos = await datosReciboNotaDebito({
      nota,
      factura: { numero_interno: 41 } as Factura,
      cliente: { nombre: "Ferretería", apellidos: null } as Cliente,
      negocio: {
        nombre_comercial: "Suplidora Marohi",
        rnc: "131880738",
        direccion: null,
        telefono: null,
        ancho_impresora_default: 80,
      },
      concepto: "Interés por mora",
      tasaImpuesto: 0.18,
      secuencias: SECUENCIAS,
    });

    expect(datos.lineas).toEqual([
      {
        descripcion: "Interés por mora",
        cantidad: 1,
        precio_unitario: 59,
        subtotal: 59,
        tasa_impuesto: 0.18,
        monto_itbis: 9,
      },
    ]);
    expect(datos.pagos).toEqual([]);
    expect(datos.factura).toMatchObject({
      numero_interno: 41,
      fecha_hora: "2026-10-05T14:00:00.000Z",
      subtotal_gravado: 50,
      subtotal_exento: 0,
      total_itbis: 9,
      total: 59,
      monto_pagado: 0,
      cambio: 0,
    });
    expect(datos.comprobante?.referencia?.ncfModificado).toBe("E310000000007");
    expect(datos.comprobante?.ncf).toBe("E330000000001");
  });
});
