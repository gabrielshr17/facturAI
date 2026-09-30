import type { Factura, FacturaLinea, Cliente, Negocio } from "@sfr/core";
import { generarEscPos } from "./escpos.js";
import { svgQr } from "./qr.js";
import { datosComprador, descripcionLinea, encabezadoFiscal } from "./representacion.js";
import {
  hayImpresoraTermicaDisponible,
  obtenerImpresoraSeleccionada,
  imprimirTermico,
  hayImpresionTextoDisponible,
  imprimirTexto,
} from "./termica.js";

/**
 * Impresión del recibo (§7.2, §9, § hardware). Tres mecanismos, en cadena
 * (cada uno cae al siguiente si falla o no está disponible):
 *
 * 1. Térmica ESC/POS directa (escritorio con impresora configurada en
 *    Configuración): bytes crudos vía el Spooler de Windows — silenciosa,
 *    sin diálogo, con corte de papel automático.
 * 2. Texto plano por GDI a cualquier impresora Windows (o la predeterminada)
 *    — escritorio sin térmica configurada: también silenciosa, sin diálogo,
 *    solo que sin el formato/corte de una térmica real.
 * 3. HTML en iframe oculto + `window.print()` — único camino en la PWA (no
 *    hay Tauri ahí para (1)/(2)); diálogo del navegador, imprime/guarda como
 *    PDF. Respaldo final para que un error de hardware nunca bloquee cerrar
 *    la venta.
 */

export interface ComprobanteRecibo {
  ncf: string;
  /** Denominación oficial del tipo (NOMBRE_TIPO_ECF de `@sfr/core`). */
  tipoEcfEtiqueta: string;
  /** Fecha ISO (AAAA-MM-DD); solo en los tipos donde la RI la exige. */
  fechaVencimientoSecuencia?: string | null;
  receptorDocumento?: string | null;
  receptorNombre?: string | null;
  codigoSeguridad?: string | null;
  fechaFirma?: string | null;
  /** URL de consulta del timbre en la DGII: se imprime como código QR. */
  qrUrl?: string | null;
  referencia?: { ncfModificado: string; codigoModificacion: string } | null;
}

export interface ReciboDatos {
  negocio: Pick<Negocio, "nombre_comercial" | "rnc" | "direccion" | "telefono" | "ancho_impresora_default"> &
    Partial<Pick<Negocio, "razon_social">>;
  factura: Pick<
    Factura,
    | "numero_interno"
    | "fecha_hora"
    | "subtotal_gravado"
    | "subtotal_exento"
    | "total_itbis"
    | "total"
    | "monto_pagado"
    | "cambio"
    | "notas"
  >;
  lineas: Pick<
    FacturaLinea,
    "descripcion" | "cantidad" | "precio_unitario" | "subtotal" | "tasa_impuesto" | "monto_itbis"
  >[];
  pagos: { metodo: string; monto: number }[];
  cliente?: Pick<Cliente, "nombre" | "apellidos"> | null;
  /** Presente solo si la venta se emitió con comprobante fiscal (§6). */
  comprobante?: ComprobanteRecibo | null;
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  credito: "Crédito",
  tarjeta: "Tarjeta",
};

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Recorta el ruido de punto flotante de cantidades calculadas (ej. monto/precio en la ventanita de
 *  cantidad específica) antes de imprimirlas — el recibo no debe mostrar "3.3333333333333335". */
