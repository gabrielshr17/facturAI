import type { ComprobanteATransmitir, MetodoPago, PagoATransmitir } from "@sfr/core";
import { fechaDgii, fechaHoraDgii, montoDgii } from "../formato.js";
import { DocumentoFiscalInvalidoError } from "../errores.js";
import { documentoXml, texto, type Nodo } from "./nodo.js";
import { perfilDe, type PerfilEcf } from "./perfiles.js";
import { calcularTotalesEcf, indicadorFacturacion, redondear2 } from "./totales.js";

const FORMA_PAGO_DGII: Record<MetodoPago, string> = {
  efectivo: "1",
  transferencia: "2",
  tarjeta: "3",
  credito: "4",
};

export const UMBRAL_RESUMEN_CONSUMO = 250_000;

export function esConsumoResumible(doc: ComprobanteATransmitir): boolean {
  return doc.tipoEcf === "32" && calcularTotalesEcf(doc.lineas).montoTotal < UMBRAL_RESUMEN_CONSUMO;
}

const DIAS_LIMITE_NOTA_CREDITO = 30;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function monto(valor: number | null): string | null {
  return valor === null ? null : montoDgii(valor);
}

function tipoPago(pagos: PagoATransmitir[]): string {
  return pagos.some((p) => p.metodo === "credito") ? "2" : "1";
}

function tablaFormasPago(pagos: PagoATransmitir[]): Nodo {
  return [
    "TablaFormasPago",
    pagos
      .filter((p) => p.monto > 0)
      .slice(0, 7)
      .map((p): Nodo => [
        "FormaDePago",
        [
          ["FormaPago", FORMA_PAGO_DGII[p.metodo]],
          ["MontoPago", montoDgii(p.monto)],
        ],
      ]),
  ];
}

function indicadorNotaCredito(doc: ComprobanteATransmitir): string {
  const referencia = doc.referencia!;
  const dias = (new Date(doc.fechaEmision).getTime() - new Date(referencia.fechaNcfModificado).getTime()) / MS_POR_DIA;
  return dias > DIAS_LIMITE_NOTA_CREDITO ? "1" : "0";
}

function validarRetenciones(doc: ComprobanteATransmitir, perfil: PerfilEcf): void {
  if (perfil.retencion === "isr" && doc.lineas.some((l) => l.isrRetenido === undefined)) {
    throw new DocumentoFiscalInvalidoError(`El E${doc.tipoEcf} requiere el ISR retenido en cada línea.`);
  }
  if (perfil.retencion !== "ninguna" && doc.lineas.some((l) => (l.isrRetenido ?? 0) > 0 && !l.esServicio)) {
    throw new DocumentoFiscalInvalidoError("Solo se puede retener ISR en un servicio, no en un bien.");
  }
}

function validar(doc: ComprobanteATransmitir, perfil: PerfilEcf): void {
  if (doc.lineas.length === 0) throw new DocumentoFiscalInvalidoError("El comprobante no tiene líneas.");
  if (doc.lineas.length > 1000) throw new DocumentoFiscalInvalidoError("La DGII admite como máximo 1000 líneas.");
  if (!texto(doc.emisor.rnc) || !texto(doc.emisor.razonSocial) || !texto(doc.emisor.direccion)) {
    throw new DocumentoFiscalInvalidoError("Faltan datos del emisor (RNC, razón social o dirección).");
  }
  if (perfil.comprador === "identificado" && (!texto(doc.receptorDocumentoNumero) || !texto(doc.receptorNombre))) {
    throw new DocumentoFiscalInvalidoError(`El E${doc.tipoEcf} requiere RNC y razón social del comprador.`);
  }
  if (perfil.soloExento && doc.lineas.some((l) => indicadorFacturacion(l) !== 4)) {
    throw new DocumentoFiscalInvalidoError(`El E${doc.tipoEcf} solo admite ítems exentos de ITBIS.`);
  }
  if (perfil.tasaCero && doc.lineas.some((l) => l.tasaImpuesto !== 0)) {
    throw new DocumentoFiscalInvalidoError(`El E${doc.tipoEcf} solo admite ítems con ITBIS a tasa 0%.`);
  }
  validarRetenciones(doc, perfil);
  if (perfil.vencimientoSecuencia && !doc.fechaVencimientoSecuencia) {
    throw new DocumentoFiscalInvalidoError(`El E${doc.tipoEcf} requiere la fecha de vencimiento de la secuencia.`);
  }
  if (doc.tipoEcf === "32" && !esConsumoResumible(doc) && !texto(doc.receptorDocumentoNumero)) {
    throw new DocumentoFiscalInvalidoError(
      "Una factura de consumo de RD$250,000.00 o más requiere el RNC o cédula del comprador.",
    );
  }
  if (perfil.exigeReferencia && !doc.referencia) {
    throw new DocumentoFiscalInvalidoError(
      "Las notas de crédito y débito requieren la referencia al comprobante modificado.",
    );
  }
}

