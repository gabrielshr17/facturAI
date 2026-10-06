import type { ComprobanteATransmitir, MetodoPago } from "@sfr/core";
import { fechaDgii, montoDgii } from "../formato.js";
import { DocumentoFiscalInvalidoError } from "../errores.js";
import { documentoXml, texto, type Nodo } from "./nodo.js";
import { calcularTotalesEcf } from "./totales.js";

const FORMA_PAGO_DGII: Record<MetodoPago, string> = {
  efectivo: "1",
  transferencia: "2",
  tarjeta: "3",
  credito: "4",
};

function monto(valor: number | null): string | null {
  return valor === null ? null : montoDgii(valor);
}

export function construirXmlRfce(doc: ComprobanteATransmitir, codigoSeguridadEcf: string): string {
  if (doc.tipoEcf !== "32") {
    throw new DocumentoFiscalInvalidoError("El resumen de factura de consumo (RFCE) solo aplica a E32.");
  }
  const t = calcularTotalesEcf(doc.lineas);
  const pagos = doc.pagos.filter((p) => p.monto > 0).slice(0, 7);

  return documentoXml("RFCE", [
    [
      "Encabezado",
      [
        ["Version", "1.0"],
        [
          "IdDoc",
          [
            ["TipoeCF", doc.tipoEcf],
            ["eNCF", doc.ncf],
            ["TipoIngresos", "01"],
            ["TipoPago", doc.pagos.some((p) => p.metodo === "credito") ? "2" : "1"],
            [
              "TablaFormasPago",
              pagos.map((p): Nodo => [
                "FormaDePago",
                [
                  ["FormaPago", FORMA_PAGO_DGII[p.metodo]],
                  ["MontoPago", montoDgii(p.monto)],
                ],
              ]),
            ],
          ],
        ],
        [
          "Emisor",
          [
            ["RNCEmisor", doc.emisor.rnc],
            ["RazonSocialEmisor", texto(doc.emisor.razonSocial, 150)],
            ["FechaEmision", fechaDgii(doc.fechaEmision)],
          ],
        ],
        [
          "Comprador",
          [
            ["RNCComprador", texto(doc.receptorDocumentoNumero)],
            ["RazonSocialComprador", texto(doc.receptorNombre, 150)],
          ],
        ],
        [
          "Totales",
          [
            ["MontoGravadoTotal", monto(t.montoGravadoTotal)],
            ["MontoGravadoI1", monto(t.montoGravadoI1)],
            ["MontoGravadoI2", monto(t.montoGravadoI2)],
            ["MontoExento", monto(t.montoExento)],
            ["TotalITBIS", monto(t.totalItbis)],
            ["TotalITBIS1", monto(t.totalItbis1)],
            ["TotalITBIS2", monto(t.totalItbis2)],
            ["MontoTotal", montoDgii(t.montoTotal)],
          ],
        ],
        ["CodigoSeguridadeCF", codigoSeguridadEcf],
      ],
    ],
  ]);
}
