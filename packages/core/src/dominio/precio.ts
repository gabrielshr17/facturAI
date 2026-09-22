import { redondear2 } from "./dinero.js";

/** % de ganancia con el que nace un producto nuevo cuando no se indica otro (§5). */
export const PCT_GANANCIA_POR_DEFECTO = 20;

/**
 * Cálculo del precio de venta. Regla §5:
 *   - Se deriva de **costo + % de ganancia**.
 *   - Pero puede **ingresarse manualmente**, y el valor manual **manda**.
 *
 * El `precio_venta` es el **precio final al público, con ITBIS incluido** (lo que
 * ve y paga el cliente), y el % de ganancia se aplica **directo sobre el costo
 * hasta llegar a ese precio final**: costo 100 con 20% de ganancia = precio 120,
 * lleve el producto ITBIS o no.
 *
 * Es decir: el impuesto NO se suma encima del precio derivado. En la factura el
 * ITBIS se *extrae* de este precio (ver `factura.ts`), así que sale del mismo
 * 120 — el % de ganancia es el margen sobre el precio de venta al público, no un
 * margen neto después de impuesto. Es como se cotiza el precio de mostrador.
 */
export interface CalculoPrecioInput {
  costo: number;
  /** Porcentaje de ganancia sobre el costo, p.ej. 25 = 25%. */
  pctGanancia: number;
  /** Precio ingresado a mano. Si está presente (>= 0), manda sobre la derivación. */
  precioManual?: number | null;
}

/** Precio al público a partir de costo + % de ganancia: costo 100 + 20% = 120. */
export function precioDesdeCosto(costo: number, pctGanancia: number): number {
  return redondear2(costo * (1 + pctGanancia / 100));
}

/**
 * Inverso de `precioDesdeCosto`: el % de ganancia que de verdad implica un precio
 * de venta dado, para un costo conocido.
 *
 * Existe porque `pct_ganancia` solo se actualiza cuando el precio se DERIVA de
 * costo + %. Si en cambio el precio se escribió a mano (§ "manual manda" en
 * `calcularPrecioVenta`), `pct_ganancia` se queda en lo que sea que tenía
 * antes y deja de reflejar el margen real. La ventana de edición usa esto para
 * mostrar el % verdadero en vez del valor guardado.
 * Con costo 0 el % no está definido (cualquier precio es "infinito" margen),
 * así que se devuelve 0 en vez de Infinity/NaN.
 */
export function pctGananciaDesdePrecio(costo: number, precioVenta: number): number {
  if (!(costo > 0)) return 0;
  return redondear2((precioVenta / costo - 1) * 100);
}

/**
 * Calcula el precio de venta final al público.
 * Si `precioManual` viene definido y no negativo, se usa tal cual (manual manda).
 * Si no, se deriva del costo + % de ganancia.
 */
export function calcularPrecioVenta(input: CalculoPrecioInput): number {
  const { costo, pctGanancia, precioManual } = input;

  if (precioManual != null && precioManual >= 0) {
    return redondear2(precioManual);
  }

  return precioDesdeCosto(costo, pctGanancia);
}
