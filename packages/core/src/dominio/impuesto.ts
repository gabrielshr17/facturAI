/**
 * Tipos de impuesto y sus tasas. Regla §5 / módulo fiscal: ITBIS 18% estándar,
 * 16% reducido en ciertos bienes, exento (0).
 */
export type ImpuestoTipo = "itbis18" | "itbis16" | "exento" | "otro";

/** Tasa por defecto de cada tipo (fracción: 0.18 = 18%). */
export const TASA_POR_TIPO: Record<ImpuestoTipo, number> = {
  itbis18: 0.18,
  itbis16: 0.16,
  exento: 0,
  otro: 0,
};

/** Devuelve la tasa de un tipo, o 0 si no se reconoce. */
export function tasaDe(tipo: ImpuestoTipo): number {
  return TASA_POR_TIPO[tipo] ?? 0;
}