function idDoc(doc: ComprobanteATransmitir, perfil: PerfilEcf, hayGravado: boolean): Nodo {
  return [
    "IdDoc",
    [
      ["TipoeCF", doc.tipoEcf],
      ["eNCF", doc.ncf],
      ["IndicadorNotaCredito", perfil.indicadorNotaCredito ? indicadorNotaCredito(doc) : null],
      [
        "FechaVencimientoSecuencia",
        perfil.vencimientoSecuencia && doc.fechaVencimientoSecuencia
          ? fechaDgii(`${doc.fechaVencimientoSecuencia}T12:00:00Z`)
          : null,
      ],
      ["IndicadorMontoGravado", hayGravado && perfil.indicadorMontoGravado ? "1" : null],
      ["TipoIngresos", perfil.tipoIngresos ? "01" : null],
      ["TipoPago", perfil.tipoPago ? tipoPago(doc.pagos) : null],
      perfil.formasPago ? tablaFormasPago(doc.pagos) : ["TablaFormasPago", null],
    ],
  ];
}

function emisor(doc: ComprobanteATransmitir): Nodo {
  return [
    "Emisor",
    [
      ["RNCEmisor", doc.emisor.rnc],
      ["RazonSocialEmisor", texto(doc.emisor.razonSocial, 150)],
      ["NombreComercial", texto(doc.emisor.nombreComercial, 150)],
      ["DireccionEmisor", texto(doc.emisor.direccion, 100)],
      ["FechaEmision", fechaDgii(doc.fechaEmision)],
    ],
  ];
}

/** Cuando el bloque Comprador es opcional en el XSD y no hay datos se omite (la DGII rechaza tags vacíos). */
function comprador(doc: ComprobanteATransmitir, perfil: PerfilEcf): Nodo {
  const rnc = texto(doc.receptorDocumentoNumero);
  const nombre = texto(doc.receptorNombre, 150);
  const sinDatos = !rnc && !nombre;
  if (
    perfil.comprador === "ninguno" ||
    (sinDatos && perfil.comprador !== "anonimo" && perfil.comprador !== "identificado")
  ) {
    return ["Comprador", null];
  }
  const identificacion: Nodo =
    perfil.comprador === "extranjero" ? ["IdentificadorExtranjero", rnc] : ["RNCComprador", rnc];
  return ["Comprador", [identificacion, ["RazonSocialComprador", nombre]]];
}

function sumaRetenida(valores: (number | undefined)[]): number | null {
  const definidos = valores.filter((v): v is number => v !== undefined);
  return definidos.length === 0 ? null : redondear2(definidos.reduce((suma, v) => suma + v, 0));
}

