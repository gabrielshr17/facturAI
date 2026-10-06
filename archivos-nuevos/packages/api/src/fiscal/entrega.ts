import type { DirectorioContribuyente } from "./dgii-cliente.js";
import { DgiiNoDisponibleError } from "./errores.js";
import { valorEtiqueta } from "./verificacion.js";
import type { MotivoNoRecibido } from "./xml/arecf.js";

export interface AcuseEntrega {
  recibido: boolean;
  motivo?: MotivoNoRecibido;
  xml: string;
}

export interface ClienteContribuyente {
  entregarEcf(directorio: DirectorioContribuyente, xmlFirmado: string, nombreArchivo: string): Promise<AcuseEntrega>;
  entregarAprobacion(
    directorio: DirectorioContribuyente,
    xmlFirmado: string,
    nombreArchivo: string,
  ): Promise<{ entregada: true } | { entregada: false; detalle: string }>;
}

export interface OpcionesClienteContribuyente {
  firmar: (xml: string) => string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function unir(host: string, ruta: string): string {
  return `${host.replace(/\/+$/, "")}${ruta}`;
}

function archivoXml(xml: string, nombre: string): FormData {
  const formulario = new FormData();
  formulario.append("xml", new File([xml], nombre, { type: "text/xml" }));
  return formulario;
}

/**
 * Comunicación emisor-receptor entre contribuyentes (Descripción Técnica Emisores Electrónicos):
 * las rutas son fijas y solo cambia el host que publica el directorio de la DGII. Si el otro
 * contribuyente declaró servicio de autenticación, primero se obtiene su token con la semilla
 * firmada con nuestro certificado.
 */
export function crearClienteContribuyente(opciones: OpcionesClienteContribuyente): ClienteContribuyente {
  const hacerFetch = opciones.fetch ?? fetch;
  const timeoutMs = opciones.timeoutMs ?? 20_000;

  async function solicitar(url: string, init: RequestInit): Promise<Response> {
    try {
      return await hacerFetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw new DgiiNoDisponibleError(`No se pudo contactar al contribuyente (${url}).`, error);
    }
  }

  async function token(directorio: DirectorioContribuyente): Promise<string | null> {
    if (!directorio.urlAutenticacion) return null;
    const semilla = await solicitar(unir(directorio.urlAutenticacion, "/fe/autenticacion/api/semilla"), {
      method: "GET",
    });
    if (!semilla.ok) throw new Error(`El contribuyente no entregó semilla (${semilla.status}).`);
    const respuesta = await solicitar(
      unir(directorio.urlAutenticacion, "/fe/autenticacion/api/validacioncertificado"),
      {
        method: "POST",
        headers: { accept: "application/json" },
        body: archivoXml(opciones.firmar(await semilla.text()), "semilla.xml"),
      },
    );
    if (!respuesta.ok) throw new Error(`El contribuyente rechazó nuestra autenticación (${respuesta.status}).`);
    const cuerpo = (await respuesta.json()) as { token?: string };
    if (!cuerpo.token) throw new Error("El contribuyente no devolvió token.");
    return cuerpo.token;
  }

  async function enviar(url: string, directorio: DirectorioContribuyente, xml: string, nombre: string) {
    const valorToken = await token(directorio);
    return solicitar(url, {
      method: "POST",
      headers: valorToken ? { authorization: `Bearer ${valorToken}` } : {},
      body: archivoXml(xml, nombre),
    });
  }

  return {
    async entregarEcf(directorio, xmlFirmado, nombreArchivo) {
      const respuesta = await enviar(
        unir(directorio.urlRecepcion, "/fe/recepcion/api/ecf"),
        directorio,
        xmlFirmado,
        nombreArchivo,
      );
      const xml = await respuesta.text();
      const estado = respuesta.ok ? valorEtiqueta(xml, "Estado") : null;
      if (estado === null) throw new Error(`El contribuyente no devolvió acuse de recibo (${respuesta.status}).`);
      if (estado === "0") return { recibido: true, xml };
      const motivo = Number(valorEtiqueta(xml, "CodigoMotivoNoRecibido")) as MotivoNoRecibido;
      return { recibido: false, motivo, xml };
    },

    async entregarAprobacion(directorio, xmlFirmado, nombreArchivo) {
      const respuesta = await enviar(
        unir(directorio.urlAceptacion, "/fe/aprobacioncomercial/api/ecf"),
        directorio,
        xmlFirmado,
        nombreArchivo,
      );
      if (respuesta.ok) return { entregada: true };
      return { entregada: false, detalle: `El emisor respondió ${respuesta.status}: ${await respuesta.text()}` };
    },
  };
}
