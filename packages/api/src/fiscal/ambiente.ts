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
  aprobacionComercial: string;
  directorioPorRnc: (rnc: string) => string;
  consultaTrackIds: (rncEmisor: string, encf: string) => string;
  consultaEstadoEcf: (rncEmisor: string, encf: string, rncComprador: string, codigoSeguridad: string) => string;
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
    aprobacionComercial: `${ecf}/aprobacioncomercial/api/aprobacioncomercial`,
    directorioPorRnc: (rnc) =>
      `${ecf}/consultadirectorio/api/consultas/obtenerdirectorioporrnc?rnc=${encodeURIComponent(rnc)}`,
    consultaEstadoEcf: (rncEmisor, encf, rncComprador, codigoSeguridad) =>
      `${ecf}/consultaestado/api/consultas/estado?rncemisor=${encodeURIComponent(rncEmisor)}` +
      `&ncfelectronico=${encodeURIComponent(encf)}&rnccomprador=${encodeURIComponent(rncComprador)}` +
      `&codigoseguridad=${encodeURIComponent(codigoSeguridad)}`,
    consultaTrackIds: (rncEmisor, encf) =>
      `${ecf}/consultatrackids/api/trackids/consulta?rncemisor=${encodeURIComponent(rncEmisor)}&encf=${encodeURIComponent(encf)}`,
  };
}
