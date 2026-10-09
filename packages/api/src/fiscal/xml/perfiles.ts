import type { ComprobanteATransmitir } from "@sfr/core";
import { DocumentoFiscalInvalidoError } from "../errores.js";

export type TipoEcfEmitible = ComprobanteATransmitir["tipoEcf"];

/**
 * identificado: RNC y razón social obligatorios. anonimo: el bloque existe pero sus datos son opcionales.
 * opcional: sin datos se omite el bloque. ninguno: el tipo no lleva comprador. extranjero: se identifica
 * con IdentificadorExtranjero en lugar de RNC.
 */
export type ModoComprador = "identificado" | "anonimo" | "opcional" | "ninguno" | "extranjero";

export type Retencion = "ninguna" | "itbisEIsr" | "isr";

export interface PerfilEcf {
  comprador: ModoComprador;
  vencimientoSecuencia: boolean;
  indicadorNotaCredito: boolean;
  tipoIngresos: boolean;
  tipoPago: boolean;
  formasPago: boolean;
  exigeReferencia: boolean;
  soloExento: boolean;
  tasaCero: boolean;
  indicadorMontoGravado: boolean;
  indicadorCeroSinGravado: boolean;
  retencion: Retencion;
}

const VENTA: PerfilEcf = {
  comprador: "identificado",
  vencimientoSecuencia: true,
  indicadorNotaCredito: false,
  tipoIngresos: true,
  tipoPago: true,
  formasPago: true,
  exigeReferencia: false,
  soloExento: false,
  tasaCero: false,
  indicadorMontoGravado: true,
  indicadorCeroSinGravado: false,
  retencion: "ninguna",
};

const NOTA: PerfilEcf = { ...VENTA, comprador: "opcional", formasPago: false, exigeReferencia: true };

const GASTO: PerfilEcf = { ...VENTA, tipoIngresos: false, tipoPago: false, formasPago: false };

const PERFILES: Partial<Record<TipoEcfEmitible, PerfilEcf>> = {
  "31": VENTA,
  "32": { ...VENTA, comprador: "anonimo", vencimientoSecuencia: false },
  "33": NOTA,
  "34": { ...NOTA, vencimientoSecuencia: false, indicadorNotaCredito: true },
  "41": { ...GASTO, tipoPago: true, formasPago: true, indicadorCeroSinGravado: true, retencion: "itbisEIsr" },
  "43": { ...GASTO, comprador: "ninguno", soloExento: true },
  "44": { ...VENTA, soloExento: true },
  "45": VENTA,
  "46": { ...VENTA, tasaCero: true, indicadorMontoGravado: false },
  "47": { ...GASTO, comprador: "extranjero", soloExento: true, retencion: "isr" },
};

export function perfilDe(tipoEcf: TipoEcfEmitible): PerfilEcf {
  const perfil = PERFILES[tipoEcf];
  if (!perfil) throw new DocumentoFiscalInvalidoError(`El tipo E${tipoEcf} todavía no se puede emitir.`);
  return perfil;
}
