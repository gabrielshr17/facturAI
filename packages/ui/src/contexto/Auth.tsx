import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type SesionAuth, obtenerSesion, cerrarSesion as cerrarSesionSupabase, alCambiarSesion } from "@sfr/core";

export interface AuthApi {
  /** false si no hay `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` configuradas — el botón de
   *  Google en Configuración simplemente no aparece, y el resto de la app sigue 100% local. */
  disponible: boolean;
  sesion: SesionAuth | null;
  /** true solo mientras se resuelve la sesión guardada al arrancar (evita un parpadeo
   *  "Iniciar sesión" → "Sesión activa" si ya había una sesión persistida). */
  cargando: boolean;
  iniciarSesionGoogle: () => Promise<void>;
  cerrarSesion: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() debe usarse dentro de <ProveedorAuth>.");
  return ctx;
}

/**
 * Sign in with Google (§ Fase 2 opcional, plan.md — Supabase SOLO auth): envuelve `AppShell` junto
 * a `ProveedorDatos`. Cada plataforma trae su propio `cliente` (o `null` sin configurar, ver
 * `disponible`) y su propia forma de arrancar el login — web redirige el navegador entero;
 * escritorio abre el navegador del sistema porque Google bloquea el login dentro del WebView de
 * Tauri — pasada como `onIniciarSesion` para que este componente no tenga que saber cuál es cuál.
 */
export function ProveedorAuth({
  cliente,
  onIniciarSesion,
  children,
}: {
  cliente: SupabaseClient | null;
  onIniciarSesion: (cliente: SupabaseClient) => Promise<void>;
  children: ReactNode;
}) {
  const [sesion, setSesion] = useState<SesionAuth | null>(null);
  const [cargando, setCargando] = useState(cliente !== null);

  useEffect(() => {
    if (!cliente) return;
    let vivo = true;
    void obtenerSesion(cliente).then((s) => {
      if (vivo) { setSesion(s); setCargando(false); }
    });
    // Cubre las tres formas en que la sesión cambia después del arranque: login web (Supabase la
    // detecta sola en la URL de retorno), login escritorio (§ completarInicioSesionDesktop, en el
    // manejador del deep link) y el refresco automático del token en segundo plano.
    const desuscribir = alCambiarSesion(cliente, setSesion);
    return () => { vivo = false; desuscribir(); };
  }, [cliente]);

  const api: AuthApi = {
    disponible: cliente !== null,
    sesion,
    cargando,
    iniciarSesionGoogle: async () => { if (cliente) await onIniciarSesion(cliente); },
    cerrarSesion: async () => { if (cliente) await cerrarSesionSupabase(cliente); },
  };

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>;
}