function cantidad(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function generarHtmlRecibo(datos: ReciboDatos): string {
  const { negocio, factura, lineas, pagos, cliente, comprobante } = datos;
  const ancho = negocio.ancho_impresora_default === 58 ? "58mm" : "80mm";
  const fecha = new Date(factura.fecha_hora);

  const filasLineas = lineas
    .map(
      (l) => `
      <tr>
        <td colspan="4" class="desc">${escapeHtml(descripcionLinea(l, !!comprobante))}</td>
      </tr>
      <tr>
        <td class="num">${cantidad(l.cantidad)}</td>
        <td class="num">x</td>
        <td class="num">${money(l.precio_unitario)}</td>
        <td class="num total">${money(l.subtotal)}</td>
      </tr>${
        comprobante && l.monto_itbis > 0
          ? `
      <tr><td colspan="4" class="num">ITBIS ${money(l.monto_itbis)}</td></tr>`
          : ""
      }`,
    )
    .join("");

  const filasPagos = pagos
    .map(
      (p) =>
        `<div class="linea"><span>${ETIQUETA_METODO[p.metodo] ?? p.metodo}</span><span>RD$ ${money(p.monto)}</span></div>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${ancho} auto; margin: 2mm; }
  body { font-family: "Courier New", monospace; font-size: 16px; line-height: 1.4; width: ${ancho}; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; text-align: center; }
  .centro { text-align: center; }
  .linea { display: flex; justify-content: space-between; }
  hr { border: none; border-top: 1.5px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td.desc { padding-top: 4px; }
  td.num { text-align: right; }
  td.total { font-weight: bold; }
</style>
</head>
<body>
  <h1>${escapeHtml(negocio.nombre_comercial)}</h1>
  <div class="centro">
    ${comprobante && negocio.razon_social && negocio.razon_social !== negocio.nombre_comercial ? `${escapeHtml(negocio.razon_social)}<br/>` : ""}
    ${negocio.rnc ? `RNC: ${escapeHtml(negocio.rnc)}<br/>` : ""}
    ${negocio.direccion ? `${escapeHtml(negocio.direccion)}<br/>` : ""}
    ${negocio.telefono ? `Tel: ${escapeHtml(negocio.telefono)}` : ""}
  </div>
  <hr/>
  <div class="linea"><span>Ticket #${factura.numero_interno}</span><span>${fecha.toLocaleDateString("es-DO")} ${fecha.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}</span></div>
  ${cliente ? `<div>Cliente: ${escapeHtml(cliente.nombre)} ${escapeHtml(cliente.apellidos ?? "")}</div>` : ""}
  ${
    comprobante
      ? `
  ${encabezadoFiscal(comprobante)
    .map(
      (l, i) =>
        `<div class="centro"${i === 0 ? ' style="font-weight:bold; margin-top:4px;"' : ""}>${escapeHtml(l)}</div>`,
    )
    .join("")}
  ${datosComprador(comprobante)
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("")}
  `
      : ""
  }
  <hr/>
  <table>${filasLineas}</table>
  <hr/>
  <div class="linea"><span>Gravado</span><span>RD$ ${money(factura.subtotal_gravado)}</span></div>
  <div class="linea"><span>Exento</span><span>RD$ ${money(factura.subtotal_exento)}</span></div>
  <div class="linea"><span>ITBIS</span><span>RD$ ${money(factura.total_itbis)}</span></div>
  <div class="linea" style="font-weight:bold; font-size: 20px;"><span>TOTAL</span><span>RD$ ${money(factura.total)}</span></div>
  <hr/>
  ${filasPagos}
  <div class="linea"><span>Pagado</span><span>RD$ ${money(factura.monto_pagado)}</span></div>
  <div class="linea"><span>Cambio</span><span>RD$ ${money(factura.cambio)}</span></div>
  ${factura.notas ? `<hr/><div>Notas: ${escapeHtml(factura.notas)}</div>` : ""}
  ${comprobante ? bloqueTimbreHtml(comprobante) : ""}
  <hr/>
  <div class="centro">¡Gracias por su compra!</div>
</body>
</html>`;
}

function bloqueTimbreHtml(comprobante: ComprobanteRecibo): string {
  const partes: string[] = ["<hr/>"];
  if (comprobante.qrUrl) partes.push(`<div class="centro">${svgQr(comprobante.qrUrl, 30)}</div>`);
  if (comprobante.codigoSeguridad) {
    partes.push(`<div class="centro">Código de seguridad: ${escapeHtml(comprobante.codigoSeguridad)}</div>`);
  }
  if (comprobante.fechaFirma) {
    partes.push(`<div class="centro">Fecha de firma digital: ${escapeHtml(comprobante.fechaFirma)}</div>`);
  }
  return partes.join("\n  ");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const ANCHO_TEXTO = 46;

function columnasTexto(izq: string, der: string): string {
  const espacio = Math.max(1, ANCHO_TEXTO - izq.length - der.length);
  return izq + " ".repeat(espacio) + der;
}

/** Mismo contenido que `generarHtmlRecibo`/`generarEscPos`, como líneas de texto plano (para el camino GDI silencioso). */
function generarTextoRecibo(datos: ReciboDatos): string[] {
  const { negocio, factura, lineas, pagos, cliente, comprobante } = datos;
  const fecha = new Date(factura.fecha_hora);
  const separador = "-".repeat(ANCHO_TEXTO);
  const out: string[] = [];

  out.push(negocio.nombre_comercial);
  if (comprobante && negocio.razon_social && negocio.razon_social !== negocio.nombre_comercial) {
    out.push(negocio.razon_social);
  }
  if (negocio.rnc) out.push(`RNC: ${negocio.rnc}`);
  if (negocio.direccion) out.push(negocio.direccion);
  if (negocio.telefono) out.push(`Tel: ${negocio.telefono}`);
  out.push(separador);

  out.push(
    columnasTexto(
      `Ticket #${factura.numero_interno}`,
      `${fecha.toLocaleDateString("es-DO")} ${fecha.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}`,
    ),
  );
  if (cliente) out.push(`Cliente: ${cliente.nombre} ${cliente.apellidos ?? ""}`.trim());

  if (comprobante) {
    out.push(...encabezadoFiscal(comprobante), ...datosComprador(comprobante));
  }

  out.push(separador);
  for (const l of lineas) {
    out.push(descripcionLinea(l, !!comprobante));
    out.push(columnasTexto(`${cantidad(l.cantidad)} x ${money(l.precio_unitario)}`, money(l.subtotal)));
    if (comprobante && l.monto_itbis > 0) out.push(columnasTexto("", `ITBIS ${money(l.monto_itbis)}`));
  }
  out.push(separador);

  out.push(columnasTexto("Gravado", `RD$ ${money(factura.subtotal_gravado)}`));
  out.push(columnasTexto("Exento", `RD$ ${money(factura.subtotal_exento)}`));
  out.push(columnasTexto("ITBIS", `RD$ ${money(factura.total_itbis)}`));
  out.push(columnasTexto("TOTAL", `RD$ ${money(factura.total)}`));
  out.push(separador);

  for (const p of pagos) out.push(columnasTexto(ETIQUETA_METODO[p.metodo] ?? p.metodo, `RD$ ${money(p.monto)}`));
  out.push(columnasTexto("Pagado", `RD$ ${money(factura.monto_pagado)}`));
  out.push(columnasTexto("Cambio", `RD$ ${money(factura.cambio)}`));

  if (factura.notas) {
    out.push(separador);
    out.push(`Notas: ${factura.notas}`);
  }
  if (comprobante?.codigoSeguridad) {
    out.push(separador);
    out.push(`Código de seguridad: ${comprobante.codigoSeguridad}`);
    if (comprobante.fechaFirma) out.push(`Fecha de firma digital: ${comprobante.fechaFirma}`);
  }
  out.push(separador);
  out.push("¡Gracias por su compra!");
  return out;
}

/** Cadena de impresión (§ hardware): térmica ESC/POS → texto GDI silencioso → diálogo del navegador. */
export function imprimirRecibo(datos: ReciboDatos): void {
  if (hayImpresoraTermicaDisponible() && obtenerImpresoraSeleccionada()) {
    void imprimirTermico(generarEscPos(datos)).catch((e) => {
      console.error("Fallo la impresión térmica, usando el siguiente método disponible:", e);
      imprimirReciboAlternativo(datos);
    });
    return;
  }
  imprimirReciboAlternativo(datos);
}

function imprimirReciboAlternativo(datos: ReciboDatos): void {
  if (hayImpresionTextoDisponible()) {
    void imprimirTexto(generarTextoRecibo(datos)).catch((e) => {
      console.error("Fallo la impresión de texto genérica, usando el diálogo del navegador:", e);
      imprimirReciboNavegador(datos);
    });
    return;
  }
  imprimirReciboNavegador(datos);
}

/** Renderiza el recibo en un iframe oculto y abre el diálogo de impresión del sistema. */
function imprimirReciboNavegador(datos: ReciboDatos): void {
  const html = generarHtmlRecibo(datos);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const limpiar = () => {
    if (iframe.parentNode) document.body.removeChild(iframe);
  };
  iframe.contentWindow?.addEventListener("afterprint", limpiar);
  // Respaldo por si el navegador no dispara afterprint (algunos WebViews).
  setTimeout(limpiar, 10_000);

  // Esperar a que el contenido termine de pintarse antes de imprimir.
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 200);
}
