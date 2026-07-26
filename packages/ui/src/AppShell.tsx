import { useState, type CSSProperties } from "react";
import { Ventas } from "./pantallas/Ventas.js";
import { Productos } from "./pantallas/Productos.js";
import { Clientes } from "./pantallas/Clientes.js";
import { ConsultaFacturas } from "./pantallas/ConsultaFacturas.js";
import { CorteCaja } from "./pantallas/CorteCaja.js";
import { Compras } from "./pantallas/Compras.js";
import { Reportes } from "./pantallas/Reportes.js";
import { Promociones } from "./pantallas/Promociones.js";
import { Configuracion } from "./pantallas/Configuracion.js";
import { ErrorBoundary } from "./componentes/ErrorBoundary.js";
import { c } from "./estilos.js";

type Modulo =
  | "Ventas" | "Productos" | "Clientes" | "Facturas" | "Compras"
  | "Corte de caja" | "Reportes" | "Promociones" | "Configuración";

const MODULOS: Modulo[] = [
  "Ventas", "Productos", "Clientes", "Facturas", "Compras",
  "Corte de caja", "Reportes", "Promociones", "Configuración",
];

const ICONO: Record<Modulo, string> = {
  "Ventas": "🛒",
  "Productos": "📦",
  "Clientes": "👥",
  "Facturas": "🧾",
  "Compras": "🚚",
  "Corte de caja": "💵",
  "Reportes": "📊",
  "Promociones": "🏷️",
  "Configuración": "⚙️",
};

/**
 * Cascarón de UI compartido (PWA y escritorio). Navega entre las pantallas del
 * MVP. El Cobro (§7.2) no es una pantalla propia: es el modal que se abre con
 * el botón "Cobrar" dentro de Ventas, ya que necesita el ticket activo.
 */
export function AppShell({ plataforma }: { plataforma: "Escritorio" | "Web" }) {
  const [activo, setActivo] = useState<Modulo>("Ventas");

  return (
    <div style={styles.root}>
      <aside style={styles.nav}>
        <div style={styles.marca}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={styles.marcaIcono}>🧮</span>
            <span style={styles.marcaTexto}>Facturación</span>
          </div>
          <span style={styles.badge}>{plataforma}</span>
        </div>
        {MODULOS.map((m) => (
          <button
            key={m}
            onClick={() => setActivo(m)}
            style={{
              ...styles.navItem,
              ...(activo === m ? styles.navItemActivo : {}),
            }}
          >
            <span style={{ fontSize: 16 }}>{ICONO[m]}</span>
            {m}
          </button>
        ))}
      </aside>

      <main style={styles.main}>
        <h2 style={styles.titulo}>
          <span>{ICONO[activo]}</span> {activo}
        </h2>
        <ErrorBoundary key={activo}>
          {activo === "Ventas" && <Ventas />}
          {activo === "Productos" && <Productos />}
          {activo === "Clientes" && <Clientes />}
          {activo === "Facturas" && <ConsultaFacturas />}
          {activo === "Compras" && <Compras />}
          {activo === "Corte de caja" && <CorteCaja />}
          {activo === "Reportes" && <Reportes />}
          {activo === "Promociones" && <Promociones />}
          {activo === "Configuración" && <Configuracion />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: c.texto,
    background: c.fondo,
  },
  nav: {
    width: 216,
    background: "white",
    borderRight: `1px solid ${c.borde}`,
    padding: "16px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    boxShadow: "1px 0 3px rgba(15, 23, 42, 0.04)",
  },
  marca: { padding: "4px 8px 20px", display: "flex", flexDirection: "column", gap: 10 },
  marcaIcono: { fontSize: 20 },
  marcaTexto: { fontSize: 17, fontWeight: 700, letterSpacing: -0.2 },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    background: c.azulClaro,
    color: c.azulOscuro,
    borderRadius: 999,
    padding: "3px 10px",
    alignSelf: "flex-start",
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textAlign: "left",
    background: "none",
    border: "none",
    borderLeft: "3px solid transparent",
    borderRadius: 8,
    padding: "10px 11px",
    fontSize: 14,
    cursor: "pointer",
    color: c.gris,
  },
  navItemActivo: {
    background: c.azulClaro,
    borderLeft: `3px solid ${c.azul}`,
    color: c.azulOscuro,
    fontWeight: 600,
  },
  main: { flex: 1, padding: "24px 32px", overflow: "auto" },
  titulo: { marginTop: 0, marginBottom: 20, fontSize: 22, letterSpacing: -0.3 },
};
