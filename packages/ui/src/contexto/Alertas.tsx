import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { TriangleAlert, CircleHelp, CircleX, Info } from "lucide-react";
import { s, c, sombra } from "../estilos.js";

export interface OpcionesConfirmar {
  titulo?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** true (default): estilo rojo de acción destructiva. false: estilo neutro/azul. */
  peligro?: boolean;
}

export interface OpcionesAvisar {
  titulo?: string;
  textoBoton?: string;
  /** "error" (default, rojo) o "info" (azul) — sin relación con validación de formularios, que
   *  sigue mostrándose en línea junto al campo. Esto es para el resultado de una acción (venta
   *  fallida, impresión fallida, etc.), donde antes se usaba `alert()` nativo. */
  variante?: "error" | "info";
}

export interface OpcionElegir {
  valor: string;
  etiqueta: string;
}

export interface OpcionesElegir {
  titulo?: string;
  textoCancelar?: string;
}

type Solicitud =
  | { tipo: "confirmar"; mensaje: string; opciones: OpcionesConfirmar; resolver: (v: boolean) => void }
  | { tipo: "avisar"; mensaje: string; opciones: OpcionesAvisar; resolver: () => void }
  | { tipo: "elegir"; mensaje: string; choices: OpcionElegir[]; opciones: OpcionesElegir; resolver: (v: string | null) => void };

interface AlertasApi {
  /** Reemplazo de `confirm()` nativo: devuelve una promesa en vez de bloquear el hilo, así que el
   *  llamador debe ser `async` y usar `await`. Por defecto usa estilo de peligro (rojo) porque casi
   *  todos los usos actuales son "¿Borrar/Eliminar/Anular X?"; pasar `peligro: false` para lo demás. */
  confirmar: (mensaje: string, opciones?: OpcionesConfirmar) => Promise<boolean>;
  /** Reemplazo de `alert()` nativo: modal centrado y con estilo, en vez del diálogo nativo del SO. */
  avisar: (mensaje: string, opciones?: OpcionesAvisar) => Promise<void>;
  /** Modal con 2+ botones propios (p.ej. "Imprimir" / "Guardar PDF") en vez de un simple sí/no —
   *  devuelve el `valor` del botón elegido, o `null` si se canceló (Esc / clic afuera). */
  elegir: (mensaje: string, choices: OpcionElegir[], opciones?: OpcionesElegir) => Promise<string | null>;
}

const AlertasContext = createContext<AlertasApi | null>(null);

export function useAlertas(): AlertasApi {
  const ctx = useContext(AlertasContext);
  if (!ctx) throw new Error("useAlertas() debe usarse dentro de <ProveedorAlertas>.");
  return ctx;
}

/** Envuelve la app entera (§ AppShell) para que cualquier pantalla pueda pedir una confirmación o
 *  mostrar un aviso como un modal centrado y llamativo, en vez de los diálogos nativos del
 *  navegador/SO (`confirm()`/`alert()`) que son chicos, no se pueden estilizar, y en la ventana de
 *  Tauri (WebView2 sin chrome de navegador) son fáciles de pasar por alto. */
export function ProveedorAlertas({ children }: { children: ReactNode }) {
  const [solicitud, setSolicitud] = useState<Solicitud | null>(null);

  const confirmar = useCallback((mensaje: string, opciones: OpcionesConfirmar = {}) => {
    return new Promise<boolean>((resolve) => {
      setSolicitud({ tipo: "confirmar", mensaje, opciones, resolver: resolve });
    });
  }, []);

  const avisar = useCallback((mensaje: string, opciones: OpcionesAvisar = {}) => {
    return new Promise<void>((resolve) => {
      setSolicitud({ tipo: "avisar", mensaje, opciones, resolver: resolve });
    });
  }, []);

  const elegir = useCallback((mensaje: string, choices: OpcionElegir[], opciones: OpcionesElegir = {}) => {
    return new Promise<string | null>((resolve) => {
      setSolicitud({ tipo: "elegir", mensaje, choices, opciones, resolver: resolve });
    });
  }, []);

  function responder(valor: boolean) {
    if (!solicitud || solicitud.tipo === "elegir") return;
    if (solicitud.tipo === "confirmar") solicitud.resolver(valor);
    else solicitud.resolver();
    setSolicitud(null);
  }

  function responderElegir(valor: string | null) {
    if (!solicitud || solicitud.tipo !== "elegir") return;
    solicitud.resolver(valor);
    setSolicitud(null);
  }

  return (
    <AlertasContext.Provider value={{ confirmar, avisar, elegir }}>
      {children}
      {solicitud && (solicitud.tipo === "elegir"
        ? <ModalElegir solicitud={solicitud} onCerrar={responderElegir} />
        : <ModalAlerta solicitud={solicitud} onCerrar={responder} />)}
    </AlertasContext.Provider>
  );
}

