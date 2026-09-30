import type { ComprobanteATransmitir } from "@sfr/core";
import { DocumentoFiscalInvalidoError } from "../errores.js";

export type TipoEcfEmitible = ComprobanteATransmitir["tipoEcf"];

export interface PerfilEcf {
  vencimientoSecuencia: boolean;
  indicadorNotaCredito: boolean;
  formasPago: boolean;
  compradorOpcional: boolean;
  exigeReferencia: boolean;
}

const PERFILES: Partial<Record<TipoEcfEmitible, PerfilEcf>> = {
  "31": {
    vencimientoSecuencia: true,
    indicadorNotaCredito: false,
    formasPago: true,
    compradorOpcional: false,
    exigeReferencia: false,
  },
  "32": {
    vencimientoSecuencia: false,
    indicadorNotaCredito: false,
    formasPago: true,
    compradorOpcional: false,
    exigeReferencia: false,
  },
  "33": {
    vencimientoSecuencia: false,
    indicadorNotaCredito: false,
    formasPago: false,
    compradorOpcional: true,
    exigeReferencia: true,
  },
  "34": {
    vencimientoSecuencia: false,
    indicadorNotaCredito: true,
    formasPago: false,
    compradorOpcional: true,
    exigeReferencia: true,
  },
};

export function perfilDe(tipoEcf: TipoEcfEmitible): PerfilEcf {
  const perfil = PERFILES[tipoEcf];
  if (!perfil) throw new DocumentoFiscalInvalidoError(`El tipo E${tipoEcf} todavía no se puede emitir.`);
  return perfil;
}
