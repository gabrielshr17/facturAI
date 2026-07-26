import { useEffect, useState } from "react";
import { s, c } from "../estilos.js";
import { generarTicketPrueba } from "../impresion/escpos.js";
import {
  abrirGavetaTermica,
  hayImpresoraTermicaDisponible,
  imprimirTermico,
  listarImpresorasTermicas,
  obtenerImpresoraSeleccionada,
  seleccionarImpresoraTermica,
} from "../impresion/termica.js";

/**
 * Configuración de la impresora térmica ESC/POS (§ hardware, plan.md). Solo
 * tiene sentido en el escritorio (Tauri) — en la PWA `hayImpresoraTermicaDisponible()`
 * siempre es `false` porque nadie llama `configurarAdaptadorImpresora` ahí, así
 * que esta sección no se renderiza y `recibo.ts` sigue con `window.print()`.
 */
export function SeccionImpresoraTermica() {
  const [impresoras, setImpresoras] = useState<string[]>([]);
  const [seleccionada, setSeleccionada] = useState<string>(obtenerImpresoraSeleccionada() ?? "");
  const [cargando, setCargando] = useState(false);
  const [probando, setProbando] = useState(false);
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null);

  async function refrescar() {
    setCargando(true);
    setMensaje(null);
    try {
      const lista = await listarImpresorasTermicas();
      setImpresoras(lista);
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (hayImpresoraTermicaDisponible()) void refrescar();
  }, []);

  if (!hayImpresoraTermicaDisponible()) return null;

  function elegir(nombre: string) {
    setSeleccionada(nombre);
    seleccionarImpresoraTermica(nombre || null);
    setMensaje(null);
  }

  async function probar() {
    setProbando(true);
    setMensaje(null);
    try {
      await imprimirTermico(generarTicketPrueba());
      setMensaje({ texto: "Ticket de prueba enviado. Revisa la impresora.", error: false });
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : String(e), error: true });
    } finally {
      setProbando(false);
    }
  }

  async function gaveta() {
    setMensaje(null);
    try {
      await abrirGavetaTermica();
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : String(e), error: true });
    }
  }

  return (
    <div style={{ ...s.tarjeta, marginTop: 16 }}>
      <h3 style={{ marginTop: 0 }}>🖨️ Impresora térmica (ESC/POS)</h3>
      <p style={{ color: c.gris, fontSize: 13 }}>
        Selecciona la impresora térmica instalada en Windows para imprimir los tickets directamente,
        sin el diálogo del navegador. Si no seleccionas ninguna, se sigue usando la impresión normal.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <select style={{ ...s.input, minWidth: 240 }} value={seleccionada} onChange={(e) => elegir(e.target.value)}>
          <option value="">(No usar impresora térmica)</option>
          {impresoras.map((nombre) => (
            <option key={nombre} value={nombre}>{nombre}</option>
          ))}
        </select>
        <button type="button" style={s.botonSecundario} disabled={cargando} onClick={() => void refrescar()}>
          {cargando ? "Buscando…" : "🔄 Buscar impresoras"}
        </button>
        <button type="button" style={s.botonSecundario} disabled={!seleccionada || probando} onClick={() => void probar()}>
          {probando ? "Imprimiendo…" : "🖨️ Imprimir ticket de prueba"}
        </button>
        <button type="button" style={s.botonSecundario} disabled={!seleccionada} onClick={() => void gaveta()}>
          💰 Abrir gaveta
        </button>
      </div>
      {impresoras.length === 0 && !cargando && (
        <p style={{ color: c.gris, fontSize: 12, marginTop: 8 }}>
          No se encontró ninguna impresora instalada en Windows. Instala la impresora térmica desde
          Configuración de Windows (Dispositivos e impresoras) y presiona "Buscar impresoras".
        </p>
      )}
      {mensaje && (
        <div style={{ ...s.errorBox, marginTop: 8, ...(mensaje.error ? {} : { background: "#f0fdf4", borderColor: c.verde, color: c.verde }) }}>
          {mensaje.texto}
        </div>
      )}
    </div>
  );
}
