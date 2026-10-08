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

export function gubernamentalPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return consumoPrueba({
    ncf: "E450000000001",
    tipoEcf: "45",
    receptorDocumentoTipo: "rnc",
    receptorDocumentoNumero: "401000001",
    receptorNombre: "MINISTERIO EJEMPLO",
    ...cambios,
  });
}

export function regimenEspecialPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return consumoPrueba({
    ncf: "E440000000001",
    tipoEcf: "44",
    receptorDocumentoTipo: "rnc",
    receptorDocumentoNumero: "131880681",
    receptorNombre: "ZONA FRANCA EJEMPLO SA",
    lineas: [
      { descripcion: "Galletas", cantidad: 25, precioUnitario: 90, tasaImpuesto: 0, subtotal: 2250 },
      { descripcion: "Café molido", cantidad: 10, precioUnitario: 250, tasaImpuesto: 0, subtotal: 2500 },
    ],
    pagos: [{ metodo: "transferencia", monto: 4750 }],
    montoGravado: 0,
    montoExento: 4750,
    montoItbis: 0,
    total: 4750,
    ...cambios,
  });
}

export function exportacionPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return consumoPrueba({
    ncf: "E460000000001",
    tipoEcf: "46",
    receptorDocumentoTipo: "rnc",
    receptorDocumentoNumero: "131880681",
    receptorNombre: "IMPORTADORA EJEMPLO LTD",
    lineas: [
      { descripcion: "Sardinas", cantidad: 150, precioUnitario: 500, tasaImpuesto: 0, subtotal: 75000 },
      { descripcion: "Atún", cantidad: 50, precioUnitario: 850, tasaImpuesto: 0, subtotal: 42500 },
    ],
    pagos: [{ metodo: "transferencia", monto: 117500 }],
    montoGravado: 0,
    montoExento: 117500,
    montoItbis: 0,
    total: 117500,
    ...cambios,
  });
}

export function compraInformalPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return consumoPrueba({
    ncf: "E410000000001",
    tipoEcf: "41",
    receptorDocumentoTipo: "rnc",
    receptorDocumentoNumero: "101010101",
    receptorNombre: "PLOMERO EJEMPLO SRL",
    lineas: [
      {
        descripcion: "Reparación de tubería",
        cantidad: 1,
        precioUnitario: 1180,
        tasaImpuesto: 0.18,
        subtotal: 1180,
        esServicio: true,
        itbisRetenido: 54,
        isrRetenido: 50,
      },
      {
        descripcion: "Llave de paso",
        cantidad: 2,
        precioUnitario: 25,
        tasaImpuesto: 0,
        subtotal: 50,
        itbisRetenido: 0,
      },
    ],
    pagos: [],
    montoGravado: 1000,
    montoExento: 50,
    montoItbis: 180,
    total: 1230,
    ...cambios,
  });
}

export function gastoMenorPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return consumoPrueba({
    ncf: "E430000000001",
    tipoEcf: "43",
    lineas: [{ descripcion: "Taxi a la aduana", cantidad: 1, precioUnitario: 350, tasaImpuesto: 0, subtotal: 350 }],
    pagos: [],
    montoGravado: 0,
    montoExento: 350,
    montoItbis: 0,
    total: 350,
    ...cambios,
  });
}

export function pagoExteriorPrueba(cambios: Partial<ComprobanteATransmitir> = {}): ComprobanteATransmitir {
  return consumoPrueba({
    ncf: "E470000000001",
    tipoEcf: "47",
    receptorDocumentoTipo: null,
    receptorDocumentoNumero: "PA1234567",
    receptorNombre: "ACME LLC",
    lineas: [
      {
        descripcion: "Licencia de software",
        cantidad: 1,
        precioUnitario: 10000,
        tasaImpuesto: 0,
        subtotal: 10000,
        esServicio: true,
        isrRetenido: 2700,
      },
    ],
    pagos: [],
    montoGravado: 0,
    montoExento: 10000,
    montoItbis: 0,
    total: 10000,
    ...cambios,
  });
}
