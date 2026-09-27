import type { FastifyPluginAsync, FastifyReply, FastifyBaseLogger } from "fastify";
import type { ComprobanteATransmitir } from "@sfr/core";
import type { ModuloFiscal } from "../fiscal/iniciar.js";
import type { RangoAnulacion } from "../fiscal/xml/anecf.js";
import { DgiiNoDisponibleError, DgiiRespuestaError, DocumentoFiscalInvalidoError } from "../fiscal/errores.js";

async function responderError(error: unknown, reply: FastifyReply, log: FastifyBaseLogger): Promise<void> {
  if (error instanceof DocumentoFiscalInvalidoError) {
    await reply.code(400).send({ error: error.message });
    return;
  }
  if (error instanceof DgiiNoDisponibleError) {
    log.warn(error, "DGII no disponible");
    await reply.code(503).send({ error: "La DGII no está disponible en este momento. Intenta de nuevo." });
    return;
  }
  if (error instanceof DgiiRespuestaError) {
    log.warn({ status: error.status, cuerpo: error.cuerpo }, "La DGII rechazó la solicitud");
    await reply.code(502).send({ error: `La DGII rechazó la solicitud: ${error.cuerpo || error.message}` });
    return;
  }
  log.error(error, "Error inesperado en el módulo fiscal");
  await reply.code(500).send({ error: "Error interno al procesar el comprobante fiscal." });
}

/**
 * Emisión e-CF directa a la DGII ("Software de Desarrollo Propio"). El cliente
 * sigue siendo dueño de sus datos (SQLite local): este backend solo firma con
 * el .p12 de la empresa y habla con la DGII; no guarda comprobantes.
 */
export function rutaFiscal(modulo: ModuloFiscal): FastifyPluginAsync {
  return async (app) => {
    async function exigirDisponible(reply: FastifyReply): Promise<boolean> {
      if (modulo.disponible) return true;
      await reply.code(503).send({ error: `Facturación electrónica no configurada: ${modulo.motivo}` });
      return false;
    }

    app.get("/fiscal/estado", async () => {
      if (!modulo.disponible) return { disponible: false, ambiente: modulo.ambiente, motivo: modulo.motivo };
      return {
        disponible: true,
        ambiente: modulo.ambiente,
        rncEmisor: modulo.rncEmisor,
        certificadoVence: modulo.certificadoVence.toISOString(),
      };
    });

    app.post<{ Body: ComprobanteATransmitir }>("/fiscal/comprobantes", async (request, reply) => {
      if (!(await exigirDisponible(reply)) || !modulo.disponible) return;
      if (request.body?.emisor?.rnc !== modulo.rncEmisor) {
        await reply.code(403).send({ error: `Este servidor solo firma comprobantes del RNC ${modulo.rncEmisor}.` });
        return;
      }
      try {
        return await modulo.servicio.emitir(request.body);
      } catch (error) {
        await responderError(error, reply, app.log);
      }
    });

    app.get<{ Params: { trackId: string } }>("/fiscal/comprobantes/:trackId", async (request, reply) => {
      if (!(await exigirDisponible(reply)) || !modulo.disponible) return;
      try {
        return await modulo.servicio.consultar(request.params.trackId);
      } catch (error) {
        await responderError(error, reply, app.log);
      }
    });

    app.post<{ Body: { rncEmisor: string; rangos: RangoAnulacion[] } }>(
      "/fiscal/anulaciones",
      async (request, reply) => {
        if (!(await exigirDisponible(reply)) || !modulo.disponible) return;
        if (request.body?.rncEmisor !== modulo.rncEmisor) {
          await reply.code(403).send({ error: `Este servidor solo anula secuencias del RNC ${modulo.rncEmisor}.` });
          return;
        }
        try {
          return await modulo.servicio.anular(request.body.rncEmisor, request.body.rangos);
        } catch (error) {
          await responderError(error, reply, app.log);
        }
      },
    );
  };
}
