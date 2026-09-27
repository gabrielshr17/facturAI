import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ComprobanteRecibo, ReciboDatos } from "./recibo.js";
import { datosComprador, descripcionLinea, encabezadoFiscal } from "./representacion.js";
import { modulosQr } from "./qr.js";

/**
 * PDF real (no el diálogo "Guardar como PDF" del navegador — un archivo .pdf
 * generado con jsPDF) para dos casos: el recibo de una venta cobrada (§ Cobrar,
 * botón "Cobrar y guardar PDF") y una cotización (§ Ventas, botón "Cotización").
 * Un solo layout interno (`construirPdf`) alimentado por dos formas de datos
 * distintas — la de recibo reutiliza `ReciboDatos` tal cual (mismo shape que
 * ya usan `recibo.ts`/`escpos.ts`), la de cotización es la suya propia porque
 * no tiene pagos ni comprobante fiscal, pero sí fecha de vencimiento.
 */

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Recorta el ruido de punto flotante antes de mostrar una cantidad (§ recibo.ts). */
function cantidad(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" sin pasar por `Date` — un `new Date("AAAA-MM-DD")` se interpreta
 *  como medianoche UTC, y con timezones detrás de UTC (toda América) `toLocaleDateString` muestra
 *  un día antes del que en verdad es (§ mismo bug evitado en ConsultaCotizaciones.tsx). */
function formatearFechaIso(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-");
  return `${dia}/${mes}/${anio}`;
}

interface NegocioPdf {
  nombre_comercial: string;
  razon_social?: string | null;
  rnc: string | null;
  direccion: string | null;
  telefono: string | null;
}

interface DocumentoPdfDatos {
  titulo: string;
  numero: number;
  fecha: string;
  negocio: NegocioPdf;
  cliente?: { nombre: string; apellidos: string | null } | null;
  lineas: {
    descripcion: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    tasa_impuesto?: number;
    monto_itbis?: number;
  }[];
  subtotalGravado: number;
  subtotalExento: number;
  totalItbis: number;
  total: number;
  comprobante?: ComprobanteRecibo | null;
  pagos?: { metodo: string; monto: number }[];
  montoPagado?: number;
  cambio?: number;
  notas?: string | null;
  piePagina?: string | null;
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  credito: "Crédito",
  tarjeta: "Tarjeta",
};

function construirPdf(datos: DocumentoPdfDatos): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const anchoPagina = doc.internal.pageSize.getWidth();
  const margen = 18;
  const derecha = anchoPagina - margen;
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(datos.negocio.nombre_comercial, margen, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  const lineasNegocio = [
    datos.comprobante && datos.negocio.razon_social && datos.negocio.razon_social !== datos.negocio.nombre_comercial
      ? datos.negocio.razon_social
      : null,
    datos.negocio.rnc ? `RNC: ${datos.negocio.rnc}` : null,
    datos.negocio.direccion,
    datos.negocio.telefono ? `Tel: ${datos.negocio.telefono}` : null,
  ].filter((l): l is string => !!l);
  for (const l of lineasNegocio) {
    y += 5;
    doc.text(l, margen, y);
  }

  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(datos.titulo, derecha, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const fecha = new Date(datos.fecha);
  const lineasDerecha = [
    ...(datos.comprobante ? encabezadoFiscal(datos.comprobante).slice(1) : []),
    `No. ${datos.numero}`,
    `Fecha de emisión: ${fecha.toLocaleDateString("es-DO")}`,
  ];
  lineasDerecha.forEach((l, i) => doc.text(l, derecha, 27 + i * 5, { align: "right" }));

  y = Math.max(y, 27 + (lineasDerecha.length - 1) * 5) + 8;

  if (datos.comprobante) {
    const comprador = datosComprador(datos.comprobante);
    if (comprador.length > 0) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      comprador.forEach((l, i) => doc.text(l, margen, y + i * 5));
      y += comprador.length * 5 + 4;
    }
  }

  if (datos.cliente) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Cliente", margen, y);
    doc.setFont("helvetica", "normal");
    doc.text(`${datos.cliente.nombre} ${datos.cliente.apellidos ?? ""}`.trim(), margen, y + 5);
    y += 12;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [
      datos.comprobante
        ? ["Descripción", "Cant.", "Precio unit.", "ITBIS", "Valor"]
        : ["Descripción", "Cant.", "Precio unit.", "Subtotal"],
    ],
    body: datos.lineas.map((l) => {
      const descripcion = descripcionLinea(
        { descripcion: l.descripcion, tasa_impuesto: l.tasa_impuesto ?? 0.18 },
        !!datos.comprobante,
      );
      const base = [descripcion, cantidad(l.cantidad), `RD$ ${money(l.precio_unitario)}`];
      return datos.comprobante
        ? [...base, l.monto_itbis ? `RD$ ${money(l.monto_itbis)}` : "", `RD$ ${money(l.subtotal)}`]
        : [...base, `RD$ ${money(l.subtotal)}`];
    }),
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [30, 30, 30], textColor: 255 },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  const filaTotal = (etiqueta: string, valor: string, negrita = false) => {
    doc.setFont("helvetica", negrita ? "bold" : "normal");
    doc.setFontSize(negrita ? 12 : 10);
    doc.text(etiqueta, derecha - 45, y, { align: "right" });
    doc.text(valor, derecha, y, { align: "right" });
    y += negrita ? 7 : 5.5;
  };
  filaTotal("Gravado", `RD$ ${money(datos.subtotalGravado)}`);
  filaTotal("Exento", `RD$ ${money(datos.subtotalExento)}`);
  filaTotal("ITBIS", `RD$ ${money(datos.totalItbis)}`);
  filaTotal("TOTAL", `RD$ ${money(datos.total)}`, true);

  if (datos.pagos && datos.pagos.length > 0) {
    y += 3;
    for (const p of datos.pagos) filaTotal(ETIQUETA_METODO[p.metodo] ?? p.metodo, `RD$ ${money(p.monto)}`);
    if (datos.montoPagado != null) filaTotal("Pagado", `RD$ ${money(datos.montoPagado)}`);
    if (datos.cambio != null) filaTotal("Cambio", `RD$ ${money(datos.cambio)}`);
  }

  if (datos.notas) {
    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Notas: ${datos.notas}`, margen, y, { maxWidth: derecha - margen });
    y += 8;
  }

  if (datos.comprobante?.qrUrl) {
    y = dibujarTimbre(doc, datos.comprobante, Math.max(margen, DISTANCIA_MINIMA_QR_BORDE_MM), y + 6);
  }

  if (datos.piePagina) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(datos.piePagina, margen, doc.internal.pageSize.getHeight() - 14, { maxWidth: derecha - margen });
  }

  return doc;
}

const LADO_QR_MM = 30;
/** Informe Técnico e-CF §18.2.3: el QR empieza a 2 cm o más del borde, lado inferior izquierdo. */
const DISTANCIA_MINIMA_QR_BORDE_MM = 20;

function dibujarTimbre(
  doc: jsPDF,
  comprobante: { codigoSeguridad?: string | null; fechaFirma?: string | null; qrUrl?: string | null },
  x: number,
  yInicial: number,
): number {
  const modulos = modulosQr(comprobante.qrUrl!);
  const lado = LADO_QR_MM / modulos.length;
  let y = yInicial;
  if (y + LADO_QR_MM > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    y = 20;
  }
  doc.setFillColor(0, 0, 0);
  modulos.forEach((fila, f) =>
    fila.forEach((oscuro, c) => {
      if (oscuro) doc.rect(x + c * lado, y + f * lado, lado, lado, "F");
    }),
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(0);
  const textoX = x + LADO_QR_MM + 5;
  if (comprobante.codigoSeguridad) doc.text(`Código de seguridad: ${comprobante.codigoSeguridad}`, textoX, y + 10);
  if (comprobante.fechaFirma) doc.text(`Fecha de firma digital: ${comprobante.fechaFirma}`, textoX, y + 16);
  return y + LADO_QR_MM + 4;
}

/** PDF del recibo de una venta cobrada (§ Cobrar) — mismo shape de datos que `imprimirRecibo`. */
export function generarPdfRecibo(datos: ReciboDatos): jsPDF {
  return construirPdf({
    titulo: datos.comprobante ? datos.comprobante.tipoEcfEtiqueta : "FACTURA",
    numero: datos.factura.numero_interno,
    fecha: datos.factura.fecha_hora,
    negocio: datos.negocio,
    cliente: datos.cliente,
    lineas: datos.lineas,
    subtotalGravado: datos.factura.subtotal_gravado,
    subtotalExento: datos.factura.subtotal_exento,
    totalItbis: datos.factura.total_itbis,
    total: datos.factura.total,
    comprobante: datos.comprobante ?? null,
    pagos: datos.pagos,
    montoPagado: datos.factura.monto_pagado,
    cambio: datos.factura.cambio,
    notas: datos.factura.notas,
  });
}

export interface CotizacionPdfDatos {
  negocio: NegocioPdf;
  numero: number;
  fecha: string;
  fechaVencimiento: string;
  cliente?: { nombre: string; apellidos: string | null } | null;
  lineas: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[];
  subtotalGravado: number;
  subtotalExento: number;
  totalItbis: number;
  total: number;
  notas?: string | null;
}

/** PDF de una cotización (§ Ventas, botón "Cotización") — sin pagos, sin comprobante fiscal. */
export function generarPdfCotizacion(datos: CotizacionPdfDatos): jsPDF {
  const vencimiento = formatearFechaIso(datos.fechaVencimiento);
  return construirPdf({
    titulo: "COTIZACIÓN",
    numero: datos.numero,
    fecha: datos.fecha,
    negocio: datos.negocio,
    cliente: datos.cliente,
    lineas: datos.lineas,
    subtotalGravado: datos.subtotalGravado,
    subtotalExento: datos.subtotalExento,
    totalItbis: datos.totalItbis,
    total: datos.total,
    notas: datos.notas,
    piePagina: `Cotización válida hasta el ${vencimiento}. No es una factura ni un comprobante fiscal.`,
  });
}

/** Descarga el PDF ya construido con el nombre dado (debe terminar en .pdf). */
export function guardarPdf(doc: jsPDF, nombreArchivo: string): void {
  doc.save(nombreArchivo);
}
