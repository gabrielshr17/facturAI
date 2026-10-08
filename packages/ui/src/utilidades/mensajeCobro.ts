import type { ComprobanteFiscal } from "@sfr/core";

const TEXTO_ESTADO: Record<ComprobanteFiscal["estado_dgii"], string> = {
  aceptado: "aceptado por la DGII",
  aceptado_condicional: "aceptado condicional por la DGII",
  pendiente: "en proceso: la DGII aún lo valida (consulta su estado en Facturas)",
  rechazado: "rechazado por la DGII",
  contingencia: "en contingencia",
};

export function mensajeCobroFiscal(comprobante: Pick<ComprobanteFiscal, "ncf" | "estado_dgii" | "total">): string {
  return `Comprobante ${comprobante.ncf} emitido por RD$ ${comprobante.total.toFixed(2)}: ${TEXTO_ESTADO[comprobante.estado_dgii]}.`;
}
