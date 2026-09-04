import { useEffect, useRef, useState, type CSSProperties, type ComponentType } from "react";
import {
  ShoppingCart,
  Package,
  Users,
  Receipt,
  Truck,
  Banknote,
  ChartColumn,
  Tag,
  Settings,
  Sun,
  Moon,
  Menu,
  type LucideProps,
} from "lucide-react";
import { Marca } from "./componentes/Marca.js";
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
import { c, sombra } from "./estilos.js";
import { useTema } from "./hooks/useTema.js";
import { useAtajosTeclado } from "./hooks/useAtajosTeclado.js";
import { useNavegacionFlechas } from "./hooks/useNavegacionFlechas.js";
import { useBreakpoint, useNavSoloIconos, useNavEnCajon } from "./hooks/useBreakpoint.js";

type Modulo =
  | "Ventas"
  | "Productos"
  | "Clientes"
  | "Facturas"
  | "Compras"
  | "Corte de caja"
  | "Reportes"
  | "Promociones"
  | "Configuración";

const MODULOS: Modulo[] = [
  "Ventas",
  "Productos",
  "Clientes",
  "Facturas",
  "Compras",
  "Corte de caja",
  "Reportes",
  "Promociones",
  "Configuración",
];

const ICONO: Record<Modulo, ComponentType<LucideProps>> = {
  Ventas: ShoppingCart,
  Productos: Package,
  Clientes: Users,
  Facturas: Receipt,
  Compras: Truck,
  "Corte de caja": Banknote,
  Reportes: ChartColumn,
  Promociones: Tag,
  Configuración: Settings,
};

/**
 * Cascarón de UI compartido (PWA y escritorio). Navega entre las pantallas del
 * MVP. El Cobro (§7.2) no es una pantalla propia: es el modal que se abre con
 * el botón "Cobrar" dentro de Ventas, ya que necesita el ticket activo.
 */
