import type { FastifyInstance } from "fastify";
import { createClient } from "@supabase/supabase-js";
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
 * Verifica el JWT de Supabase Auth (emitido tras Sign in with Google, § Fase 2)
 * en el header `Authorization: Bearer <token>`.
 *
 * Sin `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`: cada solicitud pasa como un
 * usuario de desarrollo fijo. Es lo esperado en modo 100% local/scaffold —
 * NUNCA debe llegar así a producción (§ cargarConfig, supabaseConfigurado).
 *
 * Se llama con la instancia que representa el contexto "protegido" (§ server.ts: un
 * `app.register(async (protegido) => ...)` que agrupa `/fiscal` y `/chatbot`), NUNCA con la
 * instancia raíz — `/health` vive afuera de ese contexto a propósito, para "responder siempre"
 * sin importar el token. Fastify resuelve la herencia de hooks por jerarquía real de
 * `.register()` (quién es hijo de quién), no por el orden de las líneas en el archivo: agregar
 * este hook sobre la raíz alcanzaría también a `/health`, sin importar en qué línea se llame.
 */
export function registrarAuth(app: FastifyInstance): void {
  const config = cargarConfig();
  app.decorateRequest("usuario", null);

  // `getUser(token)` valida el JWT contra Supabase (no solo decodifica) — así
  // un token expirado, revocado o de otro proyecto se rechaza aunque esté
  // bien formado. Un solo cliente para todo el proceso: crearlo por solicitud
  // no aporta nada (es sin estado) y sí un costo de inicialización repetido.
  const supabase = config.supabaseConfigurado
    ? createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!)
    : null;

  app.addHook("onRequest", async (request, reply) => {
    if (!supabase) {
      request.usuario = { id: "dev-local", correo: null };
      return;
    }

    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      await reply.code(401).send({ error: "Falta el token de autenticación." });
      return;
    }

    const token = auth.slice("Bearer ".length);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      await reply.code(401).send({ error: "Token de autenticación inválido o expirado." });
      return;
    }

    request.usuario = { id: data.user.id, correo: data.user.email ?? null };
  });
}
