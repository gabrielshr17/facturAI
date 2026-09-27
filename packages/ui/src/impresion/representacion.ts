import {
  NOMBRE_TIPO_ECF,
  requiereVencimientoEnRepresentacion,
  type ComprobanteFiscal,
  type SecuenciaNcfRepo,
} from "@sfr/core";
import type { ComprobanteRecibo } from "./recibo.js";

/**
 * Reglas de la representación impresa (RI) de un e-CF — Informe Técnico e-CF §18 — compartidas
 * por los cuatro formatos de salida (HTML, texto GDI, ESC/POS y PDF).
 */

/** "AAAA-MM-DD" → "DD-MM-AAAA" sin pasar por `Date` (evita el corrimiento de zona horaria). */
function fechaDgiiDesdeIso(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split("-");
  return `${dia}-${mes}-${anio}`;
}

/** Encabezado fiscal (lado derecho en la RI): tipo en palabras, e-NCF y vencimiento de la secuencia. */
export function encabezadoFiscal(comprobante: ComprobanteRecibo): string[] {
  return [
    comprobante.tipoEcfEtiqueta,
    `e-NCF: ${comprobante.ncf}`,
    comprobante.fechaVencimientoSecuencia
      ? `Válido hasta: ${fechaDgiiDesdeIso(comprobante.fechaVencimientoSecuencia)}`
      : null,
  ].filter((l): l is string => l !== null);
}

/** Datos del comprador (parte inferior izquierda del encabezado): razón social y RNC/cédula si aplica. */
export function datosComprador(comprobante: ComprobanteRecibo): string[] {
  return [
    comprobante.receptorNombre ? `Razón social comprador: ${comprobante.receptorNombre}` : null,
    comprobante.receptorDocumento ? `RNC comprador: ${comprobante.receptorDocumento}` : null,
  ].filter((l): l is string => l !== null);
}

/** En la RI se antepone "E" a la descripción de cada bien o servicio exento (Decreto 254-06, art. 8). */
export function descripcionLinea(linea: { descripcion: string; tasa_impuesto: number }, fiscal: boolean): string {
  return fiscal && linea.tasa_impuesto === 0 ? `E ${linea.descripcion}` : linea.descripcion;
}

/** Datos de la RI a partir del comprobante guardado (venta nueva o reimpresión). */
export async function comprobanteParaRecibo(
  comprobante: ComprobanteFiscal,
  secuencias: Pick<SecuenciaNcfRepo, "obtener">,
): Promise<ComprobanteRecibo> {
  const secuencia = requiereVencimientoEnRepresentacion(comprobante.tipo_ecf)
    ? await secuencias.obtener(comprobante.secuencia_id)
    : undefined;
  return {
    ncf: comprobante.ncf,
    tipoEcfEtiqueta: NOMBRE_TIPO_ECF[comprobante.tipo_ecf],
    fechaVencimientoSecuencia: secuencia?.vencimiento ?? null,
    receptorDocumento: comprobante.receptor_documento_numero,
    receptorNombre: comprobante.receptor_nombre,
    codigoSeguridad: comprobante.codigo_seguridad,
    fechaFirma: comprobante.fecha_firma,
    qrUrl: comprobante.qr_url,
  };
}
