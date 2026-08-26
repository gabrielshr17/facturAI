import type { ReciboDatos } from "./recibo.js";
import type { CotizacionImpresionDatos } from "./cotizacion.js";

/**
 * Generador de comandos ESC/POS crudos para impresoras térmicas (§ hardware,
 * plan.md). Es puro: recibe los mismos datos que `generarHtmlRecibo` y
 * produce bytes, sin saber nada de Tauri/Windows — quien los transporta a la
 * impresora es responsabilidad de `termica.ts` (packages/desktop).
 *
 * Referencia de comandos usados (estándar Epson ESC/POS, compatible con la
 * inmensa mayoría de térmicas genéricas de 58/80mm):
 *   ESC @         (1B 40)          inicializar impresora
 *   ESC M n       (1B 4D n)        fuente: 0 = Fuente A (12x24, grande), 1 = Fuente B (9x17, chica)
 *   ESC a n       (1B 61 n)        alinear: 0 izq, 1 centro, 2 der
 *   ESC E n       (1B 45 n)        negrita on/off
 *   GS ! n        (1D 21 n)        tamaño de fuente (n=0x01 doble alto, n=0x11 doble alto y ancho)
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
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Recorta el ruido de punto flotante de cantidades calculadas (ej. monto/precio en la ventanita de
 *  cantidad específica) antes de imprimirlas — el recibo no debe mostrar "3.3333333333333335". */
function cantidad(n: number): string {
  return Number(n.toFixed(2)).toString();
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
    // ESC @ reinicia todo; ESC M 0 fuerza la Fuente A (12x24, la más grande de las dos fuentes
    // estándar de una térmica ESC/POS). Sin esto, algunas impresoras (sobre todo clones) arrancan
    // en la Fuente B (9x17, más chica y condensada) por defecto, y el recibo sale con letra
    // diminuta sin que el resto del código tenga forma de saberlo ni corregirlo.
    return this.bytes([ESC, 0x40, ESC, 0x4d, 0x00]);
  }

  alinear(modo: "izq" | "centro" | "der"): this {
    const n = modo === "izq" ? 0 : modo === "centro" ? 1 : 2;
    return this.bytes([ESC, 0x61, n]);
  }

  negrita(activa: boolean): this {
    return this.bytes([ESC, 0x45, activa ? 1 : 0]);
  }

  /** Tamaño de fuente: "normal", "alto" (doble alto, ancho normal — no rompe el conteo de
   *  caracteres por línea de `columnas()`) o "grande" (doble alto Y ancho, para títulos/totales
   *  cortos que valen la pena resaltar — si se usa junto con `columnas()`, hay que pasarle la
   *  MITAD del ancho normal, porque cada carácter ahora ocupa el doble de espacio físico). */
  tamano(modo: "normal" | "alto" | "grande"): this {
    const n = modo === "normal" ? 0x00 : modo === "alto" ? 0x01 : 0x11;
    return this.bytes([GS, 0x21, n]);
  }

  separador(ancho: number): this {
    return this.linea("-".repeat(ancho));
  }

  /** Dos columnas justificadas a los extremos, como en el HTML `.linea`. Si no caben en una sola
   *  línea de `ancho` caracteres, se parte en dos (izquierda arriba, derecha abajo pegada al margen
   *  derecho) en vez de aplastarlas con un solo espacio de separación — eso último hacía que la
   *  línea completa excediera el ancho real de la impresora, que la envuelve sola donde le
   *  convenga (a mitad de un número, casi siempre) y desalinea todo lo que sigue debajo. */
  columnas(izq: string, der: string, ancho: number): this {
    if (izq.length + der.length + 1 > ancho) {
      this.linea(izq);
      return this.linea(" ".repeat(Math.max(0, ancho - der.length)) + der);
    }
    const espacio = ancho - izq.length - der.length;
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
  const b = new ConstructorEscPos().init().tamano("alto");

  // El nombre del negocio va a tamaño real doble (alto Y ancho) — es una sola línea corta, así que
  // se lo puede permitir sin arriesgar el conteo de caracteres de las columnas de más abajo.
  b.alinear("centro").tamano("grande").negrita(true).linea(negocio.nombre_comercial).negrita(false).tamano("alto");
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
    b.columnas(`${cantidad(l.cantidad)} x ${money(l.precio_unitario)}`, money(l.subtotal), ancho);
  }
  b.separador(ancho);

  b.columnas("Gravado", `RD$ ${money(factura.subtotal_gravado)}`, ancho);
  b.columnas("Exento", `RD$ ${money(factura.subtotal_exento)}`, ancho);
  b.columnas("ITBIS", `RD$ ${money(factura.total_itbis)}`, ancho);
  // El TOTAL también a tamaño real doble — es el número que el cliente busca primero. A doble
  // ancho cada carácter ocupa el doble de espacio físico, así que `columnas()` recibe la MITAD
  // del ancho normal para no exceder el ancho real del papel.
  b.negrita(true).tamano("grande").columnas("TOTAL", `RD$ ${money(factura.total)}`, Math.floor(ancho / 2)).tamano("alto").negrita(false);
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

