import type { CSSProperties } from "react";

/** Paleta y estilos base compartidos por las pantallas del MVP. */
export const c = {
  azul: "#2563eb",
  azulOscuro: "#1e40af",
  azulClaro: "#eff6ff",
  rojo: "#dc2626",
  verde: "#16a34a",
  gris: "#6b7280",
  grisClaro: "#f3f4f6",
  borde: "#e5e7eb",
  texto: "#1f2937",
  fondo: "#f8fafc",
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
    background: "white",
    color: c.texto,
    border: `1px solid ${c.borde}`,
    borderRadius: 8,
    padding: "9px 18px",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  botonPeligro: {
    background: "white",
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
    background: "white",
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
    background: "white",
    border: `1px solid ${c.borde}`,
    borderRadius: 12,
    padding: 18,
    boxShadow: sombra.sm,
  } as CSSProperties,
  errorBox: {
    background: "#fef2f2",
    border: `1px solid ${c.rojo}`,
    color: c.rojo,
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    marginTop: 10,
  } as CSSProperties,
};

export { sombra };
