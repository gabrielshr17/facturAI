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
  /**
   * Etiqueta de Gmail que marca "esto es una notificación bancaria" (§ Últimas transferencias
   * recibidas). Necesaria porque `GMAIL_OAUTH_*` puede apuntar a un Gmail personal real (vía alias
   * "+", no una casilla 100% dedicada) — sin esta etiqueta el sondeo tomaría CUALQUIER correo no
   * leído de esa cuenta, no solo los del banco. Por defecto "Transferencias"; el usuario crea un
   * filtro en Gmail que le ponga esta etiqueta a lo que llega de/para el banco.
   */
  gmailEtiquetaTransferencias: string;
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
    gmailEtiquetaTransferencias: env.GMAIL_LABEL_TRANSFERENCIAS || "Transferencias",
  };
}
