import type { FastifyInstance } from "fastify";
import { cargarConfig } from "../config.js";

export interface UsuarioAutenticado {
  id: string;
  correo: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    usuario: UsuarioAutenticado | null;
  }
}

/**
 * Verifica el JWT de Supabase Auth en el header `Authorization`.
 *
 * *** SIN CONFIGURAR TODAVÍA ***
 * - Sin `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`: cada solicitud pasa como
 *   un usuario de desarrollo fijo. Es lo esperado en modo 100% local/scaffold
 *   — NUNCA debe llegar así a producción.
 * - Con las variables presentes pero sin cliente de Supabase implementado
 *   todavía: se rechaza explícitamente (501) en vez de fingir que el token
 *   fue validado. Cuando se implemente, aquí debe llamarse a
 *   `supabase.auth.getUser(token)` (paquete `@supabase/supabase-js`) y
 *   rechazar con 401 si el token no es válido.
 *
 * Se registra llamando a esta función directamente sobre la instancia raíz
 * de Fastify (NO vía `app.register(...)`) — un plugin registrado con
 * `.register()` crea su propio contexto encapsulado, y un hook agregado ahí
 * adentro nunca llegaría a rutas hermanas (`/health`, `/fiscal/...`, etc.)
 * registradas cada una en su propio contexto. Un hook agregado directamente
 * sobre la instancia raíz, en cambio, sí se hereda por los contextos hijos
 * que se registren después.
 */
export function registrarAuth(app: FastifyInstance): void {
  const config = cargarConfig();
  app.decorateRequest("usuario", null);

  app.addHook("onRequest", async (request, reply) => {
    if (!config.supabaseConfigurado) {
      request.usuario = { id: "dev-local", correo: null };
      return;
    }

    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      await reply.code(401).send({ error: "Falta el token de autenticación." });
      return;
    }

    await reply.code(501).send({
      error: "Verificación de Supabase Auth aún no implementada (falta el cliente supabase-js).",
    });
  });
}
