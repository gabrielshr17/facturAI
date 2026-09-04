import { useState, type CSSProperties } from "react";
import { ClipboardList } from "lucide-react";
import { s, c, sombra, money } from "../estilos.js";
import { useAtajosTeclado } from "../hooks/useAtajosTeclado.js";
import { mensajeError } from "../utilidades/errores.js";

/** Qué hacer con la cotización al generarla: imprimirla (térmica/GDI/navegador, § cotizacion.ts) o
 *  solo guardar el PDF (§ mismo concepto que `SalidaCobro` en ModalCobro.tsx). */
export type SalidaCotizacion = "imprimir" | "pdf";

export interface ModalCotizacionProps {
  total: number;
  cantidadArticulos: number;
  notasIniciales?: string;
  onCancelar: () => void;
  /** El padre crea el registro (repo.cotizacion.crear) e imprime/genera el PDF según `salida`. */
  onConfirmar: (notas: string, diasVigencia: number, salida: SalidaCotizacion) => Promise<void>;
}

/** Ventana de cotización (§ Ventas): a diferencia de Cobrar, no cobra nada ni cierra el ticket —
 *  solo guarda un registro con su propio número y genera el PDF para dárselo al cliente. El ticket
 *  se queda abierto tal como estaba, por si la persona sigue agregando artículos o termina cobrando. */
export function ModalCotizacion({
  total,
  cantidadArticulos,
  notasIniciales,
  onCancelar,
  onConfirmar,
}: ModalCotizacionProps) {
  const [notas, setNotas] = useState(notasIniciales ?? "");
  const [diasVigencia, setDiasVigencia] = useState("15");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmar(salida: SalidaCotizacion) {
    setError(null);
    setGuardando(true);
    try {
      await onConfirmar(notas, Number(diasVigencia) || 15, salida);
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setGuardando(false);
    }
  }

  useAtajosTeclado({
    Escape: onCancelar,
    F1: () => {
      if (!guardando) void confirmar("imprimir");
    },
    F2: () => {
      if (!guardando) void confirmar("pdf");
    },
  });

  return (
    <div style={overlay} onClick={onCancelar}>
      <div style={tarjeta} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          <ClipboardList size={18} /> Cotización
        </h3>
        <p style={{ color: c.gris, fontSize: 13, marginTop: 0, marginBottom: 12 }}>
          Genera un PDF con los precios de este ticket para el cliente — no cobra nada ni cierra el ticket.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: `1px solid ${c.borde}`,
          }}
        >
          <span style={{ color: c.gris, fontSize: 14 }}>{cantidadArticulos} artículo(s)</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: c.texto }}>RD$ {money(total)}</span>
        </div>

        <label style={s.label}>Válida por (días)</label>
        <input
          style={{ ...s.input, marginBottom: 12, maxWidth: 100 }}
          type="text"
          inputMode="numeric"
          value={diasVigencia}
          onFocus={(e) => e.target.select()}
          onChange={(e) => setDiasVigencia(e.target.value)}
        />

        <label style={s.label}>Notas</label>
        <textarea
          style={{ ...s.input, minHeight: 50, resize: "vertical" }}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
        />

        {error && (
          <div role="alert" style={s.errorBox}>
            {error}
          </div>
        )}

        <div style={{ ...s.formFooter, flexWrap: "wrap" }}>
          <button style={s.boton} disabled={guardando} onClick={() => confirmar("imprimir")}>
            Generar e imprimir (F1)
          </button>
          <button style={s.botonSecundario} disabled={guardando} onClick={() => confirmar("pdf")}>
            Generar y guardar PDF (F2)
          </button>
          <button style={s.botonSecundario} disabled={guardando} onClick={onCancelar}>
            Cancelar (Esc)
          </button>
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
  zIndex: 100,
};

const tarjeta: CSSProperties = {
  ...s.tarjeta,
  width: 420,
  maxWidth: "90vw",
  maxHeight: "90dvh",
  overflow: "auto",
  border: "none",
  borderRadius: 16,
  boxShadow: sombra.md,
};
