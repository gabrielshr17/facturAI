/**
 * Configuración del backend (§ Multi-caja/multiusuario). Ninguna de estas
 * variables está conectada todavía a un proyecto real: este paquete es un
 * *scaffold* — arranca y sirve rutas sin Supabase/PowerSync configurados,
 * para que la estructura (rutas, tipos, plugin de auth) quede lista y solo
 * haga falta pegar credenciales reales cuando existan.
 *
 * Nada de esto se usa en el modo 100% local (SQLite en el cliente); el
 * backend solo entra en juego para el modo multi-caja/multiusuario y para
 * el endpoint de transmisión e-CF (ver plan.md, "Flujo de datos y modos").
 */
export interface ConfigApi {
  puerto: number;
  supabaseUrl: string | null;
  supabaseServiceRoleKey: string | null;
  powersyncUrl: string | null;
  /** true si todas las credenciales de Supabase están presentes. */
  supabaseConfigurado: boolean;
  /** OAuth de la casilla Gmail dedicada que recibe (por reenvío) las notificaciones bancarias del
   *  negocio (§ Últimas transferencias recibidas). */
  gmailOAuthClientId: string | null;
  gmailOAuthClientSecret: string | null;
  gmailOAuthRefreshToken: string | null;
  /** true si las tres credenciales de Gmail están presentes. */
  gmailConfigurado: boolean;
  /** Cada cuánto se sondea la casilla dedicada en busca de correos nuevos. */
  transferenciasPollIntervaloMs: number;
}

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): ConfigApi {
  const supabaseUrl = env.SUPABASE_URL || null;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || null;
  const gmailOAuthClientId = env.GMAIL_OAUTH_CLIENT_ID || null;
  const gmailOAuthClientSecret = env.GMAIL_OAUTH_CLIENT_SECRET || null;
  const gmailOAuthRefreshToken = env.GMAIL_OAUTH_REFRESH_TOKEN || null;

  return {
    puerto: Number(env.PORT) || 3001,
    supabaseUrl,
    supabaseServiceRoleKey,
    powersyncUrl: env.POWERSYNC_URL || null,
    supabaseConfigurado: Boolean(supabaseUrl && supabaseServiceRoleKey),
    gmailOAuthClientId,
    gmailOAuthClientSecret,
    gmailOAuthRefreshToken,
    gmailConfigurado: Boolean(gmailOAuthClientId && gmailOAuthClientSecret && gmailOAuthRefreshToken),
    transferenciasPollIntervaloMs: Number(env.TRANSFERENCIAS_POLL_INTERVALO_MS) || 5 * 60 * 1000,
  };
}
