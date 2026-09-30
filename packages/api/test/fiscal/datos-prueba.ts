import type { ComprobanteATransmitir } from "@sfr/core";

export const EMISOR_PRUEBA = {
  rnc: "131880738",
  razonSocial: "SUPLIDORA MAROHI SRL",
  nombreComercial: "Suplidora Marohi",
  direccion: "Calle Principal #1, Santo Domingo",
};

export function consumoPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return {
    ncf: "E320000000001",
    tipoEcf: "32",
    emisor: EMISOR_PRUEBA,
    fechaEmision: "2026-10-01T18:30:00.000Z",
    fechaVencimientoSecuencia: "2027-12-31",
    receptorDocumentoTipo: null,
    receptorDocumentoNumero: null,
    receptorNombre: null,
    lineas: [
      { descripcion: "Arroz Selecto 5lb", cantidad: 2, precioUnitario: 118, tasaImpuesto: 0.18, subtotal: 236 },
      { descripcion: "Plátano verde", cantidad: 1, precioUnitario: 50, tasaImpuesto: 0, subtotal: 50 },
    ],
    pagos: [{ metodo: "efectivo", monto: 286 }],
    montoGravado: 200,
    montoExento: 50,
    montoItbis: 36,
    total: 286,
    referencia: null,
    ...cambios,
  };
}

export function creditoFiscalPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return consumoPrueba({
    ncf: "E310000000001",
    tipoEcf: "31",
    receptorDocumentoTipo: "rnc",
    receptorDocumentoNumero: "101010101",
    receptorNombre: "FERRETERIA EJEMPLO SRL",
    ...cambios,
  });
}

export function notaCreditoPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return consumoPrueba({
    ncf: "E340000000001",
    tipoEcf: "34",
    fechaVencimientoSecuencia: null,
    lineas: [{ descripcion: "Arroz Selecto 5lb", cantidad: 1, precioUnitario: 118, tasaImpuesto: 0.18, subtotal: 118 }],
    pagos: [],
    montoGravado: 100,
    montoExento: 0,
    montoItbis: 18,
    total: 118,
    referencia: {
      ncfModificado: "E320000000001",
      fechaNcfModificado: "2026-09-25T15:00:00.000Z",
      codigoModificacion: 3,
      razon: "Devolución de mercancía",
    },
    ...cambios,
  });
}

export function notaDebitoPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return consumoPrueba({
    ncf: "E330000000001",
    tipoEcf: "33",
    lineas: [{ descripcion: "Interés por mora", cantidad: 1, precioUnitario: 59, tasaImpuesto: 0.18, subtotal: 59 }],
    pagos: [],
    montoGravado: 50,
    montoExento: 0,
    montoItbis: 9,
    total: 59,
    referencia: {
      ncfModificado: "E310000000001",
      fechaNcfModificado: "2026-09-25T15:00:00.000Z",
      codigoModificacion: 3,
      razon: "Interés por pago tardío",
    },
    ...cambios,
  });
}
