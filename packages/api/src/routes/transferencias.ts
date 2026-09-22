import type { FastifyPluginAsync } from "fastify";
import { dbDisponible } from "../services/db.js";
import { listarRecientes, actualizarEstado } from "../services/transferencias.js";

const ERROR_NO_CONFIGURADO = "Las transferencias no están configuradas: falta el proyecto Supabase en el backend.";

/**
 * Últimas transferencias recibidas por correo del banco (§ plan.md). Solo depende de
 * `dbDisponible()` (Supabase), no de `transferenciasDisponible()` (que también exige Gmail): sin
 * Gmail el poller simplemente no agrega filas nuevas, pero las que ya existan siguen pudiendo
 * listarse/confirmarse/descartarse.
 */
export const rutaTransferencias: FastifyPluginAsync = async (app) => {
  app.get("/transferencias/recientes", async (_request, reply) => {
    if (!dbDisponible()) {
      await reply.code(501).send({ error: ERROR_NO_CONFIGURADO });
      return;
    }
    try {
      const transferencias = await listarRecientes();
      return { transferencias };
    } catch (e) {
      app.log.error(e);
      await reply.code(502).send({ error: "No se pudieron cargar las transferencias. Intenta de nuevo." });
    }
  });

  app.patch<{ Params: { id: string } }>("/transferencias/:id/confirmar", async (request, reply) => {
    if (!dbDisponible()) {
      await reply.code(501).send({ error: ERROR_NO_CONFIGURADO });
      return;
    }
    try {
      const transferencia = await actualizarEstado(request.params.id, "confirmada");
      if (!transferencia) {
        await reply.code(404).send({ error: "Esa transferencia no existe." });
        return;
      }
      return { transferencia };
    } catch (e) {
      app.log.error(e);
      await reply.code(502).send({ error: "No se pudo confirmar la transferencia. Intenta de nuevo." });
    }
  });

  app.patch<{ Params: { id: string } }>("/transferencias/:id/descartar", async (request, reply) => {
    if (!dbDisponible()) {
      await reply.code(501).send({ error: ERROR_NO_CONFIGURADO });
      return;
    }
    try {
      const transferencia = await actualizarEstado(request.params.id, "descartada");
      if (!transferencia) {
        await reply.code(404).send({ error: "Esa transferencia no existe." });
        return;
      }
      return { transferencia };
    } catch (e) {
      app.log.error(e);
      await reply.code(502).send({ error: "No se pudo descartar la transferencia. Intenta de nuevo." });
    }
  });
};
