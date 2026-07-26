import type { FastifyPluginAsync } from "fastify";
import { cargarConfig } from "../config.js";

/** Chequeo de salud + qué tan conectado está el backend a servicios reales. */
export const rutaSalud: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => {
    const config = cargarConfig();
    return {
      estado: "ok",
      timestamp: new Date().toISOString(),
      supabaseConfigurado: config.supabaseConfigurado,
      powersyncConfigurado: Boolean(config.powersyncUrl),
    };
  });
};
