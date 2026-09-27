import type { ClienteDgii } from "../dgii-cliente.js";
import { codigoSeguridad } from "../codigo-seguridad.js";
import { fechaHoraDgii } from "../formato.js";
import { cargarEsquema, type NombreEsquema } from "./esquema.js";
import { generarXmlDesdeFila, type FilaSetPruebas } from "./generador.js";
import { erroresContraXsd } from "./validar-xsd.js";

const UMBRAL_RESUMEN_CONSUMO = 250_000;
const TIPOS_ECF = new Set(["31", "32", "33", "34", "41", "43", "44", "45", "46", "47"]);

export type DgiiSetPruebas = Pick<
  ClienteDgii,
  "enviarEcf" | "consultarResultado" | "enviarRfce" | "enviarAprobacionComercial"
>;

export interface DependenciasSetPruebas {
  firmar: (xml: string) => string;
  dgii: DgiiSetPruebas;
  /** false = simulacro: genera, firma y valida, pero no envía nada a la DGII. */
  enviar: boolean;
  reloj?: () => Date;
}

export interface EnvioSetPruebas {
  ruta: "ecf" | "rfce" | "acecf";
  estado: string;
  trackId?: string;
  mensajes: string[];
}

export interface ResultadoFilaSetPruebas {
  fila: number;
  esquema: NombreEsquema | null;
  encf: string | null;
  nombreArchivo: string | null;
  xmlFirmado: string;
  erroresXsd: string[];
  columnasSinUsar: string[];
  envio?: EnvioSetPruebas;
  error?: string;
}

function esquemaDeFila(fila: FilaSetPruebas): NombreEsquema | null {
  const tipo = fila.TipoeCF?.trim();
  if (tipo && TIPOS_ECF.has(tipo)) return `ecf-${tipo}` as NombreEsquema;
  if (fila.FechaHoraAprobacionComercial !== undefined || (fila.Estado !== undefined && fila.RNCComprador && !tipo)) {
    return "acecf";
  }
  return null;
}

/**
 * Procesa una fila del set de pruebas DGII (Paso 2 y 3 de la certificación): genera el XML en el
 * orden del XSD, lo firma, lo valida localmente y, si `enviar`, lo remite por la misma vía que usa
 * la emisión real (RFCE para consumo < RD$250,000, recepción e-CF para el resto, aprobación comercial).
 * Una fila inválida nunca se envía: se reporta para corregir el mapeo antes de gastar el intento.
 */
export async function procesarFilaSetPruebas(
  filaOriginal: FilaSetPruebas,
  numero: number,
  deps: DependenciasSetPruebas,
): Promise<ResultadoFilaSetPruebas> {
  const reloj = deps.reloj ?? (() => new Date());
  const esquema = esquemaDeFila(filaOriginal);
  const base = { fila: numero, esquema, encf: filaOriginal.eNCF?.trim() || null, nombreArchivo: null };
  if (!esquema) {
    return {
      ...base,
      xmlFirmado: "",
      erroresXsd: [],
      columnasSinUsar: [],
      error: "No se reconoce el tipo de documento: falta TipoeCF o las columnas de aprobación comercial.",
    };
  }

  const fila: FilaSetPruebas = { ...filaOriginal };
  const momento = fechaHoraDgii(reloj());
  if (esquema === "acecf") fila.FechaHoraAprobacionComercial ||= momento;
  else fila.FechaHoraFirma ||= momento;

  const { xml, columnasSinUsar } = generarXmlDesdeFila(cargarEsquema(esquema), fila);
  const xmlFirmado = deps.firmar(xml);
  const erroresXsd = await erroresContraXsd(xmlFirmado, esquema);
  const rncArchivo = esquema === "acecf" ? fila.RNCComprador : fila.RNCEmisor;
  const nombreArchivo = `${rncArchivo ?? ""}${fila.eNCF ?? ""}.xml`;
  const resultado: ResultadoFilaSetPruebas = { ...base, nombreArchivo, xmlFirmado, erroresXsd, columnasSinUsar };
  if (!deps.enviar || erroresXsd.length > 0) return resultado;

  try {
    if (esquema === "acecf") {
      const r = await deps.dgii.enviarAprobacionComercial(xmlFirmado, nombreArchivo);
      resultado.envio = { ruta: "acecf", estado: r.aceptada ? "aceptado" : "rechazado", mensajes: r.mensajes };
    } else if (esquema === "ecf-32" && Number(fila.MontoTotal) < UMBRAL_RESUMEN_CONSUMO) {
      const rfce = generarXmlDesdeFila(cargarEsquema("rfce-32"), {
        ...fila,
        CodigoSeguridadeCF: codigoSeguridad(xmlFirmado),
      });
      const rfceFirmado = deps.firmar(rfce.xml);
      const erroresRfce = await erroresContraXsd(rfceFirmado, "rfce-32");
      if (erroresRfce.length > 0) {
        resultado.erroresXsd = erroresRfce.map((e) => `RFCE: ${e}`);
        return resultado;
      }
      const r = await deps.dgii.enviarRfce(rfceFirmado, nombreArchivo);
      resultado.envio = { ruta: "rfce", estado: r.estado, mensajes: r.mensajes };
    } else {
      const { trackId } = await deps.dgii.enviarEcf(xmlFirmado, nombreArchivo);
      const r = await deps.dgii.consultarResultado(trackId);
      resultado.envio = { ruta: "ecf", estado: r.estado, trackId, mensajes: r.mensajes };
    }
  } catch (error) {
    resultado.error = error instanceof Error ? error.message : String(error);
  }
  return resultado;
}
