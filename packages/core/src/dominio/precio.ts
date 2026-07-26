import { redondear2 } from "./dinero.js";

/**
 * Cálculo del precio de venta. Regla §5:
 *   - Se deriva de **costo + % de ganancia**.
 *   - Pero puede **ingresarse manualmente**, y el valor manual **manda**.
 *
 * SUPUESTO (marcado): el `precio_venta` es el precio final al público con **ITBIS
 * incluido** (lo que ve el cliente). Por eso la derivación aplica primero el
 * margen sobre el costo (precio base sin impuesto) y luego suma el impuesto. En
 * la factura, el impuesto se *extrae* de este precio (ver `factura.ts`).
 * Si el negocio prefiere manejar precios sin impuesto, se cambia aquí sin tocar
 * el resto del dominio.
 */
export interface CalculoPrecioInput {
  costo: number;
  /** Porcentaje de ganancia sobre el costo, p.ej. 25 = 25%. */
  pctGanancia: number;
  /** Tasa de impuesto como fracción (0.18 = 18%). 0 para exento. */
  tasaImpuesto: number;
  /** Precio ingresado a mano. Si está presente (>= 0), manda sobre la derivación. */
  precioManual?: number | null;
}

/** Precio base (sin impuesto) a partir de costo + % de ganancia. */
export function precioBaseDesdeCosto(costo: number, pctGanancia: number): number {
  return redondear2(costo * (1 + pctGanancia / 100));
}

/**
 * Calcula el precio de venta final (ITBIS incluido).
 * Si `precioManual` viene definido y no negativo, se usa tal cual (manual manda).
 * Si no, se deriva: (costo + %) y se le suma el impuesto.
 */
export function calcularPrecioVenta(input: CalculoPrecioInput): number {
  const { costo, pctGanancia, tasaImpuesto, precioManual } = input;

  if (precioManual != null && precioManual >= 0) {
    return redondear2(precioManual);
  }

  const base = precioBaseDesdeCosto(costo, pctGanancia);
  return redondear2(base * (1 + tasaImpuesto));
}