function ModalAlerta({ solicitud, onCerrar }: { solicitud: Exclude<Solicitud, { tipo: "elegir" }>; onCerrar: (valor: boolean) => void }) {
  const esError = solicitud.tipo === "avisar" && (solicitud.opciones.variante ?? "error") === "error";
  const esPeligro = solicitud.tipo === "confirmar" && (solicitud.opciones.peligro ?? true);
  const acentuado = esError || esPeligro;
  const botonConfirmarRef = useRef<HTMLButtonElement>(null);

  // Enter confirma (el botón principal ya queda enfocado al abrir), Escape cancela/cierra — así el
  // modal se puede operar sin mouse igual que el confirm() nativo que reemplaza.
  useEffect(() => {
    botonConfirmarRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onCerrar(false); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titulo = solicitud.opciones.titulo ?? (
    solicitud.tipo === "confirmar"
      ? (esPeligro ? "¿Estás seguro?" : "Confirmar")
      : (esError ? "Ocurrió un problema" : "Aviso")
  );
  const Icono = solicitud.tipo === "confirmar" ? (esPeligro ? TriangleAlert : CircleHelp) : (esError ? CircleX : Info);

  return (
    <div style={overlay} onClick={() => onCerrar(false)}>
      <div style={{ ...tarjeta, borderTop: `5px solid ${acentuado ? c.rojo : c.azul}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span style={{ ...iconoCirculo, background: acentuado ? c.rojoFondo : c.azulClaro, color: acentuado ? c.rojo : c.azul }}>
            <Icono size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: "2px 0 8px", fontSize: 18 }}>{titulo}</h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: c.texto, wordBreak: "break-word" }}>
              {solicitud.mensaje}
            </p>
          </div>
        </div>
        <div style={{ ...s.formFooter, justifyContent: "flex-end" }}>
          {solicitud.tipo === "confirmar" ? (
            <>
              <button style={s.botonSecundario} onClick={() => onCerrar(false)}>
                {solicitud.opciones.textoCancelar ?? "Cancelar"} (Esc)
              </button>
              <button
                ref={botonConfirmarRef}
                style={esPeligro ? botonPeligroSolido : s.boton}
                onClick={() => onCerrar(true)}
              >
                {solicitud.opciones.textoConfirmar ?? "Confirmar"} (Enter)
              </button>
            </>
          ) : (
            <button ref={botonConfirmarRef} style={esError ? botonPeligroSolido : s.boton} onClick={() => onCerrar(true)}>
              {solicitud.opciones.textoBoton ?? "Entendido"} (Enter)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ModalElegir({ solicitud, onCerrar }: { solicitud: Extract<Solicitud, { tipo: "elegir" }>; onCerrar: (valor: string | null) => void }) {
  const primerBotonRef = useRef<HTMLButtonElement>(null);

  // Enter dispara la primera opción (ya enfocada al abrir) y Escape cancela — mismo trato de teclado
  // que ModalAlerta, salvo que acá el usuario elige entre varias acciones en vez de solo sí/no.
  useEffect(() => {
    primerBotonRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onCerrar(null); }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={overlay} onClick={() => onCerrar(null)}>
      <div style={{ ...tarjeta, borderTop: `5px solid ${c.azul}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <span style={{ ...iconoCirculo, background: c.azulClaro, color: c.azul }}>
            <CircleHelp size={20} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: "2px 0 8px", fontSize: 18 }}>{solicitud.opciones.titulo ?? "¿Qué quieres hacer?"}</h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: c.texto, wordBreak: "break-word" }}>
              {solicitud.mensaje}
            </p>
          </div>
        </div>
        <div style={{ ...s.formFooter, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button style={s.botonSecundario} onClick={() => onCerrar(null)}>
            {solicitud.opciones.textoCancelar ?? "Cancelar"} (Esc)
          </button>
          {solicitud.choices.map((op, i) => (
            <button
              key={op.valor}
              ref={i === 0 ? primerBotonRef : undefined}
              style={s.boton}
              onClick={() => onCerrar(op.valor)}
            >
              {op.etiqueta}{i === 0 ? " (Enter)" : ""}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--sfr-overlay)",
  backdropFilter: "blur(2px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 500,
  animation: "sfr-alerta-fondo 0.12s ease-out",
};

const tarjeta: CSSProperties = {
  ...s.tarjeta,
  width: 440,
  maxWidth: "90vw",
  border: "none",
  borderRadius: 16,
  boxShadow: sombra.md,
  animation: "sfr-alerta-entrada 0.14s cubic-bezier(0.2, 0.8, 0.3, 1.1)",
};

const iconoCirculo: CSSProperties = {
  flexShrink: 0,
  width: 40,
  height: 40,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 20,
};

const botonPeligroSolido: CSSProperties = {
  ...s.boton,
  background: c.rojo,
};
