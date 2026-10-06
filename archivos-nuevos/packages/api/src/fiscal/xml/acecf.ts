import { fechaHoraDgii, montoDgii } from "../formato.js";
import { DocumentoFiscalInvalidoError } from "../errores.js";
import { documentoXml, texto } from "./nodo.js";

export interface DatosAprobacionComercial {
  rncEmisor: string;
  encf: string;
  /** Fecha de emisión del e-CF aprobado, en formato DGII (dd-MM-AAAA), tal como viene en su XML. */
  fechaEmision: string;
  montoTotal: number;
  rncComprador: string;
  aprobado: boolean;
  motivoRechazo?: string | null;
}

export function construirXmlAcecf(datos: DatosAprobacionComercial, fechaHora: Date): string {
  const motivo = texto(datos.motivoRechazo, 250);
  if (!datos.aprobado && !motivo) {
    throw new DocumentoFiscalInvalidoError("Un rechazo comercial requiere el motivo.");
  }
  return documentoXml("ACECF", [
    [
      "DetalleAprobacionComercial",
      [
        ["Version", "1.0"],
        ["RNCEmisor", datos.rncEmisor],
        ["eNCF", datos.encf],
        ["FechaEmision", datos.fechaEmision],
        ["MontoTotal", montoDgii(datos.montoTotal)],
        ["RNCComprador", datos.rncComprador],
        ["Estado", datos.aprobado ? "1" : "2"],
        ["DetalleMotivoRechazo", datos.aprobado ? null : motivo],
        ["FechaHoraAprobacionComercial", fechaHoraDgii(fechaHora)],
      ],
    ],
  ]);
}
