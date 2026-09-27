import type { AlmacenRecepcion, FilaEcfRecibido } from "./recepcion/almacen.js";
import type { ClienteDgii, RespuestaAnulacion } from "./dgii-cliente.js";
import type { ClienteContribuyente } from "./entrega.js";
import { DocumentoFiscalInvalidoError } from "./errores.js";
import { construirXmlAcecf } from "./xml/acecf.js";

export interface RespuestaComercial {
  aprobado: boolean;
  motivo?: string | null;
}

export interface ResultadoRespuestaComercial {
  dgii: RespuestaAnulacion;
  emisor: { entregada: true } | { entregada: false; detalle: string };
}

export interface ServicioRecibidos {
  listar(): Promise<FilaEcfRecibido[]>;
  responder(id: string, respuesta: RespuestaComercial): Promise<ResultadoRespuestaComercial>;
  marcarImportado(id: string): Promise<void>;
}

export interface OpcionesServicioRecibidos {
  rncPropio: string;
  almacen: AlmacenRecepcion;
  firmar: (xml: string) => string;
  dgii: Pick<ClienteDgii, "enviarAprobacionComercial" | "consultarDirectorio">;
  contribuyente: ClienteContribuyente;
  reloj?: () => Date;
}

/**
 * e-CF que nos emitieron proveedores electrónicos: aprobarlos o rechazarlos comercialmente
 * (ACECF a la DGII y al emisor) y marcarlos cuando ya se registraron como compra en la app.
 */
export function crearServicioRecibidos(opciones: OpcionesServicioRecibidos): ServicioRecibidos {
  const { almacen, dgii, contribuyente } = opciones;
  const reloj = opciones.reloj ?? (() => new Date());

  async function obtener(id: string): Promise<FilaEcfRecibido> {
    const fila = await almacen.obtenerEcfRecibido(id);
    if (!fila) throw new Error(`El e-CF recibido ${id} no existe.`);
    return fila;
  }

  return {
    listar: () => almacen.listarEcfRecibidos(),

    async responder(id, respuesta) {
      const fila = await obtener(id);
      if (fila.estadoAprobacion !== "pendiente") {
        throw new DocumentoFiscalInvalidoError(`Este e-CF ya fue ${fila.estadoAprobacion} comercialmente.`);
      }
      const momento = reloj();
      const xml = opciones.firmar(
        construirXmlAcecf(
          {
            rncEmisor: fila.rncEmisor,
            encf: fila.encf,
            fechaEmision: fila.fechaEmision,
            montoTotal: fila.montoTotal,
            rncComprador: opciones.rncPropio,
            aprobado: respuesta.aprobado,
            motivoRechazo: respuesta.motivo ?? null,
          },
          momento,
        ),
      );
      const nombreArchivo = `${opciones.rncPropio}${fila.encf}.xml`;

      const respuestaDgii = await dgii.enviarAprobacionComercial(xml, nombreArchivo);
      if (!respuestaDgii.aceptada) {
        return { dgii: respuestaDgii, emisor: { entregada: false, detalle: "No se envió: la DGII no la validó." } };
      }
      await almacen.registrarAprobacionEmitida(id, {
        aprobado: respuesta.aprobado,
        motivo: respuesta.motivo?.trim() || null,
        xml,
        enviadaAt: momento.toISOString(),
      });

      let emisor: ResultadoRespuestaComercial["emisor"];
      try {
        const directorio = await dgii.consultarDirectorio(fila.rncEmisor);
        emisor = directorio
          ? await contribuyente.entregarAprobacion(directorio, xml, nombreArchivo)
          : { entregada: false, detalle: "El emisor no aparece en el directorio de la DGII." };
      } catch (error) {
        emisor = { entregada: false, detalle: error instanceof Error ? error.message : String(error) };
      }
      return { dgii: respuestaDgii, emisor };
    },

    async marcarImportado(id) {
      await obtener(id);
      await almacen.marcarImportado(id, reloj().toISOString());
    },
  };
}
