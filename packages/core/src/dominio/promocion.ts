import { redondear2 } from "./dinero.js";

/** Promociones (§ Fase 3): descuento por producto o departamento, con vigencia. */
export type TipoPromocion = "porcentaje" | "monto_fijo";
export type AplicaAPromocion = "producto" | "departamento" | "todo";

export interface DescuentoInput {
  tipo: TipoPromocion;
  valor: number;
}

/** Aplica el descuento de una promoción a un precio base; nunca deja el precio negativo. */
export function aplicarDescuento(precioBase: number, promocion: DescuentoInput): number {
  const descuento = promocion.tipo === "porcentaje" ? precioBase * (promocion.valor / 100) : promocion.valor;
  return redondear2(Math.max(0, precioBase - descuento));
}
