import { useState, type CSSProperties, type ComponentType } from "react";
import {
  Calculator, ShoppingCart, Package, Users, Receipt, Truck,
  Banknote, ChartColumn, Tag, Settings, Sun, Moon, type LucideProps,
} from "lucide-react";
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
import { ProveedorAlertas } from "./contexto/Alertas.js";
import { c } from "./estilos.js";
import { useTema } from "./hooks/useTema.js";
import { useAtajosTeclado } from "./hooks/useAtajosTeclado.js";
import { useNavegacionFlechas } from "./hooks/useNavegacionFlechas.js";

type Modulo =
  | "Ventas" | "Productos" | "Clientes" | "Facturas" | "Compras"
  | "Corte de caja" | "Reportes" | "Promociones" | "Configuración";

const MODULOS: Modulo[] = [
  "Ventas", "Productos", "Clientes", "Facturas", "Compras",
  "Corte de caja", "Reportes", "Promociones", "Configuración",
];

const ICONO: Record<Modulo, ComponentType<LucideProps>> = {
  "Ventas": ShoppingCart,
  "Productos": Package,
  "Clientes": Users,
  "Facturas": Receipt,
  "Compras": Truck,
  "Corte de caja": Banknote,
  "Reportes": ChartColumn,
  "Promociones": Tag,
  "Configuración": Settings,
};

/**
 * Cascarón de UI compartido (PWA y escritorio). Navega entre las pantallas del
 * MVP. El Cobro (§7.2) no es una pantalla propia: es el modal que se abre con
 * el botón "Cobrar" dentro de Ventas, ya que necesita el ticket activo.
 */
export function AppShell({ plataforma }: { plataforma: "Escritorio" | "Web" }) {
  const [activo, setActivo] = useState<Modulo>("Ventas");
  const [tema, alternarTema] = useTema();

  // Alt+1..Alt+9 cambia de pantalla desde cualquier lugar de la app — junto con
  // `useNavegacionFlechas` (flechas para moverse entre campos en vez de alterar
  // valores), es lo que hace posible operar todo el sistema sin mouse.
  useAtajosTeclado(
    Object.fromEntries(MODULOS.map((m, i) => [`Alt+${i + 1}`, () => setActivo(m)])),
  );
  useNavegacionFlechas();

  return (
    <ProveedorAlertas>
    <div style={styles.root}>
      <aside style={styles.nav}>
        <div style={styles.marca}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Calculator size={20} />
            <span style={styles.marcaTexto}>Facturación</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={styles.badge}>{plataforma}</span>
            <button
              onClick={alternarTema}
              title={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              style={styles.botonTema}
            >
              {tema === "oscuro" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
        {MODULOS.map((m, i) => {
          const Icono = ICONO[m];
          return (
            <button
              key={m}
              onClick={() => setActivo(m)}
              title={`Alt+${i + 1}`}
              style={{
                ...styles.navItem,
                ...(activo === m ? styles.navItemActivo : {}),
              }}
            >
              <Icono size={16} />
              <span style={{ flex: 1 }}>{m}</span>
              <span style={styles.navAtajo}>{i + 1}</span>
            </button>
          );
        })}
      </aside>

      <main style={styles.main}>
        <h2 style={{ ...styles.titulo, display: "flex", alignItems: "center", gap: 10 }}>
          {(() => { const Icono = ICONO[activo]; return <Icono size={22} />; })()} {activo}
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
    </ProveedorAlertas>
  );
}

const styles: Record<string, CSSProperties> = {
  root: {
    display: "flex",
    height: "100vh",
    fontFamily: "'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    color: c.texto,
    background: c.fondo,
  },
  nav: {
    width: 216,
    flexShrink: 0,
    background: c.superficie,
    borderRight: `1px solid ${c.borde}`,
    padding: "16px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 2,
    boxShadow: "1px 0 3px rgba(15, 23, 42, 0.04)",
    overflowY: "auto",
  },
  marca: { padding: "4px 8px 20px", display: "flex", flexDirection: "column", gap: 10 },
  marcaTexto: { fontSize: 17, fontWeight: 700, letterSpacing: -0.2 },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    background: c.azulClaro,
    color: c.azulOscuro,
    borderRadius: 999,
    padding: "3px 10px",
  },
  botonTema: {
    background: "none",
    border: `1px solid ${c.borde}`,
    borderRadius: 999,
    width: 26,
    height: 26,
    fontSize: 13,
    lineHeight: 1,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
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
  navAtajo: {
    fontSize: 11,
    color: c.gris,
    opacity: 0.7,
  },
  main: { flex: 1, minHeight: 0, padding: "24px 32px", overflow: "auto" },
  titulo: { marginTop: 0, marginBottom: 20, fontSize: 22, letterSpacing: -0.3 },
};
