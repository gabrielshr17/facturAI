import type { ClienteDgii } from "./dgii-cliente.js";
import type { ClienteContribuyente } from "./entrega.js";
import { DocumentoFiscalInvalidoError } from "./errores.js";
import { leerEcfRecibido } from "./verificacion.js";

export interface SolicitudEntrega {
  encf: string;
  rncComprador: string;
  xmlFirmado: string;
}

export type ResultadoEntrega =
  { electronico: false } | { electronico: true; recibido: boolean; motivo?: number; acuseXml: string };

export interface ServicioEntrega {
  entregar(solicitud: SolicitudEntrega): Promise<ResultadoEntrega>;
}

export interface OpcionesServicioEntrega {
  rncPropio: string;
  dgii: Pick<ClienteDgii, "consultarDirectorio">;
  contribuyente: ClienteContribuyente;
}

/** Entrega al comprador electrónico un e-CF nuestro ya aceptado por la DGII. */
export function crearServicioEntrega(opciones: OpcionesServicioEntrega): ServicioEntrega {
  return {
    async entregar(solicitud) {
      const ecf = leerEcfRecibido(solicitud.xmlFirmado);
      if (!ecf || ecf.rncEmisor !== opciones.rncPropio || ecf.encf !== solicitud.encf) {
        throw new DocumentoFiscalInvalidoError("Solo se entregan e-CF propios que coincidan con el e-NCF indicado.");
      }
      const directorio = await opciones.dgii.consultarDirectorio(solicitud.rncComprador);
      if (!directorio) return { electronico: false };

      const acuse = await opciones.contribuyente.entregarEcf(
        directorio,
        solicitud.xmlFirmado,
        `${opciones.rncPropio}${solicitud.encf}.xml`,
      );
      return acuse.recibido
        ? { electronico: true, recibido: true, acuseXml: acuse.xml }
        : { electronico: true, recibido: false, motivo: acuse.motivo, acuseXml: acuse.xml };
    },
  };
}
