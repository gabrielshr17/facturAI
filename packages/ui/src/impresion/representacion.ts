import {
  DESCRIPCION_CODIGO_MODIFICACION,
  NOMBRE_TIPO_ECF,
  requiereVencimientoEnRepresentacion,
  type Cliente,
  type ComprobanteFiscal,
  type Factura,
  type SecuenciaNcfRepo,
} from "@sfr/core";
import type { ComprobanteRecibo, ReciboDatos } from "./recibo.js";

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
    comprobante.referencia ? `e-NCF modificado: ${comprobante.referencia.ncfModificado}` : null,
    comprobante.referencia ? `Código de modificación: ${comprobante.referencia.codigoModificacion}` : null,
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

type CodigoModificacion = keyof typeof DESCRIPCION_CODIGO_MODIFICACION;

/** El comprobante guarda su XML firmado; de ahí sale lo que la nota modifica (no hay columnas para ello). */
function referenciaDesdeXml(xml: string | null): ComprobanteRecibo["referencia"] {
  const ncfModificado = xml?.match(/<NCFModificado>([^<]+)<\/NCFModificado>/)?.[1];
  const codigo = Number(xml?.match(/<CodigoModificacion>(\d)<\/CodigoModificacion>/)?.[1]);
  const descripcion = DESCRIPCION_CODIGO_MODIFICACION[codigo as CodigoModificacion];
  return ncfModificado && descripcion ? { ncfModificado, codigoModificacion: descripcion } : null;
}

export function lineasDireccionEmisor(negocio: {
  direccion?: string | null;
  municipio?: string | null;
  provincia?: string | null;
}): string[] {
  return [
    negocio.direccion,
    negocio.municipio ? `Municipio: ${negocio.municipio}` : null,
    negocio.provincia ? `Provincia: ${negocio.provincia}` : null,
  ].filter((l): l is string => !!l);
}

/** Datos de la RI a partir del comprobante guardado (venta nueva o reimpresión). */
export async function comprobanteParaRecibo(
  comprobante: ComprobanteFiscal,
  secuencias: Pick<SecuenciaNcfRepo, "obtener">,
): Promise<ComprobanteRecibo> {
  const secuencia = requiereVencimientoEnRepresentacion(comprobante.tipo_ecf)
    ? await secuencias.obtener(comprobante.secuencia_id)
    : undefined;
  const esNota = comprobante.tipo_ecf === "33" || comprobante.tipo_ecf === "34";
  return {
    ncf: comprobante.ncf,
    tipoEcfEtiqueta: NOMBRE_TIPO_ECF[comprobante.tipo_ecf],
    fechaVencimientoSecuencia: secuencia?.vencimiento ?? null,
    receptorDocumento: comprobante.receptor_documento_numero,
    receptorNombre: comprobante.receptor_nombre,
    codigoSeguridad: comprobante.codigo_seguridad,
    fechaFirma: comprobante.fecha_firma,
    qrUrl: comprobante.qr_url,
    referencia: esNota ? referenciaDesdeXml(comprobante.xml_firmado) : null,
  };
}

export interface DatosNotaDebito {
  nota: ComprobanteFiscal;
  factura: Pick<Factura, "numero_interno">;
  cliente: Pick<Cliente, "nombre" | "apellidos"> | null;
  negocio: ReciboDatos["negocio"];
  concepto: string;
  tasaImpuesto: number;
  secuencias: Pick<SecuenciaNcfRepo, "obtener">;
}

export async function datosReciboNotaDebito(datos: DatosNotaDebito): Promise<ReciboDatos> {
  const { nota } = datos;
  return {
    negocio: datos.negocio,
    factura: {
      numero_interno: datos.factura.numero_interno,
      fecha_hora: nota.fecha_emision,
      subtotal_gravado: nota.monto_gravado,
      subtotal_exento: nota.monto_exento,
      total_itbis: nota.monto_itbis,
      total: nota.total,
      monto_pagado: 0,
      cambio: 0,
      notas: null,
    },
    lineas: [
      {
        descripcion: datos.concepto,
        cantidad: 1,
        precio_unitario: nota.total,
        subtotal: nota.total,
        tasa_impuesto: datos.tasaImpuesto,
        monto_itbis: nota.monto_itbis,
      },
    ],
    pagos: [],
    cliente: datos.cliente,
    comprobante: await comprobanteParaRecibo(nota, datos.secuencias),
  };
}
