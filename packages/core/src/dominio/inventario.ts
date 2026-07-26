/**
 * Inventario (configurable, §3): cuando está apagado (por defecto en el MVP),
 * la existencia no se valida ni se descuenta. Cuando está activo, cada
 * producto decide su propia política al agotarse: `bloquear` la venta o
 * solo `advertir` y dejar continuar (permite vender en negativo a propósito).
 */
export type PoliticaSinExistencia = "bloquear" | "advertir";

export interface DisponibilidadInput {
  inventarioActivo: boolean;
  existencia: number | null;
  politica: PoliticaSinExistencia;
  cantidadSolicitada: number;
}

export interface DisponibilidadResultado {
  permitido: boolean;
  /** Cuánto falta para cubrir la cantidad solicitada (0 si alcanza). */
  faltante: number;
}

export function evaluarDisponibilidad(input: DisponibilidadInput): DisponibilidadResultado {
  if (!input.inventarioActivo) return { permitido: true, faltante: 0 };

  const existencia = input.existencia ?? 0;
  const faltante = Math.max(0, input.cantidadSolicitada - existencia);
  if (faltante === 0) return { permitido: true, faltante: 0 };

  return { permitido: input.politica === "advertir", faltante };
}
