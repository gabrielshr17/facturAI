import type { ReciboDatos } from "./recibo.js";

/**
 * Generador de comandos ESC/POS crudos para impresoras térmicas (§ hardware,
 * plan.md). Es puro: recibe los mismos datos que `generarHtmlRecibo` y
 * produce bytes, sin saber nada de Tauri/Windows — quien los transporta a la
 * impresora es responsabilidad de `termica.ts` (packages/desktop).
 *
 * Referencia de comandos usados (estándar Epson ESC/POS, compatible con la
 * inmensa mayoría de térmicas genéricas de 58/80mm):
 *   ESC @         (1B 40)          inicializar impresora
 *   ESC a n       (1B 61 n)        alinear: 0 izq, 1 centro, 2 der
 *   ESC E n       (1B 45 n)        negrita on/off
 *   GS V m        (1D 56 m)        cortar papel (m=1 corte parcial)
 *   ESC p m t1 t2 (1B 70 00 19 FA) abrir gaveta (pulso al conector RJ11)
 */

const ESC = 0x1b;
const GS = 0x1d;

const ETIQUETA_METODO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  credito: "Crédito",
  tarjeta: "Tarjeta",
};

function money(n: number): string {
  return n.toFixed(2);
}

class ConstructorEscPos {
  private partes: number[] = [];

  private bytes(arr: number[]): this {
    this.partes.push(...arr);
    return this;
  }

  /** Texto en codificación CP437 aproximada: cae a "?" para símbolos fuera de rango, suficiente para nombres/montos en español. */
  texto(s: string): this {
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 63;
      this.partes.push(code < 256 ? code : 63);
    }
    return this;
  }

  linea(s = ""): this {
    return this.texto(s).bytes([0x0a]);
  }

  init(): this {
    return this.bytes([ESC, 0x40]);
  }

  alinear(modo: "izq" | "centro" | "der"): this {
    const n = modo === "izq" ? 0 : modo === "centro" ? 1 : 2;
    return this.bytes([ESC, 0x61, n]);
  }

  negrita(activa: boolean): this {
    return this.bytes([ESC, 0x45, activa ? 1 : 0]);
  }

  separador(ancho: number): this {
    return this.linea("-".repeat(ancho));
  }

  /** Dos columnas justificadas a los extremos, como en el HTML `.linea`. */
  columnas(izq: string, der: string, ancho: number): this {
    const espacio = Math.max(1, ancho - izq.length - der.length);
    return this.linea(izq + " ".repeat(espacio) + der);
  }

  cortar(): this {
    return this.bytes([GS, 0x56, 1]);
  }

  abrirGaveta(): this {
    return this.bytes([ESC, 0x70, 0x00, 0x19, 0xfa]);
  }

  saltos(n: number): this {
    for (let i = 0; i < n; i++) this.partes.push(0x0a);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.partes);
  }
}

/** Ancho de línea en caracteres para fuente normal (font A, 12x24) en térmicas de 58/80mm. */
function anchoCaracteres(anchoMm: number | undefined): number {
  return anchoMm === 58 ? 32 : 42;
}

export function generarEscPos(datos: ReciboDatos): Uint8Array {
  const { negocio, factura, lineas, pagos, cliente, comprobante } = datos;
  const ancho = anchoCaracteres(negocio.ancho_impresora_default);
  const fecha = new Date(factura.fecha_hora);
  const b = new ConstructorEscPos().init();

  b.alinear("centro").negrita(true).linea(negocio.nombre_comercial).negrita(false);
  if (negocio.rnc) b.linea(`RNC: ${negocio.rnc}`);
  if (negocio.direccion) b.linea(negocio.direccion);
  if (negocio.telefono) b.linea(`Tel: ${negocio.telefono}`);
  b.alinear("izq").separador(ancho);

  b.columnas(
    `Ticket #${factura.numero_interno}`,
    `${fecha.toLocaleDateString("es-DO")} ${fecha.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}`,
    ancho,
  );
  if (cliente) b.linea(`Cliente: ${cliente.nombre} ${cliente.apellidos ?? ""}`.trim());

  if (comprobante) {
    b.alinear("centro").negrita(true).linea(comprobante.tipoEcfEtiqueta).negrita(false);
    b.linea(`NCF: ${comprobante.ncf}`);
    if (comprobante.codigoSeguridad) b.linea(`Cód. seguridad: ${comprobante.codigoSeguridad}`);
    b.alinear("izq");
  }

  b.separador(ancho);
  for (const l of lineas) {
    b.linea(l.descripcion);
    b.columnas(`${l.cantidad} x ${money(l.precio_unitario)}`, money(l.subtotal), ancho);
  }
  b.separador(ancho);

  b.columnas("Gravado", `RD$ ${money(factura.subtotal_gravado)}`, ancho);
  b.columnas("Exento", `RD$ ${money(factura.subtotal_exento)}`, ancho);
  b.columnas("ITBIS", `RD$ ${money(factura.total_itbis)}`, ancho);
  b.negrita(true).columnas("TOTAL", `RD$ ${money(factura.total)}`, ancho).negrita(false);
  b.separador(ancho);

  for (const p of pagos) {
    b.columnas(ETIQUETA_METODO[p.metodo] ?? p.metodo, `RD$ ${money(p.monto)}`, ancho);
  }
  b.columnas("Pagado", `RD$ ${money(factura.monto_pagado)}`, ancho);
  b.columnas("Cambio", `RD$ ${money(factura.cambio)}`, ancho);

  if (factura.notas) {
    b.separador(ancho).linea(`Notas: ${factura.notas}`);
  }

  b.separador(ancho).alinear("centro").linea("¡Gracias por su compra!");
  // El cabezal de corte está unos cuantos mm por debajo del cabezal de
  // impresión: si no se avanza suficiente papel antes de cortar, la cuchilla
  // corta a través de la última línea impresa en vez de debajo de ella.
  b.saltos(6).cortar();

  return b.build();
}

/** Comando mínimo para pulsar el conector de la gaveta de dinero conectada a la impresora térmica. */
export function generarComandoAbrirGaveta(): Uint8Array {
  return new ConstructorEscPos().abrirGaveta().build();
}

/** Ticket corto para verificar desde Configuración que la impresora seleccionada realmente funciona. */
export function generarTicketPrueba(): Uint8Array {
  const ahora = new Date();
  return new ConstructorEscPos()
    .init()
    .alinear("centro")
    .negrita(true)
    .linea("PRUEBA DE IMPRESION")
    .negrita(false)
    .linea(`${ahora.toLocaleDateString("es-DO")} ${ahora.toLocaleTimeString("es-DO")}`)
    .separador(32)
    .alinear("izq")
    .linea("Si puedes leer esto con letra")
    .linea("clara y el papel se cortó solo,")
    .linea("la impresora térmica está bien")
    .linea("configurada.")
    .saltos(6)
    .cortar()
    .build();
}
