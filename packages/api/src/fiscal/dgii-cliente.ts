import { urlsDgii, type AmbienteDgii } from "./ambiente.js";
import { firmarXml, type CertificadoFirma } from "./firma.js";
import { DgiiNoDisponibleError, DgiiRespuestaError } from "./errores.js";
import { interpretarRespuestaAprobacion, type RespuestaAprobacion } from "./respuesta-aprobacion.js";

export type EstadoDgiiRespuesta = "no_encontrado" | "aceptado" | "rechazado" | "en_proceso" | "aceptado_condicional";

export interface RespuestaEstado {
  estado: EstadoDgiiRespuesta;
  mensajes: string[];
  secuenciaUtilizada: boolean;
}

export interface RespuestaAnulacion {
  aceptada: boolean;
  mensajes: string[];
}

export interface ClienteDgii {
  enviarEcf(xmlFirmado: string, nombreArchivo: string): Promise<{ trackId: string }>;
  enviarRfce(xmlFirmado: string, nombreArchivo: string): Promise<RespuestaEstado>;
  consultarResultado(trackId: string): Promise<RespuestaEstado>;
  anularRangos(xmlFirmado: string, nombreArchivo: string): Promise<RespuestaAnulacion>;
  enviarAprobacionComercial(xmlFirmado: string, nombreArchivo: string): Promise<RespuestaAprobacion>;
  consultarDirectorio(rnc: string): Promise<DirectorioContribuyente | null>;
  consultarTrackIds(rncEmisor: string, encf: string): Promise<TrackIdRegistrado[]>;
  /** Validez de un e-CF ante la DGII (rol receptor): confirma que el documento con ese código de seguridad existe. */
  consultarEstadoEcf(
    rncEmisor: string,
    encf: string,
    rncComprador: string,
    codigoSeguridad: string,
  ): Promise<{ estado: EstadoDgiiRespuesta; montoTotal: number | null }>;
}

export interface DirectorioContribuyente {
  urlRecepcion: string;
  urlAceptacion: string;
  urlAutenticacion: string | null;
}

export interface TrackIdRegistrado {
  trackId: string;
  estado: EstadoDgiiRespuesta;
}

export interface OpcionesClienteDgii {
  ambiente: AmbienteDgii;
  certificado: CertificadoFirma;
  fetch?: typeof fetch;
  reloj?: () => Date;
  timeoutMs?: number;
}

const MARGEN_RENOVACION_TOKEN_MS = 60_000;

const ESTADO_POR_CODIGO: Record<number, EstadoDgiiRespuesta> = {
  0: "no_encontrado",
  1: "aceptado",
  2: "rechazado",
  3: "en_proceso",
  4: "aceptado_condicional",
};

interface MensajeDgii {
  codigo?: string | number;
  valor?: string;
}

interface CuerpoEstado {
  codigo?: number | string;
  estado?: string;
  mensajes?: MensajeDgii[] | string[];
  secuenciaUtilizada?: boolean;
}

function estadoDesdeTexto(estado: string | undefined): EstadoDgiiRespuesta | null {
  const normalizado = (estado ?? "").toLowerCase();
  if (normalizado.includes("condicional")) return "aceptado_condicional";
  if (normalizado.includes("aceptado")) return "aceptado";
  if (normalizado.includes("rechazado")) return "rechazado";
  if (normalizado.includes("proceso")) return "en_proceso";
  if (normalizado.includes("no encontrado")) return "no_encontrado";
  return null;
}

function traducirMensajes(mensajes: CuerpoEstado["mensajes"]): string[] {
  return (mensajes ?? []).map((m) => {
    if (typeof m === "string") return m;
    return m.codigo !== undefined && m.codigo !== "" ? `${m.codigo}: ${m.valor ?? ""}` : (m.valor ?? "");
  });
}

