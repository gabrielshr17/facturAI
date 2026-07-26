import type { FastifyPluginAsync } from "fastify";
import type { ComprobanteATransmitir } from "@sfr/core";

/**
 * Endpoint de transmisión e-CF a la DGII (§ Módulo fiscal).
 *
 * *** SIN IMPLEMENTAR *** — sigue pendiente la decisión "PAC certificado vs.
 * integración directa al API de la DGII" (ver plan.md, "Decisiones aún
 * pendientes"). Responde 501 explícito en vez de simular una respuesta que
 * podría confundirse con una transmisión real; el cliente hoy usa
 * `crearProveedorFiscalSimulado()` de `@sfr/core` para desarrollo/pruebas.
 *
 * Cuando se implemente: recibir `ComprobanteATransmitir`, construir y firmar
 * el XML, transmitir (vía PAC o DGII directo), y devolver `ResultadoTransmision`.
 */
export const rutaFiscal: FastifyPluginAsync = async (app) => {
  app.post<{ Body: ComprobanteATransmitir }>("/fiscal/transmitir", async (_request, reply) => {
    await reply.code(501).send({
      error: "Transmisión e-CF aún no implementada: falta decidir PAC vs. integración directa a la DGII.",
    });
  });
};
