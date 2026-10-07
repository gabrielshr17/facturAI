import type { FastifyPluginAsync } from "fastify";
import { cargarConfig } from "../config.js";
import type { ModuloFiscal } from "../fiscal/iniciar.js";

/**
 * Chequeo de salud + qué tan conectado está el backend a servicios reales. Es público: del módulo
 * fiscal dice si está activo, en qué ambiente y, si no lo está, solo un código corto del motivo
 * (nunca el texto completo, que puede nombrar rutas o el RNC).
 */
export function rutaSalud(modulo: ModuloFiscal): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async () => {
      const config = cargarConfig();
      return {
        estado: "ok",
        timestamp: new Date().toISOString(),
        supabaseConfigurado: config.supabaseConfigurado,
        powersyncConfigurado: Boolean(config.powersyncUrl),
        fiscal: modulo.disponible
          ? { disponible: true, ambiente: modulo.ambiente }
          : { disponible: false, ambiente: modulo.ambiente, motivo: modulo.codigo },
      };
    });
  };
}
