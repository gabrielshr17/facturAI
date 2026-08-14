import type { CSSProperties } from "react";

/**
 * Formatea un monto para MOSTRAR en pantalla, con separador de miles ("RD$
 * 1,600.00" en vez de "RD$1600.00"). Solo para texto de solo lectura — NO
 * usar para el `value` de un `<input type="number">` editable (el navegador
 * rechaza comas ahí) ni para exportaciones CSV (el valor debe quedar plano
 * para poder reprocesarse).
 */
export function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Paleta y estilos base compartidos por las pantallas del MVP.
 *
 * Los valores son variables CSS (`--sfr-*`, definidas en
 * `estilos-globales.css`) en vez de hex fijos: así un solo atributo
 * `data-theme` en `<html>` (ver `tema.ts`) cambia claro/oscuro en toda la
 * app sin que cada pantalla tenga que saber en qué tema está.
 */
export const c = {
  azul: "var(--sfr-acento)",
  azulOscuro: "var(--sfr-acento-oscuro)",
  azulClaro: "var(--sfr-acento-claro)",
  rojo: "var(--sfr-peligro)",
  rojoFondo: "var(--sfr-peligro-fondo)",
  verde: "var(--sfr-exito)",
  verdeFondo: "var(--sfr-exito-fondo)",
  amarillo: "var(--sfr-advertencia)",
  amarilloFondo: "var(--sfr-advertencia-fondo)",
  gris: "var(--sfr-gris)",
  grisClaro: "var(--sfr-gris-claro)",
  borde: "var(--sfr-borde)",
  texto: "var(--sfr-texto)",
  fondo: "var(--sfr-fondo)",
  superficie: "var(--sfr-superficie)",
};

/** Sombras sutiles (misma escala que Tailwind shadow-sm/shadow) para dar sensación de elevación a tarjetas y menús. */
const sombra = {
  sm: "0 1px 2px rgba(15, 23, 42, 0.06)",
  md: "0 1px 3px rgba(15, 23, 42, 0.1), 0 1px 2px rgba(15, 23, 42, 0.06)",
};

export const s = {
  boton: {
    background: c.azul,
    color: "white",
    border: "none",
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    boxShadow: sombra.sm,
  } as CSSProperties,
  botonSecundario: {
    background: c.superficie,
    color: c.texto,
    border: `1px solid ${c.borde}`,
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  botonPeligro: {
    background: c.superficie,
    color: c.rojo,
    border: `1px solid ${c.rojo}`,
    borderRadius: 8,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  input: {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    border: `1px solid ${c.borde}`,
    borderRadius: 8,
    boxSizing: "border-box",
    background: c.superficie,
    color: c.texto,
  } as CSSProperties,
  label: {
    display: "block",
    fontSize: 13,
    color: c.gris,
    marginBottom: 4,
    marginTop: 10,
    fontWeight: 500,
  } as CSSProperties,
  tabla: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 14,
  } as CSSProperties,
  th: {
    textAlign: "left",
    padding: "10px 12px",
    borderBottom: `1px solid ${c.borde}`,
    color: c.gris,
    fontWeight: 600,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  } as CSSProperties,
  td: {
    padding: "10px 12px",
    borderBottom: `1px solid ${c.borde}`,
  } as CSSProperties,
  /** Columnas numéricas/monto: alineadas a la derecha para que los montos se puedan comparar de un vistazo. */
  tdDerecha: {
    padding: "10px 12px",
    borderBottom: `1px solid ${c.borde}`,
    textAlign: "right",
    fontVariantNumeric: "tabular-nums",
  } as CSSProperties,
  /** Fila de "sin resultados": centrada y con más aire, en vez de una celda de texto plano pegada arriba. */
  filaVacia: {
    padding: "36px 12px",
    textAlign: "center",
    color: c.gris,
    fontSize: 14,
  } as CSSProperties,
  /** Etiqueta tipo "pill" para estados/categorías cortas (impuesto, tipo de comprobante, etc). */
  badge: {
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    background: c.grisClaro,
    color: c.texto,
  } as CSSProperties,
  /** Barra de acciones al pie de un formulario, separada del contenido con una línea sutil. */
  formFooter: {
    display: "flex",
    gap: 8,
    marginTop: 18,
    paddingTop: 16,
    borderTop: `1px solid ${c.borde}`,
  } as CSSProperties,
  tarjeta: {
    background: c.superficie,
    border: `1px solid ${c.borde}`,
    borderRadius: 12,
    padding: 18,
    boxShadow: sombra.sm,
  } as CSSProperties,
  errorBox: {
    background: c.rojoFondo,
    border: `1px solid ${c.rojo}`,
    color: c.rojo,
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    marginTop: 10,
  } as CSSProperties,
};

export { sombra };
