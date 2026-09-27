import type { FastifyPluginAsync, FastifyReply } from "fastify";
import type { RespuestaComercial, ServicioRecibidos } from "../fiscal/servicio-recibidos.js";
import { DgiiNoDisponibleError, DgiiRespuestaError, DocumentoFiscalInvalidoError } from "../fiscal/errores.js";

/** e-CF que nos emitieron proveedores (rol receptor). Requiere permiso fiscal (§ server.ts). */
export function rutaRecibidos(servicio: ServicioRecibidos | null): FastifyPluginAsync {
  return async (app) => {
    async function manejar<T>(
      reply: FastifyReply,
      accion: (s: ServicioRecibidos) => Promise<T>,
    ): Promise<T | undefined> {
      if (!servicio) {
        await reply
          .code(503)
          .send({ error: "Recepción de e-CF no disponible: falta el certificado o la base de datos." });
        return undefined;
      }
      try {
        return await accion(servicio);
      } catch (error) {
        if (error instanceof DocumentoFiscalInvalidoError) {
          await reply.code(400).send({ error: error.message });
        } else if (error instanceof Error && /no existe/.test(error.message)) {
          await reply.code(404).send({ error: error.message });
        } else if (error instanceof DgiiNoDisponibleError) {
          await reply.code(503).send({ error: "La DGII no está disponible en este momento. Intenta de nuevo." });
        } else if (error instanceof DgiiRespuestaError) {
          await reply.code(502).send({ error: `La DGII rechazó la solicitud: ${error.cuerpo || error.message}` });
        } else {
          app.log.error(error, "Error inesperado con e-CF recibidos");
          await reply.code(500).send({ error: "Error interno al procesar el e-CF recibido." });
        }
        return undefined;
      }
    }

    app.get("/fiscal/recibidos", async (_request, reply) => {
      const recibidos = await manejar(reply, (s) => s.listar());
      return recibidos === undefined ? undefined : { recibidos };
    });

    app.get<{ Params: { id: string } }>("/fiscal/recibidos/:id", async (request, reply) =>
      manejar(reply, (s) => s.detalle(request.params.id)),
    );

    app.post<{ Params: { id: string }; Body: RespuestaComercial }>(
      "/fiscal/recibidos/:id/respuesta",
      async (request, reply) => {
        if (typeof request.body?.aprobado !== "boolean") {
          await reply.code(400).send({ error: "Indica si el e-CF se aprueba o se rechaza." });
          return;
        }
        return manejar(reply, (s) => s.responder(request.params.id, request.body));
      },
    );

    app.post<{ Params: { id: string } }>("/fiscal/recibidos/:id/importado", async (request, reply) => {
      const hecho = await manejar(reply, async (s) => {
        await s.marcarImportado(request.params.id);
        return true;
      });
      return hecho ? { ok: true } : undefined;
    });
  };
}
