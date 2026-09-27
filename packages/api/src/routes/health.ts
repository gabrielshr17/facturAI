import type { FastifyPluginAsync } from "fastify";
import { cargarConfig } from "../config.js";
import type { ModuloFiscal } from "../fiscal/iniciar.js";

/**
 * Chequeo de salud + qué tan conectado está el backend a servicios reales. Es público: del módulo
 * fiscal solo dice si está activo y en qué ambiente, nunca el motivo (puede nombrar rutas o el RNC).
 */
export function rutaSalud(modulo: Pick<ModuloFiscal, "disponible" | "ambiente">): FastifyPluginAsync {
  return async (app) => {
    app.get("/health", async () => {
      const config = cargarConfig();
      return {
        estado: "ok",
        timestamp: new Date().toISOString(),
        supabaseConfigurado: config.supabaseConfigurado,
        powersyncConfigurado: Boolean(config.powersyncUrl),
        fiscal: { disponible: modulo.disponible, ambiente: modulo.ambiente },
      };
    });
  };
}
