/**
 * e-CF (DGII, Ley 32-23). Formato: `E` + tipo (2 dígitos) + secuencial (10 dígitos)
 * = 13 caracteres, p.ej. `E320000000001`.
 *
 * Tipos que expone la UI del MVP fiscal: **E32** (consumo, el caso normal) y
 * **E31** (crédito fiscal, cuando el comprador es una empresa/profesional con
 * RNC que necesita sustentar el gasto). El resto (E33/E34/E41/E43-47) quedan
 * modelados en el tipo pero no se ofrecen todavía en Ventas.
 */
export type TipoEcf = "31" | "32" | "33" | "34" | "41" | "43" | "44" | "45" | "46" | "47";

/** Arma el NCF completo a partir del tipo y el número consumido de la secuencia. */
export function formatearNcf(tipoEcf: TipoEcf, numero: number): string {
  return `E${tipoEcf}${String(numero).padStart(10, "0")}`;
}

/**
 * Sugiere el tipo de e-CF según si el receptor tiene RNC (E31, crédito fiscal)
 * o no (E32, consumo). Es solo una sugerencia para la UI; el usuario puede
 * cambiarla explícitamente en el modal de cobro.
 */
export function tipoEcfSugerido(documentoTipo: "rnc" | "cedula" | null | undefined): TipoEcf {
  return documentoTipo === "rnc" ? "31" : "32";
}

/** Etiquetas legibles para la UI. */
export const ETIQUETA_TIPO_ECF: Record<TipoEcf, string> = {
  "31": "Crédito Fiscal (E31)",
  "32": "Consumo (E32)",
  "33": "Nota de Débito (E33)",
  "34": "Nota de Crédito (E34)",
  "41": "Compras (E41)",
  "43": "Gastos Menores (E43)",
  "44": "Regímenes Especiales (E44)",
  "45": "Gubernamental (E45)",
  "46": "Exportaciones (E46)",
  "47": "Pagos al Exterior (E47)",
};

/** Denominación oficial para la representación impresa (Informe Técnico e-CF §18.2.1). */
export const NOMBRE_TIPO_ECF: Record<TipoEcf, string> = {
  "31": "Factura de Crédito Fiscal Electrónica",
  "32": "Factura de Consumo Electrónica",
  "33": "Nota de Débito Electrónica",
  "34": "Nota de Crédito Electrónica",
  "41": "Comprobante Electrónico de Compras",
  "43": "Comprobante Electrónico para Gastos Menores",
  "44": "Comprobante Electrónico para Regímenes Especiales",
  "45": "Comprobante Electrónico Gubernamental",
  "46": "Comprobante Electrónico para Exportaciones",
  "47": "Comprobante Electrónico para Pagos al Exterior",
};

/** Código de modificación de notas de crédito/débito, en palabras (Informe Técnico e-CF §18.2.1). */
export const DESCRIPCION_CODIGO_MODIFICACION: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Anula el NCF modificado",
  2: "Corrige Texto del Comprobante Fiscal modificado",
  3: "Corrige montos del NCF modificado",
  4: "Reemplazo NCF emitido en contingencia",
  5: "Referencia Factura Consumo Electrónica",
};

export function requiereCompradorIdentificado(tipoEcf: TipoEcf): boolean {
  return tipoEcf === "31" || tipoEcf === "45";
}

/** La fecha de vencimiento de la secuencia no aplica a notas de crédito ni a facturas de consumo. */
export function requiereVencimientoEnRepresentacion(tipoEcf: TipoEcf): boolean {
  return tipoEcf !== "32" && tipoEcf !== "34";
}