function totales(doc: ComprobanteATransmitir, perfil: PerfilEcf): { nodo: Nodo; hayGravado: boolean } {
  const t = calcularTotalesEcf(doc.lineas, perfil.tasaCero);
  const itbisRetenido =
    perfil.retencion === "itbisEIsr" ? sumaRetenida(doc.lineas.map((l) => l.itbisRetenido ?? 0)) : null;
  const isrRetenido = perfil.retencion === "ninguna" ? null : sumaRetenida(doc.lineas.map((l) => l.isrRetenido));
  return {
    hayGravado: t.hayGravado,
    nodo: [
      "Totales",
      [
        ["MontoGravadoTotal", monto(t.montoGravadoTotal)],
        ["MontoGravadoI1", monto(t.montoGravadoI1)],
        ["MontoGravadoI2", monto(t.montoGravadoI2)],
        ["MontoGravadoI3", monto(t.montoGravadoI3)],
        ["MontoExento", monto(t.montoExento)],
        ["ITBIS1", t.montoGravadoI1 === null ? null : "18"],
        ["ITBIS2", t.montoGravadoI2 === null ? null : "16"],
        ["ITBIS3", t.montoGravadoI3 === null ? null : "0"],
        ["TotalITBIS", monto(t.totalItbis)],
        ["TotalITBIS1", monto(t.totalItbis1)],
        ["TotalITBIS2", monto(t.totalItbis2)],
        ["TotalITBIS3", monto(t.totalItbis3)],
        ["MontoTotal", montoDgii(t.montoTotal)],
        ["TotalITBISRetenido", monto(itbisRetenido)],
        ["TotalISRRetencion", monto(isrRetenido)],
      ],
    ],
  };
}

function retencionItem(linea: ComprobanteATransmitir["lineas"][number], perfil: PerfilEcf): Nodo {
  if (perfil.retencion === "ninguna") return ["Retencion", null];
  const itbis = perfil.retencion === "itbisEIsr" ? (linea.itbisRetenido ?? 0) : undefined;
  return [
    "Retencion",
    [
      ["IndicadorAgenteRetencionoPercepcion", "1"],
      ["MontoITBISRetenido", itbis === undefined ? null : montoDgii(itbis)],
      ["MontoISRRetenido", linea.isrRetenido === undefined ? null : montoDgii(linea.isrRetenido)],
    ],
  ];
}

function detalles(doc: ComprobanteATransmitir, perfil: PerfilEcf): Nodo {
  return [
    "DetallesItems",
    doc.lineas.map((linea, i): Nodo => [
      "Item",
      [
        ["NumeroLinea", String(i + 1)],
        ["IndicadorFacturacion", String(indicadorFacturacion(linea, perfil.tasaCero))],
        retencionItem(linea, perfil),
        ["NombreItem", texto(linea.descripcion, 80) ?? "Artículo"],
        ["IndicadorBienoServicio", linea.esServicio ? "2" : "1"],
        ["CantidadItem", montoDgii(linea.cantidad)],
        ["PrecioUnitarioItem", montoDgii(linea.precioUnitario)],
        ["MontoItem", montoDgii(linea.subtotal)],
      ],
    ]),
  ];
}

function informacionReferencia(doc: ComprobanteATransmitir): Nodo {
  const ref = doc.referencia;
  if (!ref) return ["InformacionReferencia", null];
  return [
    "InformacionReferencia",
    [
      ["NCFModificado", ref.ncfModificado],
      ["FechaNCFModificado", fechaDgii(ref.fechaNcfModificado)],
      ["CodigoModificacion", String(ref.codigoModificacion)],
      ["RazonModificacion", texto(ref.razon, 90)],
    ],
  ];
}

export function construirXmlEcf(doc: ComprobanteATransmitir, fechaHoraFirma: Date): string {
  const perfil = perfilDe(doc.tipoEcf);
  validar(doc, perfil);
  const { nodo: nodoTotales, hayGravado } = totales(doc, perfil);
  return documentoXml("ECF", [
    [
      "Encabezado",
      [["Version", "1.0"], idDoc(doc, perfil, hayGravado), emisor(doc), comprador(doc, perfil), nodoTotales],
    ],
    detalles(doc, perfil),
    informacionReferencia(doc),
    ["FechaHoraFirma", fechaHoraDgii(fechaHoraFirma)],
  ]);
}
