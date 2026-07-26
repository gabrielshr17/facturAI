import type { Factura, FacturaLinea, Cliente, Negocio } from "@sfr/core";
import { generarEscPos } from "./escpos.js";
import { hayImpresoraTermicaDisponible, obtenerImpresoraSeleccionada, imprimirTermico } from "./termica.js";

/**
 * Impresión del recibo (§7.2, §9, § hardware). Dos mecanismos:
 *
 * 1. Térmica ESC/POS directa (escritorio con impresora configurada en
 *    Configuración): bytes crudos vía el Spooler de Windows — silenciosa,
 *    sin diálogo, con corte de papel automático.
 * 2. HTML en iframe oculto + `window.print()` — funciona igual en la PWA
 *    (diálogo del navegador, imprime/guarda como PDF) y en el escritorio
 *    cuando no hay térmica configurada. Es el respaldo si (1) falla, para
 *    que un error de hardware nunca bloquee cerrar la venta.
 */

export interface ReciboDatos {
  negocio: Pick<Negocio, "nombre_comercial" | "rnc" | "direccion" | "telefono" | "ancho_impresora_default">;
  factura: Pick<
    Factura,
    "numero_interno" | "fecha_hora" | "subtotal_gravado" | "subtotal_exento" | "total_itbis" | "total" | "monto_pagado" | "cambio" | "notas"
  >;
  lineas: Pick<FacturaLinea, "descripcion" | "cantidad" | "precio_unitario" | "subtotal">[];
  pagos: { metodo: string; monto: number }[];
  cliente?: Pick<Cliente, "nombre" | "apellidos"> | null;
  /** Presente solo si la venta se emitió con comprobante fiscal (§6). */
  comprobante?: { ncf: string; tipoEcfEtiqueta: string; codigoSeguridad?: string | null } | null;
}

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  credito: "Crédito",
  tarjeta: "Tarjeta",
};

function money(n: number): string {
  return n.toFixed(2);
}

function generarHtmlRecibo(datos: ReciboDatos): string {
  const { negocio, factura, lineas, pagos, cliente, comprobante } = datos;
  const ancho = negocio.ancho_impresora_default === 58 ? "58mm" : "80mm";
  const fecha = new Date(factura.fecha_hora);

  const filasLineas = lineas
    .map(
      (l) => `
      <tr>
        <td colspan="4" class="desc">${escapeHtml(l.descripcion)}</td>
      </tr>
      <tr>
        <td class="num">${l.cantidad}</td>
        <td class="num">x</td>
        <td class="num">${money(l.precio_unitario)}</td>
        <td class="num total">${money(l.subtotal)}</td>
      </tr>`,
    )
    .join("");

  const filasPagos = pagos
    .map(
      (p) => `<div class="linea"><span>${ETIQUETA_METODO[p.metodo] ?? p.metodo}</span><span>RD$ ${money(p.monto)}</span></div>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${ancho} auto; margin: 2mm; }
  body { font-family: "Courier New", monospace; font-size: 11px; width: ${ancho}; margin: 0; }
  h1 { font-size: 13px; margin: 0 0 2px; text-align: center; }
  .centro { text-align: center; }
  .linea { display: flex; justify-content: space-between; }
  hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td.desc { padding-top: 3px; }
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
  <div class="linea"><span>Ticket #${factura.numero_interno}</span><span>${fecha.toLocaleDateString("es-DO")} ${fecha.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}</span></div>
  ${cliente ? `<div>Cliente: ${escapeHtml(cliente.nombre)} ${escapeHtml(cliente.apellidos ?? "")}</div>` : ""}
  ${comprobante ? `
  <div class="centro" style="font-weight:bold; margin-top:4px;">${escapeHtml(comprobante.tipoEcfEtiqueta)}</div>
  <div class="centro">NCF: ${escapeHtml(comprobante.ncf)}</div>
  ${comprobante.codigoSeguridad ? `<div class="centro">Cód. seguridad: ${escapeHtml(comprobante.codigoSeguridad)}</div>` : ""}
  ` : ""}
  <hr/>
  <table>${filasLineas}</table>
  <hr/>
  <div class="linea"><span>Gravado</span><span>RD$ ${money(factura.subtotal_gravado)}</span></div>
  <div class="linea"><span>Exento</span><span>RD$ ${money(factura.subtotal_exento)}</span></div>
  <div class="linea"><span>ITBIS</span><span>RD$ ${money(factura.total_itbis)}</span></div>
  <div class="linea" style="font-weight:bold; font-size: 13px;"><span>TOTAL</span><span>RD$ ${money(factura.total)}</span></div>
  <hr/>
  ${filasPagos}
  <div class="linea"><span>Pagado</span><span>RD$ ${money(factura.monto_pagado)}</span></div>
  <div class="linea"><span>Cambio</span><span>RD$ ${money(factura.cambio)}</span></div>
  ${factura.notas ? `<hr/><div>Notas: ${escapeHtml(factura.notas)}</div>` : ""}
  <hr/>
  <div class="centro">¡Gracias por su compra!</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Intenta imprimir por térmica ESC/POS si hay una configurada; si no (o falla), usa el diálogo del navegador. */
export function imprimirRecibo(datos: ReciboDatos): void {
  if (hayImpresoraTermicaDisponible() && obtenerImpresoraSeleccionada()) {
    void imprimirTermico(generarEscPos(datos)).catch((e) => {
      console.error("Fallo la impresión térmica, usando el diálogo del navegador:", e);
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
