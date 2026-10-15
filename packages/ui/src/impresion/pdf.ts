import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ComprobanteRecibo, ReciboDatos } from "./recibo.js";
import { datosComprador, descripcionLinea, encabezadoFiscal, lineasDireccionEmisor } from "./representacion.js";
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
  municipio?: string | null;
  provincia?: string | null;
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
  if (datos.comprobante) return construirPdfFiscal(datos, datos.comprobante);
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
    datos.negocio.rnc ? `RNC: ${datos.negocio.rnc}` : null,
    ...lineasDireccionEmisor(datos.negocio),
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
  const lineasDerecha = [`No. ${datos.numero}`, `Fecha de emisión: ${fecha.toLocaleDateString("es-DO")}`];
  lineasDerecha.forEach((l, i) => doc.text(l, derecha, 27 + i * 5, { align: "right" }));

  y = Math.max(y, 27 + (lineasDerecha.length - 1) * 5) + 8;

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
    head: [["Descripción", "Cant.", "Precio unit.", "Subtotal"]],
    body: datos.lineas.map((l) => {
      return [l.descripcion, cantidad(l.cantidad), `RD$ ${money(l.precio_unitario)}`, `RD$ ${money(l.subtotal)}`];
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

  if (datos.piePagina) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(datos.piePagina, margen, doc.internal.pageSize.getHeight() - 14, { maxWidth: derecha - margen });
  }

  return doc;
}

const LADO_QR_MM = 30;
const DISTANCIA_MINIMA_QR_BORDE_MM = 20;
const AZUL_TITULO: [number, number, number] = [31, 78, 121];
const AZUL_LINEA: [number, number, number] = [91, 155, 213];
const GRIS_CAJA: [number, number, number] = [242, 242, 242];
const GRIS_BORDE: [number, number, number] = [150, 150, 150];

function fechaDgii(fechaIso: string): string {
  const f = new Date(fechaIso);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${dos(f.getDate())}-${dos(f.getMonth() + 1)}-${f.getFullYear()}`;
}

function textoConRotulo(doc: jsPDF, rotulo: string, valor: string, x: number, y: number): void {
  doc.setFont("helvetica", "bold");
  doc.text(rotulo, x, y);
  const ancho = doc.getTextWidth(rotulo);
  doc.setFont("helvetica", "normal");
  doc.text(valor, x + ancho, y);
}

function construirPdfFiscal(datos: DocumentoPdfDatos, comprobante: ComprobanteRecibo): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const margen = 18;
  const derecha = doc.internal.pageSize.getWidth() - margen;
  const altoPagina = doc.internal.pageSize.getHeight();
  const { negocio } = datos;

  const linea = (y: number) => {
    doc.setDrawColor(...AZUL_LINEA);
    doc.setLineWidth(0.4);
    doc.line(margen, y, derecha, y);
  };

  let y = 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...AZUL_TITULO);
  doc.text(negocio.nombre_comercial, margen, y);
  doc.text(comprobante.tipoEcfEtiqueta, derecha, y, { align: "right" });

  doc.setTextColor(0);
  doc.setFontSize(9.5);
  const derechaLineas = encabezadoFiscal(comprobante).slice(1);
  derechaLineas.forEach((l, i) => doc.text(l, derecha, y + 6 + i * 5, { align: "right" }));

  const direccion = lineasDireccionEmisor(negocio).join(", ");
  const izquierda: [string, string][] = [];
  if (negocio.razon_social && negocio.razon_social !== negocio.nombre_comercial) {
    izquierda.push(["", negocio.razon_social]);
  }
  if (negocio.rnc) izquierda.push(["", `RNC ${negocio.rnc}`]);
  if (direccion) izquierda.push(["Dirección: ", direccion]);
  izquierda.push(["Fecha Emisión: ", fechaDgii(datos.fecha)]);
  izquierda.forEach(([rotulo, valor], i) => textoConRotulo(doc, rotulo, valor, margen, y + 6 + i * 5));
  y += 6 + Math.max(izquierda.length, derechaLineas.length) * 5;

  linea(y);
  y += 7;
  const comprador = datosComprador(comprobante);
  doc.setFontSize(10);
  for (const l of comprador) {
    const corte = l.indexOf(": ") + 2;
    textoConRotulo(doc, l.slice(0, corte), l.slice(corte), margen, y);
    y += 5.5;
  }
  if (comprador.length > 0) {
    y += 1;
    linea(y);
    y += 5;
  }

  autoTable(doc, {
    startY: y,
    margin: { left: margen, right: margen },
    head: [["Cantidad", "Descripción", "Unidad de Medida", "Precio", "ITBIS", "Valor"]],
    body: datos.lineas.map((l) => [
      cantidad(l.cantidad),
      descripcionLinea({ descripcion: l.descripcion, tasa_impuesto: l.tasa_impuesto ?? 0.18 }, true),
      "UND",
      money(l.precio_unitario),
      l.monto_itbis ? money(l.monto_itbis) : "",
      money(l.subtotal),
    ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2, lineColor: GRIS_BORDE, textColor: 0 },
    headStyles: { fillColor: [217, 217, 217], textColor: 0, halign: "center", fontStyle: "bold" },
    columnStyles: {
      0: { halign: "center", cellWidth: 20 },
      2: { halign: "center", cellWidth: 24 },
      3: { halign: "right", cellWidth: 26 },
      4: { halign: "right", cellWidth: 26 },
      5: { halign: "right", cellWidth: 28, fillColor: GRIS_CAJA },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 6;
  const totales: [string, number][] = [["Subtotal Gravado:", datos.subtotalGravado]];
  if (datos.subtotalExento > 0) totales.push(["Subtotal Exento:", datos.subtotalExento]);
  totales.push(["Total ITBIS:", datos.totalItbis], ["Total:", datos.total]);

  if (y + Math.max(LADO_QR_MM + 12, totales.length * 6 + 4) > altoPagina - 20) {
    doc.addPage();
    y = 20;
  }
  linea(y);
  y += 5;

  const xQr = Math.max(margen, DISTANCIA_MINIMA_QR_BORDE_MM);
  if (comprobante.qrUrl) {
    const modulos = modulosQr(comprobante.qrUrl);
    const lado = LADO_QR_MM / modulos.length;
    doc.setFillColor(0, 0, 0);
    modulos.forEach((fila, f) =>
      fila.forEach((oscuro, c) => {
        if (oscuro) doc.rect(xQr + c * lado, y + f * lado, lado, lado, "F");
      }),
    );
  }
  doc.setFont("times", "normal");
  doc.setFontSize(8.5);
  if (comprobante.codigoSeguridad) {
    doc.text(`Código de Seguridad: ${comprobante.codigoSeguridad}`, xQr, y + LADO_QR_MM + 4);
  }
  if (comprobante.fechaFirma) doc.text(`Fecha Firma: ${comprobante.fechaFirma}`, xQr, y + LADO_QR_MM + 8);

  const anchoCaja = 34;
  totales.forEach(([rotulo, valor], i) => {
    const yt = y + i * 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(0);
    doc.text(rotulo, derecha - anchoCaja - 2, yt + 4, { align: "right" });
    doc.setFillColor(...GRIS_CAJA);
    doc.setDrawColor(...GRIS_BORDE);
    doc.rect(derecha - anchoCaja, yt, anchoCaja, 6, "FD");
    doc.setFont("helvetica", "normal");
    doc.text(money(valor), derecha - 2, yt + 4, { align: "right" });
  });

  return doc;
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
