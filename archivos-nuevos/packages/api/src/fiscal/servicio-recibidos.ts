import type { AlmacenRecepcion, FilaEcfRecibido } from "./recepcion/almacen.js";
import type { ClienteDgii, RespuestaAnulacion } from "./dgii-cliente.js";
import type { ClienteContribuyente } from "./entrega.js";
import { DocumentoFiscalInvalidoError } from "./errores.js";
import { construirXmlAcecf } from "./xml/acecf.js";
import { leerItemsEcf, type ItemEcf } from "./verificacion.js";
import { codigoSeguridad } from "./codigo-seguridad.js";

export interface RespuestaComercial {
  aprobado: boolean;
  motivo?: string | null;
}

export interface ResultadoRespuestaComercial {
  dgii: RespuestaAnulacion;
  emisor: { entregada: true } | { entregada: false; detalle: string };
}

export interface DetalleRecibido {
  recibido: FilaEcfRecibido;
  items: ItemEcf[];
}

export interface ServicioRecibidos {
  listar(): Promise<FilaEcfRecibido[]>;
  detalle(id: string): Promise<DetalleRecibido>;
  responder(id: string, respuesta: RespuestaComercial): Promise<ResultadoRespuestaComercial>;
  marcarImportado(id: string): Promise<void>;
}

export interface OpcionesServicioRecibidos {
  rncPropio: string;
  almacen: AlmacenRecepcion;
  firmar: (xml: string) => string;
  dgii: Pick<ClienteDgii, "enviarAprobacionComercial" | "consultarDirectorio" | "consultarEstadoEcf">;
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

  /**
   * Cualquiera puede enviar a nuestro servicio de recepción un XML firmado con un certificado
   * autofirmado. Antes de aprobarlo o registrarlo como compra se confirma con la DGII que ese e-CF
   * existe, es válido y lleva ese mismo código de seguridad (derivado de la firma) y ese monto.
   */
  async function confirmarAnteDgii(fila: FilaEcfRecibido): Promise<string> {
    const xml = await almacen.obtenerXmlEcfRecibido(fila.id);
    if (!xml) throw new Error(`El e-CF recibido ${fila.id} no existe.`);
    let codigo: string;
    try {
      codigo = codigoSeguridad(xml);
    } catch {
      throw new DocumentoFiscalInvalidoError("El e-CF recibido no tiene firma digital.");
    }
    const enDgii = await dgii.consultarEstadoEcf(fila.rncEmisor, fila.encf, opciones.rncPropio, codigo);
    if (enDgii.estado !== "aceptado" && enDgii.estado !== "aceptado_condicional") {
      throw new DocumentoFiscalInvalidoError(
        `La DGII no reconoce este e-CF como válido (estado: ${enDgii.estado}). No lo apruebes ni lo registres como compra.`,
      );
    }
    if (enDgii.montoTotal !== null && Math.abs(enDgii.montoTotal - fila.montoTotal) > 0.01) {
      throw new DocumentoFiscalInvalidoError(
        `El monto del e-CF (RD$ ${fila.montoTotal}) no coincide con el registrado en la DGII (RD$ ${enDgii.montoTotal}).`,
      );
    }
    return xml;
  }

  return {
    listar: () => almacen.listarEcfRecibidos(),

    async detalle(id) {
      const recibido = await obtener(id);
      const xml = await confirmarAnteDgii(recibido);
      return { recibido, items: leerItemsEcf(xml) };
    },

    async responder(id, respuesta) {
      const fila = await obtener(id);
      if (fila.estadoAprobacion !== "pendiente") {
        throw new DocumentoFiscalInvalidoError(`Este e-CF ya fue ${fila.estadoAprobacion} comercialmente.`);
      }
      await confirmarAnteDgii(fila);
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

      if (!(await almacen.reservarRespuesta(id))) {
        throw new DocumentoFiscalInvalidoError(
          "Este e-CF ya se está respondiendo desde otra caja o ya fue respondido.",
        );
      }
      let respuestaDgii: RespuestaAnulacion;
      try {
        respuestaDgii = await dgii.enviarAprobacionComercial(xml, nombreArchivo);
      } catch (error) {
        await almacen.liberarRespuesta(id);
        throw error;
      }
      if (!respuestaDgii.aceptada) {
        await almacen.liberarRespuesta(id);
        return { dgii: respuestaDgii, emisor: { entregada: false, detalle: "No se envió: la DGII no la validó." } };
      }
      try {
        await almacen.registrarAprobacionEmitida(id, {
          aprobado: respuesta.aprobado,
          motivo: respuesta.motivo?.trim() || null,
          xml,
          enviadaAt: momento.toISOString(),
        });
      } catch (error) {
        throw new Error(
          `La DGII ya recibió la respuesta comercial de ${fila.encf}, pero no se pudo guardar: no la vuelvas a enviar. ` +
            `Detalle: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

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
