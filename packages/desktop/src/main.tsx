import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppShell, ProveedorDatos, configurarAdaptadorImpresora } from "@sfr/ui";
import { migrate, seed, type SqlDriver } from "@sfr/core";
import { crearTauriSqlDriver } from "./db/tauri-sql-driver.js";
import { adaptadorImpresoraTauri } from "./impresora/tauri-impresora.js";
import "@sfr/ui/estilos-globales.css";

configurarAdaptadorImpresora(adaptadorImpresoraTauri);

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
        setError(String(e));
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
    <ProveedorDatos db={db}>
      <AppShell plataforma="Escritorio" />
    </ProveedorDatos>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
