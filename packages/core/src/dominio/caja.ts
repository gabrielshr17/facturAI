import { redondear2 } from "./dinero.js";

/**
 * Cálculo del corte de caja (cierre de período): el efectivo esperado es el
 * fondo inicial más las ventas en efectivo del período; la diferencia compara
 * eso contra lo contado físicamente en caja.
 */
export interface CorteCajaInput {
  montoInicial: number;
  totalEfectivo: number;
  efectivoContado: number;
}

export interface CorteCajaResultado {
  efectivoEsperado: number;
  diferencia: number;
}

export function calcularCorteCaja(input: CorteCajaInput): CorteCajaResultado {
  const efectivoEsperado = redondear2(input.montoInicial + input.totalEfectivo);
  const diferencia = redondear2(input.efectivoContado - efectivoEsperado);
  return { efectivoEsperado, diferencia };
}
