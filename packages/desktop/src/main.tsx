import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AppShell, ProveedorDatos, ProveedorAuth, configurarAdaptadorImpresora, configurarAdaptadorImpresoraTexto, mensajeError } from "@sfr/ui";
import {
  migrate, seed, crearClienteAuth, iniciarSesionGoogleDesktop, completarInicioSesionDesktop,
  type SqlDriver,
} from "@sfr/core";
import { crearTauriSqlDriver } from "./db/tauri-sql-driver.js";
import { adaptadorImpresoraTauri, adaptadorImpresoraTextoTauri } from "./impresora/tauri-impresora.js";
import "@sfr/ui/estilos-globales.css";

configurarAdaptadorImpresora(adaptadorImpresoraTauri);
configurarAdaptadorImpresoraTexto(adaptadorImpresoraTextoTauri);

// Sign in with Google (§ Fase 2 opcional, ver SeccionCuentaGoogle): sin estas variables
// `clienteAuth` queda en `null` y esa sección de Configuración ni se muestra — el resto de la
// app sigue funcionando 100% local, que es el modo por defecto.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
// `detectarSesionEnUrl: false`: acá no hay navegador que redirija de vuelta con la sesión en la
// URL — el `code` llega por el deep link `facturai://auth-callback` (ver `onOpenUrl` abajo), que
// se intercambia a mano con `completarInicioSesionDesktop`.
const clienteAuth = supabaseUrl && supabaseAnonKey
  ? crearClienteAuth(supabaseUrl, supabaseAnonKey, { detectarSesionEnUrl: false })
  : null;

// Registrado una sola vez, fuera de React: si el deep link llega con la app ya abierta, el SO lo
// entrega acá tal cual (no recarga `main.tsx`), así que este listener tiene que estar vivo desde
// el arranque para no perderlo — no alcanza con registrarlo dentro de un efecto de `<App>`.
if (clienteAuth) {
  void onOpenUrl(async (urls) => {
    const code = new URL(urls[0]).searchParams.get("code");
    if (code) await completarInicioSesionDesktop(clienteAuth, code);
  });
}

async function iniciarSesionGoogleEscritorio(): Promise<void> {
  if (!clienteAuth) return;
  const url = await iniciarSesionGoogleDesktop(clienteAuth, "facturai://auth-callback");
  // Nunca dentro del WebView de la app: Google rechaza el login ahí ("disallowed_useragent").
  await openUrl(url);
}

/**
 * Arranque del escritorio: inicializa SQLite (tauri-plugin-sql, archivo real),
 * aplica migraciones y siembra datos de ejemplo la primera vez. Mismo patrón
 * que `packages/web/src/main.tsx` (ver ese archivo para el porqué del guard
 * contra el doble-montaje de StrictMode).
 */
function App() {
  const [db, setDb] = useState<SqlDriver | null>(null);
  const [error, setError] = useState<string | null>(null);

  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void (async () => {
      try {
        const driver = await crearTauriSqlDriver();
        await migrate(driver);
        await seed(driver);
        setDb(driver);
      } catch (e) {
        setError(mensajeError(e));
      }
    })();
  }, []);

  if (error) {
    return <div style={{ padding: 24, fontFamily: "system-ui", color: "#dc2626" }}>Error al iniciar la base de datos: {error}</div>;
  }
  if (!db) {
    return <div style={{ padding: 24, fontFamily: "system-ui", color: "#6b7280" }}>Cargando base de datos…</div>;
  }
  return (
    <ProveedorAuth cliente={clienteAuth} onIniciarSesion={iniciarSesionGoogleEscritorio}>
      <ProveedorDatos db={db}>
        <AppShell plataforma="Escritorio" />
      </ProveedorDatos>
    </ProveedorAuth>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