export function AppShell({ plataforma }: { plataforma: "Escritorio" | "Web" }) {
  const [activo, setActivo] = useState<Modulo>("Ventas");
  const [tema, alternarTema] = useTema();
  const tramo = useBreakpoint();
  // La columna izquierda es lo PRIMERO que cede al angostar la ventana: pierde las etiquetas y queda
  // como tira de iconos ANTES de que el contenido se apile (§ tabla de tramos en useBreakpoint), y
  // recién en teléfono sale del flujo a un cajón.
  const soloIconos = useNavSoloIconos();
  const enCajon = useNavEnCajon();
  const [cajonAbierto, setCajonAbierto] = useState(false);

  // Alt+1..Alt+9 cambia de pantalla desde cualquier lugar de la app — junto con
  // `useNavegacionFlechas` (flechas para moverse entre campos en vez de alterar
  // valores), es lo que hace posible operar todo el sistema sin mouse.
  useAtajosTeclado(Object.fromEntries(MODULOS.map((m, i) => [`Alt+${i + 1}`, () => setActivo(m)])));
  useNavegacionFlechas();

  // El cajón se cierra solo al ensanchar la ventana: si no, al volver a escritorio quedaría un
  // overlay abierto encima de una barra lateral que ya es visible de por sí.
  useEffect(() => {
    if (!enCajon) setCajonAbierto(false);
  }, [enCajon]);
  useAtajosTeclado({ Escape: () => setCajonAbierto(false) }, cajonAbierto);

  // Al abrir el cajón el foco entra en él, y al cerrarlo vuelve al botón que lo abrió. Sin esto,
  // quien navega con teclado o lector de pantalla abre el menú y se queda con el foco atrás, en el
  // contenido tapado por el overlay, sin forma evidente de llegar a los módulos.
  const cajonRef = useRef<HTMLElement>(null);
  const botonMenuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (cajonAbierto) cajonRef.current?.querySelector("button")?.focus();
    else botonMenuRef.current?.focus();
  }, [cajonAbierto]);

  function irA(m: Modulo) {
    setActivo(m);
    setCajonAbierto(false);
  }

  const nav = (
    <nav
      aria-label="Módulos"
      ref={cajonRef}
      style={{
        ...styles.nav,
        ...(soloIconos ? { width: 60, padding: "16px 6px", alignItems: "center" } : {}),
        ...(enCajon ? { position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 300, boxShadow: sombra.md } : {}),
      }}
    >
      <div style={{ ...styles.marca, ...(soloIconos ? { alignItems: "center", padding: "4px 0 16px" } : {}) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Marca size={20} aria-hidden="true" />
          {!soloIconos && <span style={styles.marcaTexto}>facturAI</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {!soloIconos && <span style={styles.badge}>{plataforma}</span>}
          <button
            onClick={alternarTema}
            // `title` sale como tooltip pero no todos los lectores de pantalla lo anuncian; el
            // nombre accesible de un botón que solo tiene un icono tiene que ir en aria-label.
            aria-label={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            aria-pressed={tema === "oscuro"}
            title={tema === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            style={styles.botonTema}
          >
            {tema === "oscuro" ? <Sun size={14} aria-hidden="true" /> : <Moon size={14} aria-hidden="true" />}
          </button>
        </div>
      </div>
      {MODULOS.map((m, i) => {
        const Icono = ICONO[m];
        return (
          <button
            key={m}
            onClick={() => irA(m)}
            // Sin etiqueta visible el tooltip pasa a ser la única forma de saber qué es cada icono.
            title={soloIconos ? `${m} (Alt+${i + 1})` : `Alt+${i + 1}`}
            // En modo tira de iconos no queda texto dentro del botón: sin esto el lector de
            // pantalla lo anunciaría como "botón" a secas.
            aria-label={soloIconos ? m : undefined}
            // Le dice al lector cuál de los nueve módulos es el que está abierto.
            aria-current={activo === m ? "page" : undefined}
            style={{
              ...styles.navItem,
              ...(activo === m ? styles.navItemActivo : {}),
              ...(soloIconos ? { justifyContent: "center", padding: "12px 0", width: "100%" } : {}),
            }}
          >
            <Icono size={16} aria-hidden="true" />
            {!soloIconos && (
              <>
                <span style={{ flex: 1 }}>{m}</span>
                {/* El número suelto ("1", "2"…) leído en voz alta no significa nada; la pista real
                    ya va en el `title`, así que para el lector este adorno se oculta. */}
                <span style={styles.navAtajo} aria-hidden="true">
                  {i + 1}
                </span>
              </>
            )}
          </button>
        );
      })}
    </nav>
  );

  return (
    <ProveedorAlertas>
      <div style={styles.root}>
        {/* Primer tabulador de la página: salta los nueve módulos y va directo al contenido. Solo se
          ve cuando tiene el foco (§ .sfr-salto-contenido en estilos-globales.css). */}
        <a href="#contenido-principal" className="sfr-salto-contenido">
          Saltar al contenido
        </a>
        {!enCajon && nav}
        {enCajon && cajonAbierto && (
          <>
            <div
              onClick={() => setCajonAbierto(false)}
              aria-hidden="true"
              style={{ position: "fixed", inset: 0, background: "var(--sfr-overlay)", zIndex: 290 }}
            />
            {nav}
          </>
        )}

        {/* El padding se achica recién cuando el contenido ya se está apilando; en `medio` (barra en
          tira de iconos pero dos columnas todavía) el respiro de escritorio se mantiene. */}
        <main
          id="contenido-principal"
          style={{ ...styles.main, ...(tramo === "compacto" || tramo === "movil" ? { padding: "12px 14px" } : {}) }}
        >
          <h2
            style={{
              ...styles.titulo,
              display: "flex",
              alignItems: "center",
              gap: 10,
              ...(enCajon ? { fontSize: 18, marginBottom: 14 } : {}),
            }}
          >
            {enCajon && (
              <button
                ref={botonMenuRef}
                onClick={() => setCajonAbierto(true)}
                aria-label="Abrir menú de módulos"
                aria-expanded={cajonAbierto}
                title="Menú"
                style={styles.botonMenu}
              >
                <Menu size={20} aria-hidden="true" />
              </button>
            )}
            {(() => {
              const Icono = ICONO[activo];
              return <Icono size={enCajon ? 18 : 22} aria-hidden="true" />;
            })()}{" "}
            {activo}
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
    // `dvh` en vez de `vh`: en el navegador del teléfono la barra de direcciones se muestra y se
    // esconde al scrollear, y `100vh` (que no la cuenta) deja el final de la app tapado.
    height: "100dvh",
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
  botonMenu: {
    background: "none",
    border: `1px solid ${c.borde}`,
    borderRadius: 8,
    width: 38,
    height: 38,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    color: c.texto,
    padding: 0,
    flexShrink: 0,
  },
  // `minWidth: 0` es imprescindible, no cosmético: un hijo flex arranca con `min-width: auto`, o sea
  // que se NIEGA a achicarse por debajo del ancho de su contenido. Con la barra lateral en
  // `flexShrink: 0`, al angostar la ventana el <main> no cedía y el contenido se desbordaba hacia la
  // derecha — la columna de Totales quedaba cortada por la mitad mucho antes de que el breakpoint
  // llegara a esconder la barra.
  main: { flex: 1, minWidth: 0, minHeight: 0, padding: "24px 32px", overflow: "auto" },
  titulo: { marginTop: 0, marginBottom: 20, fontSize: 22, letterSpacing: -0.3 },
};
