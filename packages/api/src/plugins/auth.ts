import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createClient } from "@supabase/supabase-js";
import type { ConfigApi } from "../config.js";
import { obtenerClienteDb } from "../services/db.js";

export type TipoUsuario = "caja" | "google" | "desarrollo";

export interface UsuarioAutenticado {
  id: string;
  correo: string | null;
  tipo: TipoUsuario;
  /** Puede pedir firmas con el certificado de la empresa (rutas `/fiscal/*`). */
  permisoFiscal: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    usuario: UsuarioAutenticado | null;
  }
}

export interface DependenciasAuth {
  /** `desarrollo` deja pasar todo como usuario local: solo sin Supabase y fuera de producción. */
  modo: "desarrollo" | "produccion";
  correosPermitidos: string[];
  verificarJwt: (token: string) => Promise<{ id: string; correo: string | null } | null>;
  buscarCaja: (hashLlave: string) => Promise<{ id: string; nombre: string } | null>;
}

export const CABECERA_LLAVE_CAJA = "x-caja-key";

export function hashLlaveCaja(llave: string): string {
  return createHash("sha256").update(llave, "utf8").digest("hex");
}

export function dependenciasAuthDesdeConfig(config: ConfigApi, entorno = process.env.NODE_ENV): DependenciasAuth {
  const supabase = config.supabaseConfigurado
    ? createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!)
    : null;
  return {
    modo: !supabase && entorno !== "production" ? "desarrollo" : "produccion",
    correosPermitidos: config.correosPermitidos,
    async verificarJwt(token) {
      if (!supabase) return null;
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, correo: data.user.email ?? null };
    },
    async buscarCaja(hashLlave) {
      if (!supabase) return null;
      const { data, error } = await obtenerClienteDb()
        .from("caja_api_key")
        .select("id, nombre")
        .eq("llave_hash", hashLlave)
        .is("revocada_at", null)
        .maybeSingle();
      if (error) throw new Error(`No se pudo verificar la llave de caja: ${error.message}`);
      return data;
    },
  };
}

/**
 * Autenticación del contexto "protegido" (§ server.ts). Acepta dos credenciales:
 *  - `X-Caja-Key`: llave por caja (se guarda solo su hash). Siempre tiene permiso fiscal.
 *  - `Authorization: Bearer <JWT de Supabase>` (Sign in with Google). Tiene permiso fiscal
 *    solo si el correo está en `API_CORREOS_PERMITIDOS`.
 * Se registra sobre el contexto protegido, NUNCA sobre la raíz: `/health` y los servicios de
 * recepción de la DGII (`/fe/*`) viven afuera a propósito.
 */
export function registrarAuth(app: FastifyInstance, deps: DependenciasAuth): void {
  const permitidos = new Set(deps.correosPermitidos.map((c) => c.trim().toLowerCase()).filter(Boolean));
  app.decorateRequest("usuario", null);

  app.addHook("onRequest", async (request, reply) => {
    if (deps.modo === "desarrollo") {
      request.usuario = { id: "dev-local", correo: null, tipo: "desarrollo", permisoFiscal: true };
      return;
    }

    const llave = request.headers[CABECERA_LLAVE_CAJA];
    if (typeof llave === "string" && llave.trim()) {
      let caja: { id: string; nombre: string } | null;
      try {
        caja = await deps.buscarCaja(hashLlaveCaja(llave.trim()));
      } catch (error) {
        request.log.error(error, "Fallo al verificar la llave de caja");
        await reply.code(503).send({ error: "No se pudo verificar la llave de la caja. Intenta de nuevo." });
        return;
      }
      if (caja) {
        request.usuario = { id: caja.id, correo: null, tipo: "caja", permisoFiscal: true };
        return;
      }
      if (!request.headers.authorization) {
        await reply.code(401).send({ error: "Llave de caja inválida o revocada." });
        return;
      }
      request.log.warn("Llave de caja inválida o revocada; se intenta con la sesión de Google.");
    }

    const auth = request.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      await reply.code(401).send({ error: "Falta el token de autenticación." });
      return;
    }
    const usuario = await deps.verificarJwt(auth.slice("Bearer ".length));
    if (!usuario) {
      await reply.code(401).send({ error: "Token de autenticación inválido o expirado." });
      return;
    }
    request.usuario = {
      ...usuario,
      tipo: "google",
      permisoFiscal: usuario.correo !== null && permitidos.has(usuario.correo.toLowerCase()),
    };
  });
}

export async function exigirPermisoFiscal(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.usuario?.permisoFiscal) {
    await reply.code(403).send({
      error: "Esta cuenta no tiene permiso para emitir comprobantes fiscales. Usa la llave de la caja.",
    });
  }
}
