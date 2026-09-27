import type { ComprobanteATransmitir, EstadoTransmision, ResultadoTransmision } from "@sfr/core";
import type { AmbienteDgii } from "./ambiente.js";
import type { ClienteDgii, RespuestaAnulacion, RespuestaEstado } from "./dgii-cliente.js";
import { firmarXml, type CertificadoFirma } from "./firma.js";
import { codigoSeguridad } from "./codigo-seguridad.js";
import { fechaDgii, fechaHoraDgii } from "./formato.js";
import { urlConsultaTimbre, urlConsultaTimbreFc } from "./qr.js";
import { construirXmlEcf, esConsumoResumible } from "./xml/ecf.js";
import { construirXmlRfce } from "./xml/rfce.js";
import { construirXmlAnecf, type RangoAnulacion } from "./xml/anecf.js";
import { calcularTotalesEcf } from "./xml/totales.js";

export interface ServicioEmision {
  emitir(doc: ComprobanteATransmitir): Promise<ResultadoTransmision>;
  consultar(trackId: string): Promise<{ estado: EstadoTransmision; motivoRechazo?: string }>;
  anular(rncEmisor: string, rangos: RangoAnulacion[]): Promise<RespuestaAnulacion>;
}

export interface OpcionesServicioEmision {
  ambiente: AmbienteDgii;
  certificado: CertificadoFirma;
  cliente: ClienteDgii;
  reloj?: () => Date;
}

function estadoTransmision(respuesta: RespuestaEstado, siNoEncontrado: EstadoTransmision): EstadoTransmision {
  return respuesta.estado === "no_encontrado" ? siNoEncontrado : respuesta.estado;
}

function conMotivo(
  estado: EstadoTransmision,
  mensajes: string[],
): { estado: EstadoTransmision; motivoRechazo?: string } {
  if (estado !== "rechazado") return { estado };
  return { estado, motivoRechazo: mensajes.join("; ") || "La DGII no indicó el motivo." };
}

export function crearServicioEmision(opciones: OpcionesServicioEmision): ServicioEmision {
  const { ambiente, certificado, cliente } = opciones;
  const reloj = opciones.reloj ?? (() => new Date());
  const firmar = (xml: string) => firmarXml(xml, certificado);

  return {
    async emitir(doc) {
      const momentoFirma = reloj();
      const ecfFirmado = firmar(construirXmlEcf(doc, momentoFirma));
      const codigo = codigoSeguridad(ecfFirmado);
      const fechaFirma = fechaHoraDgii(momentoFirma);
      const montoTotal = calcularTotalesEcf(doc.lineas).montoTotal;
      const nombreArchivo = `${doc.emisor.rnc}${doc.ncf}.xml`;
      const comun = { codigoSeguridad: codigo, fechaFirma, xmlFirmado: ecfFirmado };

      if (esConsumoResumible(doc)) {
        const rfceFirmado = firmar(construirXmlRfce(doc, codigo));
        const respuesta = await cliente.enviarRfce(rfceFirmado, nombreArchivo);
        return {
          ...comun,
          ...conMotivo(estadoTransmision(respuesta, "rechazado"), respuesta.mensajes),
          qrUrl: urlConsultaTimbreFc(ambiente, {
            rncEmisor: doc.emisor.rnc,
            encf: doc.ncf,
            montoTotal,
            codigoSeguridad: codigo,
          }),
        };
      }

      const { trackId } = await cliente.enviarEcf(ecfFirmado, nombreArchivo);
      let resultado: { estado: EstadoTransmision; motivoRechazo?: string } = { estado: "en_proceso" };
      try {
        const respuesta = await cliente.consultarResultado(trackId);
        resultado = conMotivo(estadoTransmision(respuesta, "en_proceso"), respuesta.mensajes);
      } catch (error) {
        console.warn(`No se pudo consultar el trackId ${trackId}; queda en proceso.`, error);
      }

      return {
        ...comun,
        ...resultado,
        trackId,
        qrUrl: urlConsultaTimbre(ambiente, {
          rncEmisor: doc.emisor.rnc,
          rncComprador: doc.receptorDocumentoNumero,
          encf: doc.ncf,
          fechaEmision: fechaDgii(doc.fechaEmision),
          montoTotal,
          fechaFirma,
          codigoSeguridad: codigo,
        }),
      };
    },

    async consultar(trackId) {
      const respuesta = await cliente.consultarResultado(trackId);
      return conMotivo(estadoTransmision(respuesta, "en_proceso"), respuesta.mensajes);
    },

    async anular(rncEmisor, rangos) {
      const xml = firmar(construirXmlAnecf(rncEmisor, rangos, reloj()));
      return cliente.anularRangos(xml, `${rncEmisor}${rangos[0]?.desde ?? ""}.xml`);
    },
  };
}