function traducirEstado(cuerpo: CuerpoEstado): RespuestaEstado {
  const codigo = Number(cuerpo.codigo);
  const estado = ESTADO_POR_CODIGO[codigo] ?? estadoDesdeTexto(cuerpo.estado);
  if (estado === null) {
    const cruda = JSON.stringify(cuerpo).slice(0, 400);
    throw new DgiiRespuestaError(`La DGII respondió algo que no se pudo interpretar: ${cruda}`, 200, cruda);
  }
  return {
    estado,
    mensajes: traducirMensajes(cuerpo.mensajes),
    secuenciaUtilizada: cuerpo.secuenciaUtilizada ?? false,
  };
}

function archivoXml(xml: string, nombre: string): FormData {
  const formulario = new FormData();
  formulario.append("xml", new File([xml], nombre, { type: "text/xml" }));
  return formulario;
}

export function crearClienteDgii(opciones: OpcionesClienteDgii): ClienteDgii {
  const urls = urlsDgii(opciones.ambiente);
  const hacerFetch = opciones.fetch ?? fetch;
  const reloj = opciones.reloj ?? (() => new Date());
  const timeoutMs = opciones.timeoutMs ?? 20_000;
  let token: { valor: string; expira: number } | null = null;

  async function solicitar(url: string, init: RequestInit): Promise<Response> {
    let respuesta: Response;
    try {
      respuesta = await hacerFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new DgiiNoDisponibleError(`No se pudo contactar a la DGII (${url}).`, error);
    }
    if (respuesta.status >= 500) {
      throw new DgiiNoDisponibleError(`La DGII respondió ${respuesta.status} (${url}).`);
    }
    return respuesta;
  }

  async function exigirOk(respuesta: Response, url: string): Promise<Response> {
    if (!respuesta.ok) {
      const cuerpo = await respuesta.text();
      throw new DgiiRespuestaError(
        `La DGII respondió ${respuesta.status} (${url}): ${cuerpo}`,
        respuesta.status,
        cuerpo,
      );
    }
    return respuesta;
  }

  async function autenticar(): Promise<string> {
    const semilla = await exigirOk(await solicitar(urls.semilla, { method: "GET" }), urls.semilla);
    const semillaFirmada = firmarXml(await semilla.text(), opciones.certificado);
    const respuesta = await exigirOk(
      await solicitar(urls.validarSemilla, {
        method: "POST",
        headers: { accept: "application/json" },
        body: archivoXml(semillaFirmada, "semilla.xml"),
      }),
      urls.validarSemilla,
    );
    const cuerpo = (await respuesta.json()) as { token?: string; expira?: string };
    if (!cuerpo.token) throw new DgiiRespuestaError("La DGII no devolvió token de autenticación.", 200, "");
    const expira = cuerpo.expira ? new Date(cuerpo.expira).getTime() : reloj().getTime() + 55 * 60_000;
    token = { valor: cuerpo.token, expira };
    return cuerpo.token;
  }

  async function tokenVigente(): Promise<string> {
    if (token && token.expira - MARGEN_RENOVACION_TOKEN_MS > reloj().getTime()) return token.valor;
    return autenticar();
  }

  async function conToken(url: string, init: () => RequestInit): Promise<Response> {
    const intentar = async (valorToken: string) =>
      solicitar(url, {
        ...init(),
        headers: { accept: "application/json", authorization: `Bearer ${valorToken}` },
      });
    let respuesta = await intentar(await tokenVigente());
    if (respuesta.status === 401) {
      token = null;
      respuesta = await intentar(await autenticar());
    }
    return exigirOk(respuesta, url);
  }

  return {
    async enviarEcf(xmlFirmado, nombreArchivo) {
      const respuesta = await conToken(urls.recepcionEcf, () => ({
        method: "POST",
        body: archivoXml(xmlFirmado, nombreArchivo),
      }));
      const cuerpo = (await respuesta.json()) as { trackId?: string; error?: string; mensaje?: string };
      if (!cuerpo.trackId) {
        const detalle = [cuerpo.error, cuerpo.mensaje].filter(Boolean).join(" — ");
        throw new DgiiRespuestaError(
          `La DGII no asignó trackId: ${detalle || "sin detalle"}`,
          200,
          JSON.stringify(cuerpo),
        );
      }
      return { trackId: cuerpo.trackId };
    },

    async enviarRfce(xmlFirmado, nombreArchivo) {
      const respuesta = await conToken(urls.recepcionFc, () => ({
        method: "POST",
        body: archivoXml(xmlFirmado, nombreArchivo),
      }));
      return traducirEstado((await respuesta.json()) as CuerpoEstado);
    },

    async consultarResultado(trackId) {
      const url = urls.consultaResultado(trackId);
      const respuesta = await conToken(url, () => ({ method: "GET" }));
      return traducirEstado((await respuesta.json()) as CuerpoEstado);
    },

    async anularRangos(xmlFirmado, nombreArchivo) {
      const respuesta = await conToken(urls.anulacionRangos, () => ({
        method: "POST",
        body: archivoXml(xmlFirmado, nombreArchivo),
      }));
      const cuerpo = (await respuesta.json()) as { codigo?: string | number; nombre?: string; mensajes?: string[] };
      const aceptada = String(cuerpo.codigo) === "1" || (cuerpo.nombre ?? "").toLowerCase().includes("aceptad");
      return { aceptada, mensajes: cuerpo.mensajes ?? [] };
    },

    async enviarAprobacionComercial(xmlFirmado, nombreArchivo) {
      const respuesta = await conToken(urls.aprobacionComercial, () => ({
        method: "POST",
        body: archivoXml(xmlFirmado, nombreArchivo),
      }));
      return interpretarRespuestaAprobacion(await respuesta.text());
    },

    async consultarDirectorio(rnc) {
      let respuesta: Response;
      try {
        respuesta = await conToken(urls.directorioPorRnc(rnc), () => ({ method: "GET" }));
      } catch (error) {
        if (error instanceof DgiiRespuestaError && error.status === 404) return null;
        throw error;
      }
      const cuerpo = (await respuesta.json()) as
        | { urlRecepcion?: string; urlAceptacion?: string; urlOpcional?: string }
        | { urlRecepcion?: string; urlAceptacion?: string; urlOpcional?: string }[];
      const entrada = Array.isArray(cuerpo) ? cuerpo[0] : cuerpo;
      if (!entrada?.urlRecepcion || !entrada.urlAceptacion) return null;
      return {
        urlRecepcion: entrada.urlRecepcion,
        urlAceptacion: entrada.urlAceptacion,
        urlAutenticacion: entrada.urlOpcional || null,
      };
    },

    async consultarEstadoEcf(rncEmisor, encf, rncComprador, codigo) {
      const url = urls.consultaEstadoEcf(rncEmisor, encf, rncComprador, codigo);
      const respuesta = await conToken(url, () => ({ method: "GET" }));
      const cuerpo = (await respuesta.json()) as {
        codigo?: number | string;
        estado?: string;
        montoTotal?: number | string;
      };
      const estado = traducirEstado({ codigo: cuerpo.codigo, estado: cuerpo.estado }).estado;
      const monto = cuerpo.montoTotal === undefined || cuerpo.montoTotal === null ? NaN : Number(cuerpo.montoTotal);
      return { estado, montoTotal: estado === "no_encontrado" || Number.isNaN(monto) ? null : monto };
    },

    async consultarTrackIds(rncEmisor, encf) {
      const respuesta = await conToken(urls.consultaTrackIds(rncEmisor, encf), () => ({ method: "GET" }));
      const cuerpo = (await respuesta.json()) as
        { trackId?: string | null; estado?: string }[] | { trackId?: string | null; estado?: string };
      const lista = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
      return lista
        .filter((t): t is { trackId: string; estado?: string } => Boolean(t.trackId))
        .map((t) => ({ trackId: t.trackId, estado: estadoDesdeTexto(t.estado) ?? "no_encontrado" }));
    },
  };
}
