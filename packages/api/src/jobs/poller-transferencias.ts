import type { FastifyInstance } from "fastify";
import { transferenciasDisponible, sincronizarTransferencias } from "../services/transferencias.js";

/**
 * `setInterval` simple, no una cola/cron real: el volumen (unas pocas transferencias por día de
 * un negocio pequeño) no lo justifica y hoy no hay infraestructura de jobs en el proyecto (§
 * plan.md, "Archivos a tocar"). Si `transferenciasDisponible()` es false (falta Gmail o
 * ANTHROPIC_API_KEY) no arranca nada — evita loguear el mismo error cada `intervaloMs` sin razón.
 * Devuelve una función para detenerlo, usada en los tests.
 */
export function iniciarPollerTransferencias(app: FastifyInstance, intervaloMs: number): () => void {
  if (!transferenciasDisponible()) {
    app.log.warn(
      "GMAIL_OAUTH_*/ANTHROPIC_API_KEY no configurados: el sondeo de transferencias no arranca.",
    );
    return () => {};
  }

  async function ciclo() {
    try {
      const procesados = await sincronizarTransferencias();
      if (procesados > 0) app.log.info(`Transferencias: ${procesados} correo(s) nuevo(s) procesado(s).`);
    } catch (e) {
      app.log.error(e, "Falló un ciclo de sondeo de transferencias.");
    }
  }

  void ciclo();
  const temporizador = setInterval(() => void ciclo(), intervaloMs);
  return () => clearInterval(temporizador);
}
