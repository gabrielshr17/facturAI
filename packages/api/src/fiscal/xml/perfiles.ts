import type { ComprobanteATransmitir } from "@sfr/core";
import { DocumentoFiscalInvalidoError } from "../errores.js";

export type TipoEcfEmitible = ComprobanteATransmitir["tipoEcf"];

export interface PerfilEcf {
  vencimientoSecuencia: boolean;
  indicadorNotaCredito: boolean;
  formasPago: boolean;
  compradorOpcional: boolean;
  compradorIdentificado: boolean;
  exigeReferencia: boolean;
}

const PERFILES: Partial<Record<TipoEcfEmitible, PerfilEcf>> = {
  "31": {
    vencimientoSecuencia: true,
    indicadorNotaCredito: false,
    formasPago: true,
    compradorOpcional: false,
    compradorIdentificado: true,
    exigeReferencia: false,
  },
  "32": {
    vencimientoSecuencia: false,
    indicadorNotaCredito: false,
    formasPago: true,
    compradorOpcional: false,
    compradorIdentificado: false,
    exigeReferencia: false,
  },
  "33": {
    vencimientoSecuencia: true,
    indicadorNotaCredito: false,
    formasPago: false,
    compradorOpcional: true,
    compradorIdentificado: false,
    exigeReferencia: true,
  },
  "34": {
    vencimientoSecuencia: false,
    indicadorNotaCredito: true,
    formasPago: false,
    compradorOpcional: true,
    compradorIdentificado: false,
    exigeReferencia: true,
  },
  "45": {
    vencimientoSecuencia: true,
    indicadorNotaCredito: false,
    formasPago: true,
    compradorOpcional: false,
    compradorIdentificado: true,
    exigeReferencia: false,
  },
};

export function perfilDe(tipoEcf: TipoEcfEmitible): PerfilEcf {
  const perfil = PERFILES[tipoEcf];
  if (!perfil) throw new DocumentoFiscalInvalidoError(`El tipo E${tipoEcf} todavía no se puede emitir.`);
  return perfil;
}
