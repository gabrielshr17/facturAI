import type { LineaATransmitir } from "@sfr/core";
import { DocumentoFiscalInvalidoError } from "../errores.js";

export type IndicadorFacturacion = 1 | 2 | 3 | 4;

export const TASA_ITBIS: Record<1 | 2, number> = { 1: 0.18, 2: 0.16 };

export function redondear2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

export function indicadorFacturacion(linea: LineaATransmitir, tasaCero = false): IndicadorFacturacion {
  if (linea.tasaImpuesto === 0) return tasaCero ? 3 : 4;
  if (Math.abs(linea.tasaImpuesto - TASA_ITBIS[1]) < 1e-9) return 1;
  if (Math.abs(linea.tasaImpuesto - TASA_ITBIS[2]) < 1e-9) return 2;
  throw new DocumentoFiscalInvalidoError(
    `La línea "${linea.descripcion}" tiene una tasa de ITBIS no soportada (${linea.tasaImpuesto}).`,
  );
}

export interface TotalesEcf {
  hayGravado: boolean;
  montoGravadoI1: number | null;
  montoGravadoI2: number | null;
  montoGravadoI3: number | null;
  montoGravadoTotal: number | null;
  montoExento: number | null;
  totalItbis1: number | null;
  totalItbis2: number | null;
  totalItbis3: number | null;
  totalItbis: number | null;
  montoTotal: number;
}

function sumaPorIndicador(
  lineas: LineaATransmitir[],
  indicador: IndicadorFacturacion,
  tasaCero: boolean,
): number | null {
  const delIndicador = lineas.filter((l) => indicadorFacturacion(l, tasaCero) === indicador);
  if (delIndicador.length === 0) return null;
  return redondear2(delIndicador.reduce((suma, l) => suma + l.subtotal, 0));
}

export function calcularTotalesEcf(lineas: LineaATransmitir[], tasaCero = false): TotalesEcf {
  const conItbis1 = sumaPorIndicador(lineas, 1, tasaCero);
  const conItbis2 = sumaPorIndicador(lineas, 2, tasaCero);
  const montoGravadoI3 = sumaPorIndicador(lineas, 3, tasaCero);
  const montoExento = sumaPorIndicador(lineas, 4, tasaCero);

  const montoGravadoI1 = conItbis1 === null ? null : redondear2(conItbis1 / (1 + TASA_ITBIS[1]));
  const montoGravadoI2 = conItbis2 === null ? null : redondear2(conItbis2 / (1 + TASA_ITBIS[2]));
  const totalItbis1 = conItbis1 === null || montoGravadoI1 === null ? null : redondear2(conItbis1 - montoGravadoI1);
  const totalItbis2 = conItbis2 === null || montoGravadoI2 === null ? null : redondear2(conItbis2 - montoGravadoI2);
  const hayGravado = montoGravadoI1 !== null || montoGravadoI2 !== null || montoGravadoI3 !== null;

  return {
    hayGravado,
    montoGravadoI1,
    montoGravadoI2,
    montoGravadoI3,
    montoGravadoTotal: hayGravado
      ? redondear2((montoGravadoI1 ?? 0) + (montoGravadoI2 ?? 0) + (montoGravadoI3 ?? 0))
      : null,
    montoExento,
    totalItbis1,
    totalItbis2,
    totalItbis3: montoGravadoI3 === null ? null : 0,
    totalItbis: hayGravado ? redondear2((totalItbis1 ?? 0) + (totalItbis2 ?? 0)) : null,
    montoTotal: redondear2(lineas.reduce((suma, l) => suma + l.subtotal, 0)),
  };
}
