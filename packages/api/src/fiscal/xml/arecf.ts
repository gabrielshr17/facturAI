import { fechaHoraDgii } from "../formato.js";
import { DocumentoFiscalInvalidoError } from "../errores.js";
import { documentoXml } from "./nodo.js";

/** DGII: 1 error de especificación, 2 error de firma digital, 3 envío duplicado, 4 RNC comprador no corresponde. */
export type MotivoNoRecibido = 1 | 2 | 3 | 4;

export interface DatosAcuseRecibo {
  rncEmisor: string;
  rncComprador: string;
  encf: string;
  recibido: boolean;
  motivo?: MotivoNoRecibido;
}

export function construirXmlArecf(datos: DatosAcuseRecibo, fechaHora: Date): string {
  if (!datos.recibido && !datos.motivo) {
    throw new DocumentoFiscalInvalidoError("Un acuse de e-CF no recibido requiere el código de motivo.");
  }
  return documentoXml("ARECF", [
    [
      "DetalleAcusedeRecibo",
      [
        ["Version", "1.0"],
        ["RNCEmisor", datos.rncEmisor],
        ["RNCComprador", datos.rncComprador],
        ["eNCF", datos.encf],
        ["Estado", datos.recibido ? "0" : "1"],
        ["CodigoMotivoNoRecibido", datos.recibido ? null : String(datos.motivo)],
        ["FechaHoraAcuseRecibo", fechaHoraDgii(fechaHora)],
      ],
    ],
  ]);
}