/** "AAAA-MM-DD" → "DD/MM/AAAA" sin pasar por `Date` (§ mismo bug evitado en pdf.ts/ConsultaCotizaciones.tsx). */
function formatearFechaIsoLocal(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.split("-");
  return `${dia}/${mes}/${anio}`;
}

/** Igual que `generarEscPos`, para una cotización: sin pagos ni comprobante fiscal, con fecha de
 *  vencimiento y el aviso de que no es un documento fiscal en vez del pie "¡Gracias por su compra!". */
export function generarEscPosCotizacion(datos: CotizacionImpresionDatos): Uint8Array {
  const { negocio, cliente, lineas, notas } = datos;
  const ancho = anchoCaracteres(negocio.ancho_impresora_default);
  const fecha = new Date(datos.fecha);
  const b = new ConstructorEscPos().init().tamano("alto");

  b.alinear("centro").tamano("grande").negrita(true).linea(negocio.nombre_comercial).negrita(false).tamano("alto");
  if (negocio.rnc) b.linea(`RNC: ${negocio.rnc}`);
  if (negocio.direccion) b.linea(negocio.direccion);
  if (negocio.telefono) b.linea(`Tel: ${negocio.telefono}`);
  b.alinear("izq").separador(ancho);

  b.alinear("centro").negrita(true).linea("COTIZACIÓN").negrita(false).alinear("izq");
  b.columnas(`#${datos.numero}`, fecha.toLocaleDateString("es-DO"), ancho);
  if (cliente) b.linea(`Cliente: ${cliente.nombre} ${cliente.apellidos ?? ""}`.trim());

  b.separador(ancho);
  for (const l of lineas) {
    b.linea(l.descripcion);
    b.columnas(`${cantidad(l.cantidad)} x ${money(l.precio_unitario)}`, money(l.subtotal), ancho);
  }
  b.separador(ancho);

  b.columnas("Gravado", `RD$ ${money(datos.subtotalGravado)}`, ancho);
  b.columnas("Exento", `RD$ ${money(datos.subtotalExento)}`, ancho);
  b.columnas("ITBIS", `RD$ ${money(datos.totalItbis)}`, ancho);
  b.negrita(true).tamano("grande").columnas("TOTAL", `RD$ ${money(datos.total)}`, Math.floor(ancho / 2)).tamano("alto").negrita(false);
  b.separador(ancho);

  if (notas) {
    b.linea(`Notas: ${notas}`).separador(ancho);
  }

  b.alinear("centro");
  b.linea(`Válida hasta ${formatearFechaIsoLocal(datos.fechaVencimiento)}`);
  b.linea("No es una factura ni comprobante fiscal");
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
    .tamano("alto")
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
