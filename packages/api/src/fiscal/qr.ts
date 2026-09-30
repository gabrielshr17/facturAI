import { urlsDgii, type AmbienteDgii } from "./ambiente.js";
import { montoDgii } from "./formato.js";

export interface DatosTimbre {
  rncEmisor: string;
  rncComprador: string | null;
  encf: string;
  fechaEmision: string;
  montoTotal: number;
  fechaFirma: string;
  codigoSeguridad: string;
}

export interface DatosTimbreFc {
  rncEmisor: string;
  encf: string;
  montoTotal: number;
  codigoSeguridad: string;
}

function valorQuery(valor: string): string {
  return encodeURIComponent(valor).replace(/%3A/g, ":");
}

function armarQuery(pares: [string, string | null][]): string {
  return pares
    .filter((par): par is [string, string] => par[1] !== null && par[1] !== "")
    .map(([clave, valor]) => `${clave}=${valorQuery(valor)}`)
    .join("&");
}

export function urlConsultaTimbre(ambiente: AmbienteDgii, datos: DatosTimbre): string {
  const query = armarQuery([
    ["rncemisor", datos.rncEmisor],
    ["rnccomprador", datos.rncComprador],
    ["encf", datos.encf],
    ["fechaemision", datos.fechaEmision],
    ["montototal", montoDgii(datos.montoTotal)],
    ["fechafirma", datos.fechaFirma],
    ["codigoseguridad", datos.codigoSeguridad],
  ]);
  return `${urlsDgii(ambiente).consultaTimbre}?${query}`;
}

export function urlConsultaTimbreFc(ambiente: AmbienteDgii, datos: DatosTimbreFc): string {
  const query = armarQuery([
    ["rncemisor", datos.rncEmisor],
    ["encf", datos.encf],
    ["montototal", montoDgii(datos.montoTotal)],
    ["codigoseguridad", datos.codigoSeguridad],
  ]);
  return `${urlsDgii(ambiente).consultaTimbreFc}?${query}`;
}
