import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell, ProveedorDatos, ProveedorAuth, mensajeError } from "@sfr/ui";
import { migrate, seed, crearClienteAuth, iniciarSesionGoogleWeb, type SqlDriver } from "@sfr/core";
import { crearSqlJsDriver } from "./db/sqljs-driver.js";
import "@sfr/ui/estilos-globales.css";

// Sign in with Google (§ Fase 2 opcional, ver SeccionCuentaGoogle): sin estas variables
// `clienteAuth` queda en `null` y esa sección de Configuración ni se muestra — el resto de la
// app sigue funcionando 100% local, que es el modo por defecto.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const clienteAuth = supabaseUrl && supabaseAnonKey ? crearClienteAuth(supabaseUrl, supabaseAnonKey) : null;

/**
 * Arranque de la PWA: inicializa SQLite (sql.js + IndexedDB), aplica migraciones
 * y siembra datos de ejemplo la primera vez. Mientras tanto muestra "Cargando…".
 */
function App() {
  const [db, setDb] = useState<SqlDriver | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Guarda contra el doble-montaje de React StrictMode en desarrollo: sin este
  // guard, el efecto crea DOS instancias independientes de sql.js (cada una con
  // su propio estado en memoria); la segunda "gana" y reemplaza silenciosamente
  // a la primera en medio de la sesión, huerfanando cualquier dato ya creado
  // contra la primera (p.ej. un ticket abierto que desaparece al agregar un
  // producto). Con el guard, solo se crea una instancia real.
  const iniciado = useRef(false);
  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    void (async () => {
      try {
        const driver = await crearSqlJsDriver();
        await migrate(driver);
        await seed(driver);
        setDb(driver);
      } catch (e) {
        setError(mensajeError(e));
      }
    })();
  }, []);

  if (error) {
    return (
      <div style={{ padding: 24, fontFamily: "system-ui", color: "#dc2626" }}>
        Error al iniciar la base de datos: {error}
      </div>
    );
  }
  if (!db) {
    return <div style={{ padding: 24, fontFamily: "system-ui", color: "#6b7280" }}>Cargando base de datos…</div>;
  }
  return (
    <ProveedorAuth cliente={clienteAuth} onIniciarSesion={(c) => iniciarSesionGoogleWeb(c, window.location.origin)}>
      <ProveedorDatos db={db}>
        <AppShell plataforma="Web" />
      </ProveedorDatos>
    </ProveedorAuth>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
