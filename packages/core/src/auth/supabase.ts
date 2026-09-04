import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";

/**
 * Sesión de Google (§ Fase 2, plan.md — Supabase SOLO auth/autorización) tal
 * como la necesita la UI: nada de campos de Supabase que no use nadie.
 */
export interface SesionAuth {
  usuarioId: string;
  correo: string | null;
  nombre: string | null;
  avatarUrl: string | null;
  accessToken: string;
}

function aSesionAuth(session: Session): SesionAuth {
  const meta = session.user.user_metadata as Record<string, unknown>;
  return {
    usuarioId: session.user.id,
    correo: session.user.email ?? null,
    nombre: typeof meta.full_name === "string" ? meta.full_name : null,
    avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null,
    accessToken: session.access_token,
  };
}

/**
 * Cliente de Supabase Auth para el front-end (web/desktop). `flowType: "pkce"`
 * en los dos: no solo es más seguro que el flujo implícito, es el único que
 * funciona en escritorio — ahí no hay redirect de navegador que Supabase
 * pueda leer solo, así que el `code` de la URL de retorno se intercambia a
 * mano (§ completarInicioSesionDesktop) en vez de con `detectSessionInUrl`.
 */
export function crearClienteAuth(url: string, anonKey: string, opciones?: { detectarSesionEnUrl?: boolean }): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: opciones?.detectarSesionEnUrl ?? true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

/**
 * Arranca "Sign in with Google" en la pestaña/ventana actual (web): Supabase
 * redirige el navegador entero a Google y de vuelta a `redirectTo`, donde
 * `detectSessionInUrl` completa la sesión sola. No sirve para escritorio (ver
 * `iniciarSesionGoogleDesktop`) porque ahí no hay navegador que redirigir.
 */
export async function iniciarSesionGoogleWeb(client: SupabaseClient, redirectTo: string): Promise<void> {
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) throw error;
}

/**
 * Variante escritorio: pide la URL de autorización SIN redirigir nada acá
 * (`skipBrowserRedirect`) — quien llama la abre en el navegador del sistema
 * (Google bloquea el login dentro del WebView de Tauri) y luego captura el
 * `code` del deep link de retorno para pasarlo a `completarInicioSesionDesktop`.
 */
export async function iniciarSesionGoogleDesktop(client: SupabaseClient, redirectTo: string): Promise<string> {
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  return data.url;
}

/** Intercambia el `code` del deep link de retorno (§ arriba) por la sesión. */
export async function completarInicioSesionDesktop(client: SupabaseClient, code: string): Promise<SesionAuth> {
  const { data, error } = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return aSesionAuth(data.session);
}

export async function obtenerSesion(client: SupabaseClient): Promise<SesionAuth | null> {
  const { data } = await client.auth.getSession();
  return data.session ? aSesionAuth(data.session) : null;
}

export async function cerrarSesion(client: SupabaseClient): Promise<void> {
  await client.auth.signOut();
}

/** Se dispara al iniciar/cerrar sesión y al refrescar el token en segundo plano. */
export function alCambiarSesion(client: SupabaseClient, cb: (sesion: SesionAuth | null) => void): () => void {
  const { data } = client.auth.onAuthStateChange((_evento, session) => {
    cb(session ? aSesionAuth(session) : null);
  });
  return () => data.subscription.unsubscribe();
}
