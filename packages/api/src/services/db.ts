import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cargarConfig } from "../config.js";

/**
 * Cliente al Postgres del proyecto Supabase real (§ notificacion_transferencia, el primer uso
 * de negocio de este Postgres — hasta ahora `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` solo se
 * usaban para verificar el JWT en `plugins/auth.ts`, nunca para leer/escribir filas). Mismo
 * cliente de `@supabase/supabase-js` ya usado ahí, vía PostgREST — no se agrega un driver `pg`
 * aparte solo para esta tabla.
 */
export function dbDisponible(): boolean {
  return cargarConfig().supabaseConfigurado;
}

let cliente: SupabaseClient | null = null;

export function obtenerClienteDb(): SupabaseClient {
  const config = cargarConfig();
  if (!config.supabaseConfigurado) {
    throw new Error("Supabase no configurado: falta SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!cliente) {
    cliente = createClient(config.supabaseUrl!, config.supabaseServiceRoleKey!);
  }
  return cliente;
}
