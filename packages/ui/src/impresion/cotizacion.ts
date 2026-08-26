import type { Cliente, Negocio } from "@sfr/core";
import { generarEscPosCotizacion } from "./escpos.js";
import {
  hayImpresoraTermicaDisponible,
  obtenerImpresoraSeleccionada,
  imprimirTermico,
  hayImpresionTextoDisponible,
  imprimirTexto,
} from "./termica.js";

/** Impresión de cotizaciones: misma cadena de tres mecanismos que `recibo.ts` (térmica ESC/POS →
 *  texto GDI → diálogo del navegador). A diferencia del recibo, no tiene pagos ni comprobante
 *  fiscal, pero sí fecha de vencimiento. */
export interface CotizacionImpresionDatos {
  negocio: Pick<Negocio, "nombre_comercial" | "rnc" | "direccion" | "telefono" | "ancho_impresora_default">;
  numero: number;
  fecha: string;
  fechaVencimiento: string;
  cliente?: Pick<Cliente, "nombre" | "apellidos"> | null;
  lineas: { descripcion: string; cantidad: number; precio_unitario: number; subtotal: number }[];
  subtotalGravado: number;
  subtotalExento: number;
  totalItbis: number;
  total: number;
  notas?: string | null;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Recorta el ruido de punto flotante antes de mostrar una cantidad (§ recibo.ts). */
function cantidad(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/** "AAAA-MM-DD" → "DD/MM/AAAA" sin pasar por `Date` (§ mismo bug evitado en pdf.ts/recibo.ts). */
function formatearFechaIsoLocal(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-");
  return `${dia}/${mes}/${anio}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function generarHtmlCotizacion(datos: CotizacionImpresionDatos): string {
  const { negocio, cliente, lineas, notas } = datos;
  const ancho = negocio.ancho_impresora_default === 58 ? "58mm" : "80mm";
  const fecha = new Date(datos.fecha);

  const filasLineas = lineas
    .map(
      (l) => `
      <tr>
        <td colspan="4" class="desc">${escapeHtml(l.descripcion)}</td>
      </tr>
      <tr>
        <td class="num">${cantidad(l.cantidad)}</td>
        <td class="num">x</td>
        <td class="num">${money(l.precio_unitario)}</td>
        <td class="num total">${money(l.subtotal)}</td>
      </tr>`,
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
    ${negocio.rnc ? `RNC: ${escapeHtml(negocio.rnc)}<br/>` : ""}
    ${negocio.direccion ? `${escapeHtml(negocio.direccion)}<br/>` : ""}
    ${negocio.telefono ? `Tel: ${escapeHtml(negocio.telefono)}` : ""}
  </div>
  <hr/>
  <div class="centro" style="font-weight:bold;">COTIZACIÓN</div>
  <div class="linea"><span>#${datos.numero}</span><span>${fecha.toLocaleDateString("es-DO")}</span></div>
  ${cliente ? `<div>Cliente: ${escapeHtml(cliente.nombre)} ${escapeHtml(cliente.apellidos ?? "")}</div>` : ""}
  <hr/>
  <table>${filasLineas}</table>
  <hr/>
  <div class="linea"><span>Gravado</span><span>RD$ ${money(datos.subtotalGravado)}</span></div>
  <div class="linea"><span>Exento</span><span>RD$ ${money(datos.subtotalExento)}</span></div>
  <div class="linea"><span>ITBIS</span><span>RD$ ${money(datos.totalItbis)}</span></div>
  <div class="linea" style="font-weight:bold; font-size: 20px;"><span>TOTAL</span><span>RD$ ${money(datos.total)}</span></div>
  ${notas ? `<hr/><div>Notas: ${escapeHtml(notas)}</div>` : ""}
  <hr/>
  <div class="centro">Válida hasta ${formatearFechaIsoLocal(datos.fechaVencimiento)}</div>
  <div class="centro">No es una factura ni comprobante fiscal</div>
</body>
</html>`;
}

const ANCHO_TEXTO = 46;

function columnasTexto(izq: string, der: string): string {
  const espacio = Math.max(1, ANCHO_TEXTO - izq.length - der.length);
  return izq + " ".repeat(espacio) + der;
}

/** Mismo contenido que `generarHtmlCotizacion`/`generarEscPosCotizacion`, como líneas de texto plano (§ camino GDI silencioso). */
function generarTextoCotizacion(datos: CotizacionImpresionDatos): string[] {
  const { negocio, cliente, lineas, notas } = datos;
  const fecha = new Date(datos.fecha);
  const separador = "-".repeat(ANCHO_TEXTO);
  const out: string[] = [];

  out.push(negocio.nombre_comercial);
  if (negocio.rnc) out.push(`RNC: ${negocio.rnc}`);
  if (negocio.direccion) out.push(negocio.direccion);
  if (negocio.telefono) out.push(`Tel: ${negocio.telefono}`);
  out.push(separador);

  out.push("COTIZACIÓN");
  out.push(columnasTexto(`#${datos.numero}`, fecha.toLocaleDateString("es-DO")));
  if (cliente) out.push(`Cliente: ${cliente.nombre} ${cliente.apellidos ?? ""}`.trim());
  out.push(separador);

  for (const l of lineas) {
    out.push(l.descripcion);
    out.push(columnasTexto(`${cantidad(l.cantidad)} x ${money(l.precio_unitario)}`, money(l.subtotal)));
  }
  out.push(separador);

  out.push(columnasTexto("Gravado", `RD$ ${money(datos.subtotalGravado)}`));
  out.push(columnasTexto("Exento", `RD$ ${money(datos.subtotalExento)}`));
  out.push(columnasTexto("ITBIS", `RD$ ${money(datos.totalItbis)}`));
  out.push(columnasTexto("TOTAL", `RD$ ${money(datos.total)}`));

  if (notas) {
    out.push(separador);
    out.push(`Notas: ${notas}`);
  }
  out.push(separador);
  out.push(`Válida hasta ${formatearFechaIsoLocal(datos.fechaVencimiento)}`);
  out.push("No es una factura ni comprobante fiscal");
  return out;
}

/** Cadena de impresión (§ recibo.ts): térmica ESC/POS → texto GDI silencioso → diálogo del navegador. */
export function imprimirCotizacion(datos: CotizacionImpresionDatos): void {
  if (hayImpresoraTermicaDisponible() && obtenerImpresoraSeleccionada()) {
    void imprimirTermico(generarEscPosCotizacion(datos)).catch((e) => {
      console.error("Fallo la impresión térmica de la cotización, usando el siguiente método disponible:", e);
      imprimirCotizacionAlternativo(datos);
    });
    return;
  }
  imprimirCotizacionAlternativo(datos);
}

function imprimirCotizacionAlternativo(datos: CotizacionImpresionDatos): void {
  if (hayImpresionTextoDisponible()) {
    void imprimirTexto(generarTextoCotizacion(datos)).catch((e) => {
      console.error("Fallo la impresión de texto genérica de la cotización, usando el diálogo del navegador:", e);
      imprimirCotizacionNavegador(datos);
    });
    return;
  }
  imprimirCotizacionNavegador(datos);
}

/** Renderiza la cotización en un iframe oculto y abre el diálogo de impresión del sistema. */
function imprimirCotizacionNavegador(datos: CotizacionImpresionDatos): void {
  const html = generarHtmlCotizacion(datos);
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
  setTimeout(limpiar, 10_000);

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 200);
}
