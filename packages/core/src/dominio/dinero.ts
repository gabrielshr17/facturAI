/**
 * Utilidades de dinero. Regla §5: precios y montos a **2 decimales**; el cambio
 * se ajusta al **centavo más cercano**.
 *
 * Trabajamos en pesos con `number`. Para evitar los errores clásicos de coma
 * flotante (0.1 + 0.2 !== 0.3), todo redondeo pasa por `redondear2`, que escala
 * a centavos, redondea con `Math.round` corregido y vuelve a pesos.
 */

/** Redondea a 2 decimales (centavos), medio-arriba y estable ante ruido binario. */
export function redondear2(monto: number): number {
  if (!Number.isFinite(monto)) return 0;
  // epsilon corrige casos como 1.005 que en binario es 1.00499999...
  const centavos = Math.round((monto + Number.EPSILON) * 100);
  return centavos / 100;
}

/**
 * Ajusta un monto al centavo más cercano. En RD el efectivo circula hasta el
 * peso, pero la regla de negocio pedida es "centavo más cercano", que a 2
 * decimales equivale a `redondear2`. Se expone aparte para dejar explícito el
 * punto de ajuste del cambio y poder cambiar la política sin tocar llamadas.
 */
export function ajustarCentavo(monto: number): number {
  return redondear2(monto);
}

/**
 * Calcula el cambio a devolver: pagado - total, ajustado al centavo.
 * Si el pago no cubre el total, el cambio es 0 (no negativo); la validación de
 * pago insuficiente es responsabilidad de quien cobra.
 */
export function calcularCambio(total: number, pagado: number): number {
  const cambio = redondear2(pagado) - redondear2(total);
  return cambio > 0 ? ajustarCentavo(cambio) : 0;
}

/** Suma una lista de montos redondeando el resultado a 2 decimales. */
export function sumar(montos: number[]): number {
  return redondear2(montos.reduce((acc, m) => acc + m, 0));
}
