export type AmbienteDgii = "testecf" | "certecf" | "ecf";

export const AMBIENTES_DGII: readonly AmbienteDgii[] = ["testecf", "certecf", "ecf"];

export function esAmbienteDgii(valor: string): valor is AmbienteDgii {
  return (AMBIENTES_DGII as readonly string[]).includes(valor);
}

export interface UrlsDgii {
  semilla: string;
  validarSemilla: string;
  recepcionEcf: string;
  recepcionFc: string;
  consultaResultado: (trackId: string) => string;
  anulacionRangos: string;
  consultaTimbre: string;
  consultaTimbreFc: string;
}

export function urlsDgii(ambiente: AmbienteDgii): UrlsDgii {
  const ecf = `https://ecf.dgii.gov.do/${ambiente}`;
  const fc = `https://fc.dgii.gov.do/${ambiente}`;
  return {
    semilla: `${ecf}/autenticacion/api/autenticacion/semilla`,
    validarSemilla: `${ecf}/autenticacion/api/autenticacion/validarsemilla`,
    recepcionEcf: `${ecf}/recepcion/api/facturaselectronicas`,
    recepcionFc: `${fc}/recepcionfc/api/recepcion/ecf`,
    consultaResultado: (trackId) =>
      `${ecf}/consultaresultado/api/consultas/estado?trackid=${encodeURIComponent(trackId)}`,
    anulacionRangos: `${ecf}/anulacionrangos/api/operaciones/anularrango`,
    consultaTimbre: `${ecf}/consultatimbre`,
    consultaTimbreFc: `${fc}/consultatimbrefc`,
  };
}
