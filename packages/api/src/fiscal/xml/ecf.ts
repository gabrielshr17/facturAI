import type { ComprobanteATransmitir, MetodoPago, PagoATransmitir } from "@sfr/core";
import { fechaDgii, fechaHoraDgii, montoDgii } from "../formato.js";
import { DocumentoFiscalInvalidoError } from "../errores.js";
import { documentoXml, texto, type Nodo } from "./nodo.js";
import { calcularTotalesEcf, indicadorFacturacion } from "./totales.js";

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

function validar(doc: ComprobanteATransmitir): void {
  if (doc.lineas.length === 0) throw new DocumentoFiscalInvalidoError("El comprobante no tiene líneas.");
  if (doc.lineas.length > 1000) throw new DocumentoFiscalInvalidoError("La DGII admite como máximo 1000 líneas.");
  if (!texto(doc.emisor.rnc) || !texto(doc.emisor.razonSocial) || !texto(doc.emisor.direccion)) {
    throw new DocumentoFiscalInvalidoError("Faltan datos del emisor (RNC, razón social o dirección).");
  }
  if (doc.tipoEcf === "31") {
    if (!texto(doc.receptorDocumentoNumero) || !texto(doc.receptorNombre)) {
      throw new DocumentoFiscalInvalidoError("El E31 requiere RNC y razón social del comprador.");
    }
    if (!doc.fechaVencimientoSecuencia) {
      throw new DocumentoFiscalInvalidoError("El E31 requiere la fecha de vencimiento de la secuencia.");
    }
  }
  if (doc.tipoEcf === "32" && !esConsumoResumible(doc) && !texto(doc.receptorDocumentoNumero)) {
    throw new DocumentoFiscalInvalidoError(
      "Una factura de consumo de RD$250,000.00 o más requiere el RNC o cédula del comprador.",
    );
  }
  if ((doc.tipoEcf === "33" || doc.tipoEcf === "34") && !doc.referencia) {
    throw new DocumentoFiscalInvalidoError(
      "Las notas de crédito y débito requieren la referencia al comprobante modificado.",
    );
  }
}

function idDoc(doc: ComprobanteATransmitir, hayGravado: boolean): Nodo {
  const esNota = doc.tipoEcf === "33" || doc.tipoEcf === "34";
  return [
    "IdDoc",
    [
      ["TipoeCF", doc.tipoEcf],
      ["eNCF", doc.ncf],
      ["IndicadorNotaCredito", doc.tipoEcf === "34" ? indicadorNotaCredito(doc) : null],
      [
        "FechaVencimientoSecuencia",
        doc.tipoEcf === "31" && doc.fechaVencimientoSecuencia
          ? fechaDgii(`${doc.fechaVencimientoSecuencia}T12:00:00Z`)
          : null,
      ],
      ["IndicadorMontoGravado", hayGravado ? "1" : null],
      ["TipoIngresos", "01"],
      ["TipoPago", tipoPago(doc.pagos)],
      esNota ? ["TablaFormasPago", null] : tablaFormasPago(doc.pagos),
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

function comprador(doc: ComprobanteATransmitir): Nodo {
  return [
    "Comprador",
    [
      ["RNCComprador", texto(doc.receptorDocumentoNumero)],
      ["RazonSocialComprador", texto(doc.receptorNombre, 150)],
    ],
  ];
}

function totales(doc: ComprobanteATransmitir): { nodo: Nodo; hayGravado: boolean } {
  const t = calcularTotalesEcf(doc.lineas);
  return {
    hayGravado: t.hayGravado,
    nodo: [
      "Totales",
      [
        ["MontoGravadoTotal", monto(t.montoGravadoTotal)],
        ["MontoGravadoI1", monto(t.montoGravadoI1)],
        ["MontoGravadoI2", monto(t.montoGravadoI2)],
        ["MontoExento", monto(t.montoExento)],
        ["ITBIS1", t.montoGravadoI1 === null ? null : "18"],
        ["ITBIS2", t.montoGravadoI2 === null ? null : "16"],
        ["TotalITBIS", monto(t.totalItbis)],
        ["TotalITBIS1", monto(t.totalItbis1)],
        ["TotalITBIS2", monto(t.totalItbis2)],
        ["MontoTotal", montoDgii(t.montoTotal)],
      ],
    ],
  };
}

function detalles(doc: ComprobanteATransmitir): Nodo {
  return [
    "DetallesItems",
    doc.lineas.map((linea, i): Nodo => [
      "Item",
      [
        ["NumeroLinea", String(i + 1)],
        ["IndicadorFacturacion", String(indicadorFacturacion(linea))],
        ["NombreItem", texto(linea.descripcion, 80) ?? "Artículo"],
        ["IndicadorBienoServicio", "1"],
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
  validar(doc);
  const { nodo: nodoTotales, hayGravado } = totales(doc);
  return documentoXml("ECF", [
    ["Encabezado", [["Version", "1.0"], idDoc(doc, hayGravado), emisor(doc), comprador(doc), nodoTotales]],
    detalles(doc),
    informacionReferencia(doc),
    ["FechaHoraFirma", fechaHoraDgii(fechaHoraFirma)],
  ]);
}
